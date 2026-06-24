const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpEmbeddingBenchmarkPath,
    buildNlpEmbeddingModelEvaluationReport,
} = require("./nlpEmbeddingModelEvaluationService");
const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const { ensureDir } = require("../utils/fs");

const SMOKE_GATE_VERSION = 1;

function buildDefaultNlpEmbeddingSmokeGatePath() {
    return path.resolve("out/nlp-runtime-smoke/embedding-smoke-gate.json");
}

function sha256FileWithSize(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: path.resolve(filePath),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function toRelativeHash(entry, workspaceRoot) {
    return {
        path: path.relative(workspaceRoot, entry.path).replace(/\\/g, "/"),
        sha256: entry.sha256,
        byteSize: entry.byteSize,
    };
}

function inputHashesMatch(actual = [], expected = []) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
        return false;
    }
    return expected.every((expectedEntry, index) => {
        const actualEntry = actual[index];
        return actualEntry
            && actualEntry.path === expectedEntry.path
            && actualEntry.sha256 === expectedEntry.sha256
            && actualEntry.byteSize === expectedEntry.byteSize;
    });
}

function buildNlpEmbeddingSmokeGateContext({
    manifestPath = buildDefaultNlpModelManifestPath(),
    benchmarkPath = buildDefaultNlpEmbeddingBenchmarkPath(),
    modelId,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    smokeGatePath = buildDefaultNlpEmbeddingSmokeGatePath(),
    workspaceRoot = process.cwd(),
    loadManifestFn = loadNlpModelManifest,
} = {}) {
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedManifestPath = path.resolve(resolvedWorkspaceRoot, manifestPath);
    const resolvedBenchmarkPath = path.resolve(resolvedWorkspaceRoot, benchmarkPath);
    const resolvedCacheDir = path.resolve(resolvedWorkspaceRoot, cacheDir);
    const manifest = loadManifestFn(resolvedManifestPath);
    const selectedModelId = modelId || Object.entries(manifest.models || {})
        .find(([, model]) => model.status === "active" && model.task === "embedding")?.[0];
    if (!selectedModelId) {
        throw new Error("No embedding model selected and no active embedding model exists in the NLP model manifest.");
    }
    const inputHashes = [
        toRelativeHash(sha256FileWithSize(resolvedManifestPath), resolvedWorkspaceRoot),
        toRelativeHash(sha256FileWithSize(resolvedBenchmarkPath), resolvedWorkspaceRoot),
    ];

    return {
        manifestPath: resolvedManifestPath,
        benchmarkPath: resolvedBenchmarkPath,
        modelId: selectedModelId,
        cacheDir: resolvedCacheDir,
        allowRemoteModels: Boolean(allowRemoteModels),
        smokeGatePath: path.resolve(resolvedWorkspaceRoot, smokeGatePath),
        workspaceRoot: resolvedWorkspaceRoot,
        inputHashes,
    };
}

function tryReadSmokeGateReport(smokeGatePath) {
    if (!fs.existsSync(smokeGatePath)) {
        return null;
    }
    try {
        return JSON.parse(fs.readFileSync(smokeGatePath, "utf8"));
    } catch {
        return null;
    }
}

function reusableSmokeGateReportMatches(report = {}, context = {}) {
    return report.version === SMOKE_GATE_VERSION
        && report.passed === true
        && report.evaluation?.passed === true
        && report.modelId === context.modelId
        && path.resolve(report.cacheDir || "") === context.cacheDir
        && report.allowRemoteModels === context.allowRemoteModels
        && inputHashesMatch(report.inputHashes, context.inputHashes);
}

function buildSmokeGateReport({
    context,
    evaluation,
    skipped = false,
    skipReason = null,
    now = () => new Date(),
} = {}) {
    return {
        version: SMOKE_GATE_VERSION,
        generatedAt: now().toISOString(),
        passed: Boolean(evaluation?.passed),
        skipped,
        skipReason,
        modelId: context.modelId,
        manifestPath: path.relative(context.workspaceRoot, context.manifestPath).replace(/\\/g, "/"),
        benchmarkPath: path.relative(context.workspaceRoot, context.benchmarkPath).replace(/\\/g, "/"),
        cacheDir: context.cacheDir,
        allowRemoteModels: context.allowRemoteModels,
        inputHashes: context.inputHashes,
        evaluation,
        authority: {
            outputAuthority: "assistive_only",
            writesTrackedTemplates: false,
            certifiesCards: false,
            claimsReleaseReadiness: false,
            promotionPolicy: "human_review_required",
        },
    };
}

function writeSmokeGateReport(smokeGatePath, report) {
    ensureDir(path.dirname(path.resolve(smokeGatePath)));
    fs.writeFileSync(path.resolve(smokeGatePath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function buildNlpEmbeddingSmokeGateReport({
    force = false,
    now = () => new Date(),
    buildEvaluationReportFn = buildNlpEmbeddingModelEvaluationReport,
    ...options
} = {}) {
    const context = buildNlpEmbeddingSmokeGateContext(options);
    const reusableReport = force ? null : tryReadSmokeGateReport(context.smokeGatePath);
    if (reusableReport && reusableSmokeGateReportMatches(reusableReport, context)) {
        return {
            ...reusableReport,
            skipped: true,
            skipReason: "unchanged-passing-smoke",
        };
    }

    const evaluation = await buildEvaluationReportFn({
        manifestPath: context.manifestPath,
        benchmarkPath: context.benchmarkPath,
        modelId: context.modelId || undefined,
        cacheDir: context.cacheDir,
        allowRemoteModels: context.allowRemoteModels,
    });
    const report = buildSmokeGateReport({
        context: {
            ...context,
            modelId: evaluation.modelId || context.modelId,
        },
        evaluation,
        skipped: false,
        skipReason: force ? "forced" : null,
        now,
    });

    writeSmokeGateReport(context.smokeGatePath, report);
    return report;
}

function roundMetric(value) {
    return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function formatNlpEmbeddingSmokeGateReport(report = {}) {
    const metrics = report.evaluation?.metrics || {};
    const lines = [
        "Japanese Kanji Builder NLP Embedding Smoke Gate",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Status: ${report.skipped ? "reused unchanged passing smoke" : "ran smoke evaluation"}`,
        report.skipReason ? `Reason: ${report.skipReason}` : null,
        `Model: ${report.evaluation?.modelId || report.modelId || "unknown"}`,
        `Benchmark: ${report.evaluation?.benchmarkId || "unknown"}`,
        `Benchmark path: ${report.benchmarkPath || report.evaluation?.benchmarkPath || "unknown"}`,
        `Cache: ${report.cacheDir || report.evaluation?.cacheDir || "unknown"}`,
        `Remote model download allowed: ${report.allowRemoteModels ? "yes" : "no"}`,
        "",
        "Metrics:",
        `- positive mean: ${roundMetric(metrics.positiveMean)}`,
        `- negative mean: ${roundMetric(metrics.negativeMean)}`,
        `- margin: ${roundMetric(metrics.margin)}`,
        `- positive min: ${roundMetric(metrics.positiveMin)}`,
        `- negative max: ${roundMetric(metrics.negativeMax)}`,
        "",
        "Release boundary:",
        `- smoke gate certifies cards: ${report.authority?.certifiesCards ? "yes" : "no"}`,
        `- smoke gate may write tracked templates directly: ${report.authority?.writesTrackedTemplates ? "yes" : "no"}`,
        `- smoke gate claims release readiness: ${report.authority?.claimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.authority?.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
    ].filter((line) => line !== null);

    return `${lines.join("\n")}\n`;
}

module.exports = {
    SMOKE_GATE_VERSION,
    buildDefaultNlpEmbeddingSmokeGatePath,
    buildNlpEmbeddingSmokeGateContext,
    buildNlpEmbeddingSmokeGateReport,
    formatNlpEmbeddingSmokeGateReport,
    inputHashesMatch,
    reusableSmokeGateReportMatches,
};
