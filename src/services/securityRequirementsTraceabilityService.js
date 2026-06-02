const fs = require("node:fs");
const path = require("node:path");

const { loadSecurityRequirementsTraceability } = require("../datasets/securityRequirementsTraceability");

const VALID_PRIORITIES = Object.freeze(new Set(["P0", "P1", "P2", "P3"]));
const VALID_STATUSES = Object.freeze(new Set([
    "implemented",
    "partially-implemented",
    "planned",
    "external-blocked",
    "accepted-risk",
]));

function loadRepoText(cwd, relativePath) {
    return fs.readFileSync(path.join(cwd, relativePath), "utf-8");
}

function loadPackageScripts(cwd) {
    const packageJson = JSON.parse(loadRepoText(cwd, "package.json"));
    return packageJson.scripts || {};
}

function extractNpmScript(command) {
    const match = String(command || "").match(/^npm run ([^ ]+)/u);
    return match ? match[1] : null;
}

function isSpecialCommand(command) {
    return command === "npm test" || command === "git diff --check";
}

function hasNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyStringArray(value) {
    return Array.isArray(value) && value.length > 0 && value.every(hasNonEmptyString);
}

function collectTopLevelFailures(matrix) {
    const failures = [];

    if (matrix.version !== 1) {
        failures.push("version must be 1");
    }
    if (matrix.authority?.sourceOfTruth !== "tracked-security-requirements-traceability") {
        failures.push("authority.sourceOfTruth must be tracked-security-requirements-traceability");
    }
    if (matrix.authority?.generatedArtifact !== false) {
        failures.push("authority.generatedArtifact must be false");
    }
    if (!hasNonEmptyStringArray(matrix.authority?.boundary)) {
        failures.push("authority.boundary must contain at least one statement");
    }
    if (!hasNonEmptyStringArray(matrix.updateTriggers)) {
        failures.push("updateTriggers must contain at least one trigger");
    }
    if (!Array.isArray(matrix.requirements) || matrix.requirements.length === 0) {
        failures.push("requirements must contain at least one requirement");
    }

    return failures;
}

function collectRequirementShapeFailures(requirement) {
    const failures = [];
    const requiredStringFields = ["id", "priority", "status", "title", "component", "requirement"];

    for (const field of requiredStringFields) {
        if (!hasNonEmptyString(requirement[field])) {
            failures.push(`${field} is required`);
        }
    }
    if (requirement.priority && !VALID_PRIORITIES.has(requirement.priority)) {
        failures.push(`priority must be one of ${Array.from(VALID_PRIORITIES).join(", ")}`);
    }
    if (requirement.status && !VALID_STATUSES.has(requirement.status)) {
        failures.push(`status must be one of ${Array.from(VALID_STATUSES).join(", ")}`);
    }

    for (const field of ["sourceMappings", "implementationFiles", "evidenceFiles", "verificationCommands"]) {
        if (!hasNonEmptyStringArray(requirement[field])) {
            failures.push(`${field} must contain at least one string`);
        }
    }

    if (typeof requirement.manualQaRequired !== "boolean") {
        failures.push("manualQaRequired must be boolean");
    }
    if (!Array.isArray(requirement.manualReview)) {
        failures.push("manualReview must be an array");
    } else if (requirement.manualQaRequired && !hasNonEmptyStringArray(requirement.manualReview)) {
        failures.push("manualQaRequired requires at least one manualReview item");
    }
    if (typeof requirement.releaseBlocker !== "boolean") {
        failures.push("releaseBlocker must be boolean");
    }
    if (!Array.isArray(requirement.riskRecords) || !requirement.riskRecords.every(hasNonEmptyString)) {
        failures.push("riskRecords must be an array of strings");
    }

    return failures;
}

function collectRequirementLinkFailures({ cwd, requirement, scripts, riskRegisterText }) {
    const failures = [];

    for (const relativePath of requirement.implementationFiles || []) {
        if (!fs.existsSync(path.join(cwd, relativePath))) {
            failures.push(`implementation file is missing: ${relativePath}`);
        }
    }
    for (const relativePath of requirement.evidenceFiles || []) {
        if (!fs.existsSync(path.join(cwd, relativePath))) {
            failures.push(`evidence file is missing: ${relativePath}`);
        }
    }

    for (const command of requirement.verificationCommands || []) {
        if (isSpecialCommand(command)) {
            continue;
        }
        const npmScript = extractNpmScript(command);
        if (!npmScript) {
            failures.push(`unsupported verification command: ${command}`);
        } else if (!scripts[npmScript]) {
            failures.push(`verification command references missing package script: ${npmScript}`);
        }
    }

    for (const riskId of requirement.riskRecords || []) {
        if (!riskRegisterText.includes(riskId)) {
            failures.push(`risk record is missing from docs/risk-register.md: ${riskId}`);
        }
    }

    return failures;
}

function collectSecurityRequirementsTraceabilityFailures({ cwd = process.cwd(), matrix, scripts, riskRegisterText }) {
    const failures = collectTopLevelFailures(matrix);
    const requirementIds = new Set();
    const duplicateIds = new Set();
    const requirements = Array.isArray(matrix.requirements) ? matrix.requirements : [];

    for (const requirement of requirements) {
        if (requirementIds.has(requirement.id)) {
            duplicateIds.add(requirement.id);
        }
        requirementIds.add(requirement.id);

        const requirementFailures = [
            ...collectRequirementShapeFailures(requirement),
            ...collectRequirementLinkFailures({
                cwd,
                requirement,
                scripts,
                riskRegisterText,
            }),
        ];

        failures.push(...requirementFailures.map((failure) => `${requirement.id || "(missing-id)"}: ${failure}`));
    }

    for (const duplicateId of duplicateIds) {
        failures.push(`duplicate requirement id: ${duplicateId}`);
    }

    return failures;
}

function countBy(requirements, field) {
    const counts = {};
    for (const requirement of requirements) {
        const key = requirement[field] || "unknown";
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

function buildSecurityRequirementsTraceabilityReport({ cwd = process.cwd(), traceabilityPath } = {}) {
    const resolvedCwd = path.resolve(cwd);
    const matrix = loadSecurityRequirementsTraceability(traceabilityPath);
    const scripts = loadPackageScripts(resolvedCwd);
    const riskRegisterText = loadRepoText(resolvedCwd, path.join("docs", "risk-register.md"));
    const failures = collectSecurityRequirementsTraceabilityFailures({
        cwd: resolvedCwd,
        matrix,
        scripts,
        riskRegisterText,
    });
    const requirements = Array.isArray(matrix.requirements) ? matrix.requirements : [];

    return {
        passed: failures.length === 0,
        traceabilityPath: matrix.traceabilityPath,
        authority: matrix.authority,
        updateTriggers: matrix.updateTriggers || [],
        counts: {
            requirements: requirements.length,
            releaseBlockers: requirements.filter((requirement) => requirement.releaseBlocker).length,
            manualQaRequired: requirements.filter((requirement) => requirement.manualQaRequired).length,
            priorities: countBy(requirements, "priority"),
            statuses: countBy(requirements, "status"),
        },
        requirements,
        failures,
    };
}

function formatSecurityRequirementsTraceabilityReport(report = {}) {
    const lines = [
        "Security requirements traceability",
        `Status: ${report.passed ? "pass" : "fail"}`,
        `Matrix: ${report.traceabilityPath || "(unknown)"}`,
        `Requirements: ${report.counts?.requirements || 0}`,
        `Release blockers: ${report.counts?.releaseBlockers || 0}`,
        `Manual QA required: ${report.counts?.manualQaRequired || 0}`,
        `Priorities: ${Object.entries(report.counts?.priorities || {}).map(([key, count]) => `${key}=${count}`).join(", ") || "none"}`,
        `Statuses: ${Object.entries(report.counts?.statuses || {}).map(([key, count]) => `${key}=${count}`).join(", ") || "none"}`,
        "",
        "Authority boundary:",
        ...(report.authority?.boundary || []).map((entry) => `- ${entry}`),
        "",
        "Requirements:",
    ];

    for (const requirement of report.requirements || []) {
        lines.push(`- ${requirement.id}: ${requirement.status}; ${requirement.title}; release blocker ${requirement.releaseBlocker ? "yes" : "no"}`);
    }

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildSecurityRequirementsTraceabilityReport,
    collectRequirementLinkFailures,
    collectRequirementShapeFailures,
    collectSecurityRequirementsTraceabilityFailures,
    collectTopLevelFailures,
    extractNpmScript,
    formatSecurityRequirementsTraceabilityReport,
};
