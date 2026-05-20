const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    parseNlpEmbeddingArtifact,
} = require("../datasets/nlpEmbeddingArtifact");
const {
    readJsonFile,
} = require("../utils/jsonFile");

function buildDefaultNlpEmbeddingDir() {
    return path.resolve(__dirname, "../../out/nlp-embeddings");
}

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function resolveNlpEmbeddingArtifactPaths({ artifactPath = null, artifactDir = buildDefaultNlpEmbeddingDir() } = {}) {
    if (artifactPath) {
        const resolvedPath = path.resolve(artifactPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`NLP embedding artifact does not exist: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
            throw new Error(`NLP embedding artifact path is not a file: ${resolvedPath}`);
        }
        return {
            artifactDir: null,
            artifactPaths: [resolvedPath],
            missingArtifactDir: false,
        };
    }

    const resolvedDir = path.resolve(artifactDir);
    if (!fs.existsSync(resolvedDir)) {
        return {
            artifactDir: resolvedDir,
            artifactPaths: [],
            missingArtifactDir: true,
        };
    }
    if (!fs.statSync(resolvedDir).isDirectory()) {
        throw new Error(`NLP embedding artifact directory is not a directory: ${resolvedDir}`);
    }

    const artifactPaths = fs.readdirSync(resolvedDir)
        .filter((entry) => entry.endsWith(".json"))
        .sort((a, b) => a.localeCompare(b))
        .map((entry) => path.join(resolvedDir, entry));

    return {
        artifactDir: resolvedDir,
        artifactPaths,
        missingArtifactDir: false,
    };
}

function validateEmbeddingArtifactAgainstManifest(artifact, manifest) {
    const errors = [];

    if (artifact.items.length === 0) {
        return errors;
    }

    const modelId = artifact.generator.modelId;
    const model = manifest.models?.[modelId];
    if (!model) {
        errors.push(`generator.modelId references missing NLP model: ${modelId}`);
        return errors;
    }

    if (model.status !== "active") {
        errors.push(`NLP model ${modelId} is ${model.status}; embedding artifacts require an active model.`);
    }
    if (model.task !== "embedding") {
        errors.push(`NLP model ${modelId} task is ${model.task}; embedding artifacts require an embedding model.`);
    }
    if (model.runtimeId !== artifact.model.runtimeId) {
        errors.push(`NLP model ${modelId} runtime mismatch: manifest ${model.runtimeId}, artifact ${artifact.model.runtimeId}.`);
    }
    if (model.modelFamily && model.modelFamily !== artifact.model.modelFamily) {
        errors.push(`NLP model ${modelId} family mismatch: manifest ${model.modelFamily}, artifact ${artifact.model.modelFamily}.`);
    }
    if (model.modelVersion && model.modelVersion !== artifact.model.modelVersion) {
        errors.push(`NLP model ${modelId} version mismatch: manifest ${model.modelVersion}, artifact ${artifact.model.modelVersion}.`);
    }
    if (model.outputAuthority !== "assistive_only") {
        errors.push(`NLP model ${modelId} does not declare assistive_only output authority.`);
    }
    if (model.promotionPolicy !== "human_review_required") {
        errors.push(`NLP model ${modelId} does not require human review for promotion.`);
    }
    if (!model.allowedUses.includes(artifact.scope.lane)) {
        errors.push(`NLP model ${modelId} does not allow embedding artifact lane ${artifact.scope.lane}.`);
    }

    return errors;
}

function validateNlpEmbeddingArtifactFile({ filePath, manifest }) {
    const resolvedPath = path.resolve(filePath);
    try {
        const artifact = parseNlpEmbeddingArtifact(readJsonFile(resolvedPath, {
            label: "NLP embedding artifact",
        }));
        const errors = validateEmbeddingArtifactAgainstManifest(artifact, manifest);
        const itemsByTargetKind = {};
        const itemsByLevel = {};
        const itemsByLane = {};
        const itemsByModel = {};

        for (const item of artifact.items) {
            incrementCount(itemsByTargetKind, item.target.kind);
            incrementCount(itemsByLane, artifact.scope.lane);
            incrementCount(itemsByModel, artifact.model.modelId);
            if (Number.isInteger(item.target.level)) {
                incrementCount(itemsByLevel, `N${item.target.level}`);
            }
        }

        return {
            path: resolvedPath,
            passed: errors.length === 0,
            errors,
            generatedAt: artifact.generatedAt,
            modelId: artifact.generator.modelId || null,
            scope: artifact.scope,
            embeddingDimension: artifact.model.embeddingDimension,
            counts: {
                items: artifact.items.length,
                itemsByTargetKind,
                itemsByLevel,
                itemsByLane,
                itemsByModel,
            },
        };
    } catch (error) {
        return {
            path: resolvedPath,
            passed: false,
            errors: [error.message],
            generatedAt: null,
            modelId: null,
            scope: null,
            embeddingDimension: null,
            counts: {
                items: 0,
                itemsByTargetKind: {},
                itemsByLevel: {},
                itemsByLane: {},
                itemsByModel: {},
            },
        };
    }
}

function buildEmptyCounts() {
    return {
        artifacts: 0,
        items: 0,
        itemsByTargetKind: {},
        itemsByLevel: {},
        itemsByLane: {},
        itemsByModel: {},
    };
}

function buildNlpEmbeddingArtifactReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpEmbeddingDir(),
    manifestPath = buildDefaultNlpModelManifestPath(),
    loadManifestFn = loadNlpModelManifest,
} = {}) {
    let manifest;
    try {
        manifest = loadManifestFn(manifestPath);
    } catch (error) {
        return {
            generatedAt: new Date().toISOString(),
            passed: false,
            manifestPath: path.resolve(manifestPath),
            artifactDir: artifactPath ? null : path.resolve(artifactDir),
            artifactPath: artifactPath ? path.resolve(artifactPath) : null,
            missingArtifactDir: false,
            counts: buildEmptyCounts(),
            artifacts: [],
            errors: [`NLP model manifest failed validation: ${error.message}`],
            releaseBoundary: {
                embeddingArtifactsAreCertificationEvidence: false,
                embeddingArtifactsMayWriteTrackedTemplatesDirectly: false,
                embeddingArtifactsClaimReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    let resolved;
    try {
        resolved = resolveNlpEmbeddingArtifactPaths({ artifactPath, artifactDir });
    } catch (error) {
        return {
            generatedAt: new Date().toISOString(),
            passed: false,
            manifestPath: manifest.manifestPath || path.resolve(manifestPath),
            artifactDir: artifactPath ? null : path.resolve(artifactDir),
            artifactPath: artifactPath ? path.resolve(artifactPath) : null,
            missingArtifactDir: false,
            counts: buildEmptyCounts(),
            artifacts: [],
            errors: [error.message],
            releaseBoundary: {
                embeddingArtifactsAreCertificationEvidence: false,
                embeddingArtifactsMayWriteTrackedTemplatesDirectly: false,
                embeddingArtifactsClaimReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = resolved.artifactPaths.map((filePath) => validateNlpEmbeddingArtifactFile({ filePath, manifest }));
    const counts = buildEmptyCounts();
    const errors = [];

    counts.artifacts = artifacts.length;
    for (const artifact of artifacts) {
        counts.items += artifact.counts.items;
        for (const [targetKind, count] of Object.entries(artifact.counts.itemsByTargetKind)) {
            counts.itemsByTargetKind[targetKind] = (counts.itemsByTargetKind[targetKind] || 0) + count;
        }
        for (const [level, count] of Object.entries(artifact.counts.itemsByLevel)) {
            counts.itemsByLevel[level] = (counts.itemsByLevel[level] || 0) + count;
        }
        for (const [lane, count] of Object.entries(artifact.counts.itemsByLane)) {
            counts.itemsByLane[lane] = (counts.itemsByLane[lane] || 0) + count;
        }
        for (const [modelId, count] of Object.entries(artifact.counts.itemsByModel)) {
            counts.itemsByModel[modelId] = (counts.itemsByModel[modelId] || 0) + count;
        }
        for (const error of artifact.errors) {
            errors.push(`${artifact.path}: ${error}`);
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        passed: errors.length === 0,
        manifestPath: manifest.manifestPath || path.resolve(manifestPath),
        artifactDir: resolved.artifactDir,
        artifactPath: artifactPath ? path.resolve(artifactPath) : null,
        missingArtifactDir: resolved.missingArtifactDir,
        counts,
        artifacts,
        errors,
        releaseBoundary: {
            embeddingArtifactsAreCertificationEvidence: false,
            embeddingArtifactsMayWriteTrackedTemplatesDirectly: false,
            embeddingArtifactsClaimReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    };
}

function formatCountMap(counts = {}) {
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
        return "none";
    }
    return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

function formatNlpEmbeddingArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Embedding Artifact Validation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no embedding artifacts to validate)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- items: ${report.counts?.items || 0}`,
        `- items by target kind: ${formatCountMap(report.counts?.itemsByTargetKind)}`,
        `- items by level: ${formatCountMap(report.counts?.itemsByLevel)}`,
        `- items by lane: ${formatCountMap(report.counts?.itemsByLane)}`,
        `- items by model: ${formatCountMap(report.counts?.itemsByModel)}`,
        "",
        "Release boundary:",
        `- embedding artifacts certify cards: ${report.releaseBoundary?.embeddingArtifactsAreCertificationEvidence ? "yes" : "no"}`,
        `- embedding artifacts may write tracked templates directly: ${report.releaseBoundary?.embeddingArtifactsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- embedding artifacts claim release readiness: ${report.releaseBoundary?.embeddingArtifactsClaimReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.artifacts || []).length > 0) {
        lines.push("", "Artifacts:");
        for (const artifact of report.artifacts) {
            lines.push(`- ${artifact.path}: ${artifact.passed ? "passing" : "failing"}; items=${artifact.counts.items}; dimension=${artifact.embeddingDimension || "none"}; model=${artifact.modelId || "none"}`);
            for (const error of artifact.errors || []) {
                lines.push(`  - ${error}`);
            }
        }
    }

    if ((report.errors || []).length > 0) {
        lines.push("", "Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildDefaultNlpEmbeddingDir,
    buildNlpEmbeddingArtifactReport,
    formatNlpEmbeddingArtifactReport,
    resolveNlpEmbeddingArtifactPaths,
    validateEmbeddingArtifactAgainstManifest,
    validateNlpEmbeddingArtifactFile,
};
