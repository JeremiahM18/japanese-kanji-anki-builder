const {
    buildNlpModelGovernanceReport,
} = require("./nlpModelGovernanceService");
const {
    buildNlpRuntimeDoctorReport,
} = require("./nlpRuntimeDoctorService");
const {
    buildNlpSuggestionArtifactReport,
} = require("./nlpSuggestionArtifactService");
const {
    buildNlpTokenizationArtifactReport,
} = require("./nlpTokenizationArtifactService");
const {
    buildNlpTokenizationAuditReport,
} = require("./nlpTokenizationAuditService");

function captureGateCheck({ id, label, buildReportFn }) {
    try {
        const report = buildReportFn();
        return {
            id,
            label,
            passed: Boolean(report.passed),
            errors: Array.isArray(report.errors) ? report.errors : [],
            report,
        };
    } catch (error) {
        return {
            id,
            label,
            passed: false,
            errors: [error.message],
            report: null,
        };
    }
}

function buildNlpGovernanceGateReport({
    manifestPath,
    suggestionArtifactDir,
    suggestionArtifactPath,
    tokenizationArtifactDir,
    tokenizationArtifactPath,
    workspaceRoot,
    packageJsonPath,
    packageLockJsonPath,
    buildModelReportFn = buildNlpModelGovernanceReport,
    buildSuggestionReportFn = buildNlpSuggestionArtifactReport,
    buildTokenizationReportFn = buildNlpTokenizationArtifactReport,
    buildTokenizationAuditReportFn = buildNlpTokenizationAuditReport,
    buildRuntimeReportFn = buildNlpRuntimeDoctorReport,
} = {}) {
    const checks = [
        captureGateCheck({
            id: "model-manifest",
            label: "NLP model manifest",
            buildReportFn: () => buildModelReportFn({
                manifestPath: manifestPath || undefined,
            }),
        }),
        captureGateCheck({
            id: "suggestion-artifacts",
            label: "NLP suggestion artifacts",
            buildReportFn: () => buildSuggestionReportFn({
                manifestPath: manifestPath || undefined,
                artifactDir: suggestionArtifactDir || undefined,
                artifactPath: suggestionArtifactPath || undefined,
            }),
        }),
        captureGateCheck({
            id: "tokenization-artifacts",
            label: "NLP tokenization artifacts",
            buildReportFn: () => buildTokenizationReportFn({
                manifestPath: manifestPath || undefined,
                artifactDir: tokenizationArtifactDir || undefined,
                artifactPath: tokenizationArtifactPath || undefined,
            }),
        }),
        captureGateCheck({
            id: "tokenization-audit",
            label: "NLP tokenization audit signals",
            buildReportFn: () => buildTokenizationAuditReportFn({
                manifestPath: manifestPath || undefined,
                artifactDir: tokenizationArtifactDir || undefined,
                artifactPath: tokenizationArtifactPath || undefined,
            }),
        }),
        captureGateCheck({
            id: "runtime-readiness",
            label: "NLP runtime readiness",
            buildReportFn: () => buildRuntimeReportFn({
                manifestPath: manifestPath || undefined,
                workspaceRoot: workspaceRoot || undefined,
                packageJsonPath: packageJsonPath || undefined,
                packageLockJsonPath: packageLockJsonPath || undefined,
            }),
        }),
    ];
    const errors = checks.flatMap((check) => check.errors.map((error) => `${check.id}: ${error}`));

    return {
        generatedAt: new Date().toISOString(),
        passed: checks.every((check) => check.passed),
        checks,
        errors,
        releaseBoundary: {
            nlpGateCertifiesCards: false,
            nlpGateWritesTrackedTemplates: false,
            nlpGateClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    };
}

function formatNlpGovernanceGateReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Governance Gate",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        "",
        "Checks:",
    ];

    for (const check of report.checks || []) {
        lines.push(`- ${check.label}: ${check.passed ? "passing" : "failing"}`);
        for (const error of check.errors || []) {
            lines.push(`  - ${error}`);
        }
    }

    lines.push(
        "",
        "Release boundary:",
        `- NLP gate certifies cards: ${report.releaseBoundary?.nlpGateCertifiesCards ? "yes" : "no"}`,
        `- NLP gate writes tracked templates: ${report.releaseBoundary?.nlpGateWritesTrackedTemplates ? "yes" : "no"}`,
        `- NLP gate claims release readiness: ${report.releaseBoundary?.nlpGateClaimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    if ((report.errors || []).length > 0) {
        lines.push("", "Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildNlpGovernanceGateReport,
    captureGateCheck,
    formatNlpGovernanceGateReport,
};
