const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    parseNlpSuggestionArtifact,
} = require("../datasets/nlpSuggestionArtifact");

function buildDefaultNlpSuggestionDir() {
    return path.resolve(__dirname, "../../out/nlp-suggestions");
}

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveNlpSuggestionArtifactPaths({ artifactPath = null, artifactDir = buildDefaultNlpSuggestionDir() } = {}) {
    if (artifactPath) {
        const resolvedPath = path.resolve(artifactPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`NLP suggestion artifact does not exist: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
            throw new Error(`NLP suggestion artifact path is not a file: ${resolvedPath}`);
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
        throw new Error(`NLP suggestion artifact directory is not a directory: ${resolvedDir}`);
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

function validateArtifactAgainstManifest(artifact, manifest) {
    const errors = [];

    if (artifact.suggestions.length === 0) {
        return errors;
    }

    const modelId = artifact.generator.modelId;
    const model = manifest.models?.[modelId];
    if (!model) {
        errors.push(`generator.modelId references missing NLP model: ${modelId}`);
        return errors;
    }

    if (model.status !== "active") {
        errors.push(`NLP model ${modelId} is ${model.status}; suggestion artifacts require an active model.`);
    }
    if (model.outputAuthority !== "assistive_only") {
        errors.push(`NLP model ${modelId} does not declare assistive_only output authority.`);
    }
    if (model.promotionPolicy !== "human_review_required") {
        errors.push(`NLP model ${modelId} does not require human review for promotion.`);
    }
    if (!model.allowedUses.includes(artifact.scope.lane)) {
        errors.push(`NLP model ${modelId} does not allow artifact lane ${artifact.scope.lane}.`);
    }

    for (const suggestion of artifact.suggestions) {
        if (!model.allowedUses.includes(suggestion.task)) {
            errors.push(`NLP suggestion ${suggestion.id} uses task ${suggestion.task}, which model ${modelId} does not allow.`);
        }
    }

    return errors;
}

function validateNlpSuggestionArtifactFile({ filePath, manifest }) {
    const resolvedPath = path.resolve(filePath);
    try {
        const artifact = parseNlpSuggestionArtifact(readJsonFile(resolvedPath));
        const errors = validateArtifactAgainstManifest(artifact, manifest);
        const suggestionsByTask = {};
        const suggestionsByDeckKind = {};
        for (const suggestion of artifact.suggestions) {
            incrementCount(suggestionsByTask, suggestion.task);
            incrementCount(suggestionsByDeckKind, suggestion.target.deckKind);
        }

        return {
            path: resolvedPath,
            passed: errors.length === 0,
            errors,
            generatedAt: artifact.generatedAt,
            modelId: artifact.generator.modelId || null,
            scope: artifact.scope,
            counts: {
                suggestions: artifact.suggestions.length,
                suggestionsByTask,
                suggestionsByDeckKind,
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
            counts: {
                suggestions: 0,
                suggestionsByTask: {},
                suggestionsByDeckKind: {},
            },
        };
    }
}

function buildNlpSuggestionArtifactReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpSuggestionDir(),
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
            counts: {
                artifacts: 0,
                suggestions: 0,
                suggestionsByTask: {},
                suggestionsByDeckKind: {},
            },
            artifacts: [],
            errors: [`NLP model manifest failed validation: ${error.message}`],
            releaseBoundary: {
                suggestionArtifactsAreCertificationEvidence: false,
                suggestionArtifactsMayWriteTrackedTemplatesDirectly: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    let resolved;
    try {
        resolved = resolveNlpSuggestionArtifactPaths({ artifactPath, artifactDir });
    } catch (error) {
        return {
            generatedAt: new Date().toISOString(),
            passed: false,
            manifestPath: manifest.manifestPath || path.resolve(manifestPath),
            artifactDir: artifactPath ? null : path.resolve(artifactDir),
            artifactPath: artifactPath ? path.resolve(artifactPath) : null,
            missingArtifactDir: false,
            counts: {
                artifacts: 0,
                suggestions: 0,
                suggestionsByTask: {},
                suggestionsByDeckKind: {},
            },
            artifacts: [],
            errors: [error.message],
            releaseBoundary: {
                suggestionArtifactsAreCertificationEvidence: false,
                suggestionArtifactsMayWriteTrackedTemplatesDirectly: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = resolved.artifactPaths.map((filePath) => validateNlpSuggestionArtifactFile({ filePath, manifest }));
    const counts = {
        artifacts: artifacts.length,
        suggestions: 0,
        suggestionsByTask: {},
        suggestionsByDeckKind: {},
    };
    const errors = [];

    for (const artifact of artifacts) {
        counts.suggestions += artifact.counts.suggestions;
        for (const [task, count] of Object.entries(artifact.counts.suggestionsByTask)) {
            counts.suggestionsByTask[task] = (counts.suggestionsByTask[task] || 0) + count;
        }
        for (const [deckKind, count] of Object.entries(artifact.counts.suggestionsByDeckKind)) {
            counts.suggestionsByDeckKind[deckKind] = (counts.suggestionsByDeckKind[deckKind] || 0) + count;
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
            suggestionArtifactsAreCertificationEvidence: false,
            suggestionArtifactsMayWriteTrackedTemplatesDirectly: false,
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

function formatNlpSuggestionArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Suggestion Artifact Validation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no suggestion artifacts to validate)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- suggestions: ${report.counts?.suggestions || 0}`,
        `- suggestions by task: ${formatCountMap(report.counts?.suggestionsByTask)}`,
        `- suggestions by deck kind: ${formatCountMap(report.counts?.suggestionsByDeckKind)}`,
        "",
        "Release boundary:",
        `- suggestion artifacts certify cards: ${report.releaseBoundary?.suggestionArtifactsAreCertificationEvidence ? "yes" : "no"}`,
        `- suggestion artifacts may write tracked templates directly: ${report.releaseBoundary?.suggestionArtifactsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.artifacts || []).length > 0) {
        lines.push("", "Artifacts:");
        for (const artifact of report.artifacts) {
            lines.push(`- ${artifact.path}: ${artifact.passed ? "passing" : "failing"}; suggestions=${artifact.counts.suggestions}; model=${artifact.modelId || "none"}`);
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
    buildDefaultNlpSuggestionDir,
    buildNlpSuggestionArtifactReport,
    formatNlpSuggestionArtifactReport,
    resolveNlpSuggestionArtifactPaths,
    validateNlpSuggestionArtifactFile,
};
