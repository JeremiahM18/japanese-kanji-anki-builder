const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    parseNlpTokenizationArtifact,
} = require("../datasets/nlpTokenizationArtifact");
const {
    readJsonFile,
} = require("../utils/jsonFile");

function buildDefaultNlpTokenizationDir() {
    return path.resolve(__dirname, "../../out/nlp-tokenization");
}

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function resolveNlpTokenizationArtifactPaths({ artifactPath = null, artifactDir = buildDefaultNlpTokenizationDir() } = {}) {
    if (artifactPath) {
        const resolvedPath = path.resolve(artifactPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`NLP tokenization artifact does not exist: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
            throw new Error(`NLP tokenization artifact path is not a file: ${resolvedPath}`);
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
        throw new Error(`NLP tokenization artifact directory is not a directory: ${resolvedDir}`);
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

function validateTokenizationArtifactAgainstManifest(artifact, manifest) {
    const errors = [];

    if (artifact.items.length === 0) {
        return errors;
    }

    const runtimeId = artifact.generator.runtimeId;
    const runtime = manifest.runtimes?.[runtimeId];
    if (!runtime) {
        errors.push(`generator.runtimeId references missing NLP runtime: ${runtimeId}`);
        return errors;
    }

    if (runtime.status !== "active") {
        errors.push(`NLP runtime ${runtimeId} is ${runtime.status}; tokenization artifacts require an active runtime.`);
    }
    if (runtime.licenseUse?.status !== "approved") {
        errors.push(`NLP runtime ${runtimeId} does not have approved license/use status.`);
    }
    if (!runtime.allowedTasks.includes("tokenization")) {
        errors.push(`NLP runtime ${runtimeId} does not allow tokenization.`);
    }
    if (runtime.packageName && artifact.runtime.packageName && runtime.packageName !== artifact.runtime.packageName) {
        errors.push(`NLP runtime ${runtimeId} package mismatch: manifest ${runtime.packageName}, artifact ${artifact.runtime.packageName}.`);
    }

    return errors;
}

function validateNlpTokenizationArtifactFile({ filePath, manifest }) {
    const resolvedPath = path.resolve(filePath);
    try {
        const artifact = parseNlpTokenizationArtifact(readJsonFile(resolvedPath, {
            label: "NLP tokenization artifact",
        }));
        const errors = validateTokenizationArtifactAgainstManifest(artifact, manifest);
        const itemsByTargetKind = {};
        let tokenCount = 0;
        for (const item of artifact.items) {
            incrementCount(itemsByTargetKind, item.target.kind);
            tokenCount += item.tokens.length;
        }

        return {
            path: resolvedPath,
            passed: errors.length === 0,
            errors,
            generatedAt: artifact.generatedAt,
            runtimeId: artifact.generator.runtimeId || null,
            scope: artifact.scope,
            counts: {
                items: artifact.items.length,
                tokens: tokenCount,
                itemsByTargetKind,
            },
        };
    } catch (error) {
        return {
            path: resolvedPath,
            passed: false,
            errors: [error.message],
            generatedAt: null,
            runtimeId: null,
            scope: null,
            counts: {
                items: 0,
                tokens: 0,
                itemsByTargetKind: {},
            },
        };
    }
}

function buildNlpTokenizationArtifactReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpTokenizationDir(),
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
                items: 0,
                tokens: 0,
                itemsByTargetKind: {},
            },
            artifacts: [],
            errors: [`NLP model manifest failed validation: ${error.message}`],
            releaseBoundary: {
                tokenizationArtifactsAreCertificationEvidence: false,
                tokenizationArtifactsMayWriteTrackedTemplatesDirectly: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    let resolved;
    try {
        resolved = resolveNlpTokenizationArtifactPaths({ artifactPath, artifactDir });
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
                items: 0,
                tokens: 0,
                itemsByTargetKind: {},
            },
            artifacts: [],
            errors: [error.message],
            releaseBoundary: {
                tokenizationArtifactsAreCertificationEvidence: false,
                tokenizationArtifactsMayWriteTrackedTemplatesDirectly: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = resolved.artifactPaths.map((filePath) => validateNlpTokenizationArtifactFile({ filePath, manifest }));
    const counts = {
        artifacts: artifacts.length,
        items: 0,
        tokens: 0,
        itemsByTargetKind: {},
    };
    const errors = [];

    for (const artifact of artifacts) {
        counts.items += artifact.counts.items;
        counts.tokens += artifact.counts.tokens;
        for (const [targetKind, count] of Object.entries(artifact.counts.itemsByTargetKind)) {
            counts.itemsByTargetKind[targetKind] = (counts.itemsByTargetKind[targetKind] || 0) + count;
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
            tokenizationArtifactsAreCertificationEvidence: false,
            tokenizationArtifactsMayWriteTrackedTemplatesDirectly: false,
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

function formatNlpTokenizationArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Tokenization Artifact Validation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no tokenization artifacts to validate)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- items: ${report.counts?.items || 0}`,
        `- tokens: ${report.counts?.tokens || 0}`,
        `- items by target kind: ${formatCountMap(report.counts?.itemsByTargetKind)}`,
        "",
        "Release boundary:",
        `- tokenization artifacts certify cards: ${report.releaseBoundary?.tokenizationArtifactsAreCertificationEvidence ? "yes" : "no"}`,
        `- tokenization artifacts may write tracked templates directly: ${report.releaseBoundary?.tokenizationArtifactsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.artifacts || []).length > 0) {
        lines.push("", "Artifacts:");
        for (const artifact of report.artifacts) {
            lines.push(`- ${artifact.path}: ${artifact.passed ? "passing" : "failing"}; items=${artifact.counts.items}; tokens=${artifact.counts.tokens}; runtime=${artifact.runtimeId || "none"}`);
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
    buildDefaultNlpTokenizationDir,
    buildNlpTokenizationArtifactReport,
    formatNlpTokenizationArtifactReport,
    resolveNlpTokenizationArtifactPaths,
    validateNlpTokenizationArtifactFile,
};
