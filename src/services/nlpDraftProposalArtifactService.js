const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    parseNlpDraftProposalArtifact,
} = require("../datasets/nlpDraftProposalArtifact");
const {
    buildDefaultNlpDraftProposalDir,
} = require("./nlpDraftProposalService");
const { readJsonFile } = require("../utils/jsonFile");

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function resolveNlpDraftProposalArtifactPaths({ artifactPath = null, artifactDir = buildDefaultNlpDraftProposalDir() } = {}) {
    if (artifactPath) {
        const resolvedPath = path.resolve(artifactPath);
        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`NLP draft proposal artifact does not exist: ${resolvedPath}`);
        }
        if (!fs.statSync(resolvedPath).isFile()) {
            throw new Error(`NLP draft proposal artifact path is not a file: ${resolvedPath}`);
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
        throw new Error(`NLP draft proposal artifact directory is not a directory: ${resolvedDir}`);
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

function validateDraftArtifactAgainstManifest(artifact, manifest) {
    const errors = [];
    for (const modelId of artifact.generator.modelIds || []) {
        const model = manifest.models?.[modelId];
        if (!model) {
            errors.push(`generator.modelIds references missing NLP model: ${modelId}`);
            continue;
        }
        if (model.status !== "active") {
            errors.push(`NLP model ${modelId} is ${model.status}; draft proposal artifacts require active source models.`);
        }
        if (!model.allowedUses.includes(artifact.scope.lane)) {
            errors.push(`NLP model ${modelId} does not allow draft lane ${artifact.scope.lane}.`);
        }
        if (model.outputAuthority !== "assistive_only") {
            errors.push(`NLP model ${modelId} does not declare assistive_only output authority.`);
        }
        if (model.promotionPolicy !== "human_review_required") {
            errors.push(`NLP model ${modelId} does not require human review for draft promotion.`);
        }
    }
    return errors;
}

function validateNlpDraftProposalArtifactFile({ filePath, manifest }) {
    const resolvedPath = path.resolve(filePath);
    try {
        const artifact = parseNlpDraftProposalArtifact(readJsonFile(resolvedPath, {
            label: "NLP draft proposal artifact",
        }));
        const errors = validateDraftArtifactAgainstManifest(artifact, manifest);
        const proposalsByKind = {};
        const proposalsByPriority = {};
        for (const proposal of artifact.proposals || []) {
            incrementCount(proposalsByKind, proposal.draftKind);
            incrementCount(proposalsByPriority, proposal.priority);
        }
        return {
            path: resolvedPath,
            passed: errors.length === 0,
            errors,
            generatedAt: artifact.generatedAt,
            modelIds: artifact.generator.modelIds,
            scope: artifact.scope,
            counts: {
                proposals: artifact.counts.proposals,
                proposalsByKind,
                proposalsByPriority,
            },
        };
    } catch (error) {
        return {
            path: resolvedPath,
            passed: false,
            errors: [error.message],
            generatedAt: null,
            modelIds: [],
            scope: null,
            counts: {
                proposals: 0,
                proposalsByKind: {},
                proposalsByPriority: {},
            },
        };
    }
}

function buildNlpDraftProposalArtifactReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpDraftProposalDir(),
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
                proposals: 0,
                proposalsByKind: {},
                proposalsByPriority: {},
            },
            artifacts: [],
            errors: [`NLP model manifest failed validation: ${error.message}`],
            releaseBoundary: {
                draftProposalsAreCertificationEvidence: false,
                draftProposalsMayWriteTrackedTemplatesDirectly: false,
                draftProposalsClaimReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    let resolved;
    try {
        resolved = resolveNlpDraftProposalArtifactPaths({ artifactPath, artifactDir });
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
                proposals: 0,
                proposalsByKind: {},
                proposalsByPriority: {},
            },
            artifacts: [],
            errors: [error.message],
            releaseBoundary: {
                draftProposalsAreCertificationEvidence: false,
                draftProposalsMayWriteTrackedTemplatesDirectly: false,
                draftProposalsClaimReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = resolved.artifactPaths.map((filePath) => validateNlpDraftProposalArtifactFile({ filePath, manifest }));
    const counts = {
        artifacts: artifacts.length,
        proposals: 0,
        proposalsByKind: {},
        proposalsByPriority: {},
    };
    const errors = [];

    for (const artifact of artifacts) {
        counts.proposals += artifact.counts.proposals;
        for (const [kind, count] of Object.entries(artifact.counts.proposalsByKind)) {
            counts.proposalsByKind[kind] = (counts.proposalsByKind[kind] || 0) + count;
        }
        for (const [priority, count] of Object.entries(artifact.counts.proposalsByPriority)) {
            counts.proposalsByPriority[priority] = (counts.proposalsByPriority[priority] || 0) + count;
        }
        for (const error of artifact.errors || []) {
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
            draftProposalsAreCertificationEvidence: false,
            draftProposalsMayWriteTrackedTemplatesDirectly: false,
            draftProposalsClaimReleaseReadiness: false,
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

function formatNlpDraftProposalArtifactReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Draft Proposal Validation",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no draft proposal artifacts to validate)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- proposals: ${report.counts?.proposals || 0}`,
        `- proposals by kind: ${formatCountMap(report.counts?.proposalsByKind)}`,
        `- proposals by priority: ${formatCountMap(report.counts?.proposalsByPriority)}`,
        "",
        "Release boundary:",
        `- draft proposals certify cards: ${report.releaseBoundary?.draftProposalsAreCertificationEvidence ? "yes" : "no"}`,
        `- draft proposals may write tracked templates directly: ${report.releaseBoundary?.draftProposalsMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- draft proposals claim release readiness: ${report.releaseBoundary?.draftProposalsClaimReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.artifacts || []).length > 0) {
        lines.push("", "Artifacts:");
        for (const artifact of report.artifacts) {
            lines.push(`- ${artifact.path}: ${artifact.passed ? "passing" : "failing"}; proposals=${artifact.counts.proposals}; models=${artifact.modelIds.join(", ") || "none"}`);
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
    buildNlpDraftProposalArtifactReport,
    formatNlpDraftProposalArtifactReport,
    resolveNlpDraftProposalArtifactPaths,
    validateNlpDraftProposalArtifactFile,
};
