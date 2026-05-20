const fs = require("node:fs");
const path = require("node:path");

const {
    parseNlpReviewPacketArtifact,
} = require("../datasets/nlpReviewPacketArtifact");
const {
    buildDefaultNlpReviewPacketDir,
} = require("./nlpReviewPacketService");
const { readJsonFile } = require("../utils/jsonFile");

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function resolveNlpReviewPacketArtifactPaths({ artifactPath = null, artifactDir = buildDefaultNlpReviewPacketDir() } = {}) {
    if (artifactPath) {
        const resolvedPath = path.resolve(artifactPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`NLP review packet artifact does not exist: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
            throw new Error(`NLP review packet artifact path is not a file: ${resolvedPath}`);
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
        throw new Error(`NLP review packet artifact directory is not a directory: ${resolvedDir}`);
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

function validateNlpReviewPacketArtifactFile(filePath) {
    const resolvedPath = path.resolve(filePath);
    try {
        const artifact = parseNlpReviewPacketArtifact(readJsonFile(resolvedPath, {
            label: "NLP review packet artifact",
        }));
        const packetsByPriority = {};
        for (const packet of artifact.packets || []) {
            incrementCount(packetsByPriority, packet.priority);
        }
        return {
            path: resolvedPath,
            passed: true,
            errors: [],
            generatedAt: artifact.generatedAt,
            scope: artifact.scope,
            counts: {
                packets: artifact.counts.packets,
                suggestions: artifact.counts.suggestions,
                tokenizationSignals: artifact.counts.tokenizationSignals,
                packetsByPriority,
            },
        };
    } catch (error) {
        return {
            path: resolvedPath,
            passed: false,
            errors: [error.message],
            generatedAt: null,
            scope: null,
            counts: {
                packets: 0,
                suggestions: 0,
                tokenizationSignals: 0,
                packetsByPriority: {},
            },
        };
    }
}

function buildNlpReviewPacketArtifactReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpReviewPacketDir(),
} = {}) {
    let resolved;
    try {
        resolved = resolveNlpReviewPacketArtifactPaths({ artifactPath, artifactDir });
    } catch (error) {
        return {
            generatedAt: new Date().toISOString(),
            passed: false,
            artifactDir: artifactPath ? null : path.resolve(artifactDir),
            artifactPath: artifactPath ? path.resolve(artifactPath) : null,
            missingArtifactDir: false,
            counts: {
                artifacts: 0,
                packets: 0,
                suggestions: 0,
                tokenizationSignals: 0,
                packetsByPriority: {},
            },
            artifacts: [],
            errors: [error.message],
            releaseBoundary: {
                reviewPacketsAreCertificationEvidence: false,
                reviewPacketsMayWriteTrackedTemplatesDirectly: false,
                reviewPacketsClaimReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = resolved.artifactPaths.map(validateNlpReviewPacketArtifactFile);
    const counts = {
        artifacts: artifacts.length,
        packets: 0,
        suggestions: 0,
        tokenizationSignals: 0,
        packetsByPriority: {},
    };
    const errors = [];

    for (const artifact of artifacts) {
        counts.packets += artifact.counts.packets;
        counts.suggestions += artifact.counts.suggestions;
        counts.tokenizationSignals += artifact.counts.tokenizationSignals;
        for (const [priority, count] of Object.entries(artifact.counts.packetsByPriority)) {
            counts.packetsByPriority[priority] = (counts.packetsByPriority[priority] || 0) + count;
        }
        for (const error of artifact.errors || []) {
            errors.push(`${artifact.path}: ${error}`);
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        passed: errors.length === 0,
        artifactDir: resolved.artifactDir,
        artifactPath: artifactPath ? path.resolve(artifactPath) : null,
        missingArtifactDir: resolved.missingArtifactDir,
        counts,
        artifacts,
        errors,
        releaseBoundary: {
            reviewPacketsAreCertificationEvidence: false,
            reviewPacketsMayWriteTrackedTemplatesDirectly: false,
            reviewPacketsClaimReleaseReadiness: false,
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

function formatNlpReviewPacketArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Review Packet Validation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no review packets to validate)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- packets: ${report.counts?.packets || 0}`,
        `- suggestions: ${report.counts?.suggestions || 0}`,
        `- tokenization signals: ${report.counts?.tokenizationSignals || 0}`,
        `- packets by priority: ${formatCountMap(report.counts?.packetsByPriority)}`,
        "",
        "Release boundary:",
        `- review packets certify cards: ${report.releaseBoundary?.reviewPacketsAreCertificationEvidence ? "yes" : "no"}`,
        `- review packets may write tracked templates directly: ${report.releaseBoundary?.reviewPacketsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- review packets claim release readiness: ${report.releaseBoundary?.reviewPacketsClaimReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.artifacts || []).length > 0) {
        lines.push("", "Artifacts:");
        for (const artifact of report.artifacts) {
            lines.push(`- ${artifact.path}: ${artifact.passed ? "passing" : "failing"}; packets=${artifact.counts.packets}`);
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
    buildNlpReviewPacketArtifactReport,
    formatNlpReviewPacketArtifactReport,
    resolveNlpReviewPacketArtifactPaths,
    validateNlpReviewPacketArtifactFile,
};
