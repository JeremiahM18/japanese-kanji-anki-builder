const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    parseNlpEmbeddingBenchmark,
} = require("../datasets/nlpEmbeddingBenchmark");
const {
    readJsonFile,
} = require("../utils/jsonFile");

function buildDefaultNlpEmbeddingBenchmarkPath() {
    return path.resolve(__dirname, "../../templates/nlp_embedding_model_benchmark.json");
}

function cosineSimilarity(vectorA = [], vectorB = []) {
    if (vectorA.length !== vectorB.length) {
        throw new Error(`Cannot compare embedding dimensions ${vectorA.length} and ${vectorB.length}.`);
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let index = 0; index < vectorA.length; index += 1) {
        const a = vectorA[index];
        const b = vectorB[index];
        dot += a * b;
        normA += a * a;
        normB += b * b;
    }

    if (normA === 0 || normB === 0) {
        throw new Error("Cannot compare zero-magnitude embeddings.");
    }

    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function average(values = []) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function collectUniqueTexts(pairs = []) {
    const seen = new Set();
    const texts = [];
    for (const pair of pairs) {
        for (const text of [pair.textA, pair.textB]) {
            if (!seen.has(text)) {
                seen.add(text);
                texts.push(text);
            }
        }
    }
    return texts;
}

async function evaluateEmbeddingBenchmark({ benchmark, embedTextFn }) {
    const textVectors = new Map();
    for (const text of collectUniqueTexts(benchmark.pairs)) {
        const vector = await embedTextFn(text);
        textVectors.set(text, vector);
    }

    const pairs = benchmark.pairs.map((pair) => ({
        ...pair,
        cosine: cosineSimilarity(textVectors.get(pair.textA), textVectors.get(pair.textB)),
    }));
    const positiveScores = pairs
        .filter((pair) => pair.label === "positive")
        .map((pair) => pair.cosine);
    const negativeScores = pairs
        .filter((pair) => pair.label === "negative")
        .map((pair) => pair.cosine);
    const metrics = {
        positiveMean: average(positiveScores),
        negativeMean: average(negativeScores),
        margin: average(positiveScores) - average(negativeScores),
        positiveMin: Math.min(...positiveScores),
        negativeMax: Math.max(...negativeScores),
    };
    const thresholdResults = {
        minimumMargin: metrics.margin >= benchmark.thresholds.minimumMargin,
        positiveMinAboveNegativeMax: !benchmark.thresholds.requirePositiveMinAboveNegativeMax
            || metrics.positiveMin > metrics.negativeMax,
    };

    return {
        benchmarkId: benchmark.benchmarkId,
        description: benchmark.description,
        passed: Object.values(thresholdResults).every(Boolean),
        metrics,
        thresholdResults,
        pairs,
        limitations: benchmark.limitations,
    };
}

async function loadTransformersFeatureExtractor({
    model,
    cacheDir,
    allowRemoteModels = false,
} = {}) {
    if (!model?.origin?.huggingFaceModelId) {
        throw new Error("NLP embedding model must declare origin.huggingFaceModelId.");
    }
    if (!model.embeddingConfig) {
        throw new Error("NLP embedding model must declare embeddingConfig.");
    }

    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = path.resolve(cacheDir);
    env.allowLocalModels = true;
    env.allowRemoteModels = Boolean(allowRemoteModels);

    return pipeline("feature-extraction", model.origin.huggingFaceModelId, {
        dtype: model.embeddingConfig.dtype,
    });
}

async function buildTransformersEmbedTextFn({
    model,
    cacheDir,
    allowRemoteModels = false,
} = {}) {
    const extractor = await loadTransformersFeatureExtractor({
        model,
        cacheDir,
        allowRemoteModels,
    });
    return async (text) => {
        const output = await extractor(text, {
            pooling: model.embeddingConfig.pooling === "model-default" ? undefined : model.embeddingConfig.pooling,
            normalize: model.embeddingConfig.normalized,
        });
        return Array.from(output.data);
    };
}

async function buildNlpEmbeddingModelEvaluationReport({
    manifestPath = buildDefaultNlpModelManifestPath(),
    benchmarkPath = buildDefaultNlpEmbeddingBenchmarkPath(),
    modelId,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    loadManifestFn = loadNlpModelManifest,
    readJsonFileFn = readJsonFile,
    buildEmbedTextFn = buildTransformersEmbedTextFn,
} = {}) {
    const manifest = loadManifestFn(manifestPath);
    const benchmark = parseNlpEmbeddingBenchmark(readJsonFileFn(benchmarkPath, {
        label: "NLP embedding benchmark",
    }));
    const selectedModelId = modelId || Object.entries(manifest.models || {})
        .find(([, model]) => model.status === "active" && model.task === "embedding")?.[0];

    if (!selectedModelId) {
        throw new Error("No embedding model selected and no active embedding model exists in the NLP model manifest.");
    }

    const model = manifest.models?.[selectedModelId];
    if (!model) {
        throw new Error(`NLP embedding model not found in manifest: ${selectedModelId}`);
    }
    if (model.task !== "embedding") {
        throw new Error(`NLP model ${selectedModelId} task is ${model.task}; expected embedding.`);
    }

    const embedTextFn = await buildEmbedTextFn({
        model,
        cacheDir,
        allowRemoteModels,
    });
    const result = await evaluateEmbeddingBenchmark({ benchmark, embedTextFn });

    return {
        generatedAt: new Date().toISOString(),
        manifestPath: manifest.manifestPath || path.resolve(manifestPath),
        benchmarkPath: path.resolve(benchmarkPath),
        modelId: selectedModelId,
        model: {
            runtimeId: model.runtimeId,
            modelFamily: model.modelFamily,
            modelVersion: model.modelVersion,
            huggingFaceModelId: model.origin?.huggingFaceModelId || null,
            embeddingConfig: model.embeddingConfig || null,
        },
        cacheDir: path.resolve(cacheDir),
        allowRemoteModels: Boolean(allowRemoteModels),
        ...result,
        releaseBoundary: {
            evaluationCertifiesCards: false,
            evaluationMayWriteTrackedTemplatesDirectly: false,
            evaluationClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    };
}

function roundMetric(value) {
    return Math.round(value * 1000000) / 1000000;
}

function formatNlpEmbeddingModelEvaluationReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Embedding Model Evaluation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Model: ${report.modelId || "unknown"}`,
        `Benchmark: ${report.benchmarkId || "unknown"}`,
        `Benchmark path: ${report.benchmarkPath || "unknown"}`,
        `Cache: ${report.cacheDir || "unknown"}`,
        `Remote model download allowed: ${report.allowRemoteModels ? "yes" : "no"}`,
        "",
        "Metrics:",
        `- positive mean: ${roundMetric(report.metrics?.positiveMean || 0)}`,
        `- negative mean: ${roundMetric(report.metrics?.negativeMean || 0)}`,
        `- margin: ${roundMetric(report.metrics?.margin || 0)}`,
        `- positive min: ${roundMetric(report.metrics?.positiveMin || 0)}`,
        `- negative max: ${roundMetric(report.metrics?.negativeMax || 0)}`,
        "",
        "Release boundary:",
        `- evaluation certifies cards: ${report.releaseBoundary?.evaluationCertifiesCards ? "yes" : "no"}`,
        `- evaluation may write tracked templates directly: ${report.releaseBoundary?.evaluationMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- evaluation claims release readiness: ${report.releaseBoundary?.evaluationClaimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`,
    ];

    if ((report.pairs || []).length > 0) {
        lines.push("", "Pairs:");
        for (const pair of report.pairs) {
            lines.push(`- ${pair.id}: ${pair.label}; cosine=${roundMetric(pair.cosine)}; ${pair.rationale}`);
        }
    }

    if ((report.limitations || []).length > 0) {
        lines.push("", "Limitations:");
        for (const limitation of report.limitations) {
            lines.push(`- ${limitation}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function writeEvaluationReport(filePath, report) {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    fs.writeFileSync(path.resolve(filePath), `${JSON.stringify(report, null, 2)}\n`);
}

module.exports = {
    buildDefaultNlpEmbeddingBenchmarkPath,
    buildNlpEmbeddingModelEvaluationReport,
    buildTransformersEmbedTextFn,
    cosineSimilarity,
    evaluateEmbeddingBenchmark,
    formatNlpEmbeddingModelEvaluationReport,
    writeEvaluationReport,
};
