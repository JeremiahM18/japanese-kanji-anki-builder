const fs = require("node:fs");
const path = require("node:path");

const { loadSdlcMetrics, resolveSdlcMetricsPath } = require("../datasets/sdlcMetrics");
const { loadSecurityRequirementsTraceability } = require("../datasets/securityRequirementsTraceability");

const HIGH_CRITICAL_SEVERITIES = new Set(["critical", "high"]);
const UNRESOLVED_DECISIONS = new Set(["open", "blocked external"]);

function readText(cwd, relativePath) {
    return fs.readFileSync(path.join(cwd, relativePath), "utf-8");
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function fileExists(cwd, relativePath) {
    return fs.existsSync(path.join(cwd, relativePath));
}

function splitMarkdownTableLine(line) {
    return String(line)
        .trim()
        .replace(/^\|/u, "")
        .replace(/\|$/u, "")
        .split("|")
        .map((cell) => cell.trim());
}

function normalizeDecision(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeSeverity(value) {
    return String(value || "").trim().toLowerCase();
}

function parseIsoDate(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    if (!match) {
        return null;
    }

    return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatAsOfDate(value = new Date()) {
    if (typeof value === "string") {
        const parsed = parseIsoDate(value);
        if (!parsed) {
            throw new Error(`Invalid SDLC metrics as-of date: ${value}`);
        }
        return parsed;
    }

    return value.toISOString().slice(0, 10);
}

function parseRiskRegister(text) {
    return String(text || "")
        .split(/\r?\n/u)
        .filter((line) => /^\|\s*[A-Z]+-[A-Z0-9-]+/u.test(line))
        .map((line) => {
            const cells = splitMarkdownTableLine(line);
            return {
                id: cells[0] || "",
                severity: cells[1] || "",
                decision: cells[2] || "",
                owner: cells[3] || "",
                risk: cells[4] || "",
                evidence: cells[5] || "",
                requiredNextAction: cells[6] || "",
                nextReview: parseIsoDate(cells[7] || ""),
            };
        });
}

function countBy(rows, key) {
    return rows.reduce((counts, row) => {
        const value = row[key] || "unknown";
        counts[value] = (counts[value] || 0) + 1;
        return counts;
    }, {});
}

function summarizeRiskRegister(riskRecords, { asOfDate }) {
    const unresolvedHighCritical = riskRecords.filter((record) => (
        HIGH_CRITICAL_SEVERITIES.has(normalizeSeverity(record.severity))
        && UNRESOLVED_DECISIONS.has(normalizeDecision(record.decision))
    ));
    const externalBlocked = riskRecords.filter((record) => normalizeDecision(record.decision) === "blocked external");
    const overdueReviews = riskRecords.filter((record) => (
        record.nextReview
        && record.nextReview < asOfDate
        && normalizeDecision(record.decision) !== "superseded"
    ));

    return {
        total: riskRecords.length,
        bySeverity: countBy(riskRecords, "severity"),
        byDecision: countBy(riskRecords, "decision"),
        highCriticalOpenOrBlocked: unresolvedHighCritical.length,
        externalBlocked: externalBlocked.length,
        overdueReviews: overdueReviews.length,
        highCriticalOpenOrBlockedRecords: unresolvedHighCritical.map((record) => record.id),
        externalBlockedRecords: externalBlocked.map((record) => record.id),
        overdueReviewRecords: overdueReviews.map((record) => record.id),
    };
}

function summarizeSecurityRequirements(matrix) {
    const requirements = Array.isArray(matrix?.requirements) ? matrix.requirements : [];
    const byStatus = requirements.reduce((counts, requirement) => {
        const status = requirement.status || "unknown";
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});

    return {
        total: requirements.length,
        releaseBlockers: requirements.filter((requirement) => requirement.releaseBlocker).length,
        manualQaRequired: requirements.filter((requirement) => requirement.manualQaRequired).length,
        planned: byStatus.planned || 0,
        externalBlocked: byStatus["external-blocked"] || 0,
        partiallyImplemented: byStatus["partially-implemented"] || 0,
        partialOrExternal: (byStatus["external-blocked"] || 0) + (byStatus["partially-implemented"] || 0),
        byStatus,
    };
}

function summarizeTrainingChecklist({ checklistText, checklistConfig }) {
    const requiredSections = Array.isArray(checklistConfig?.requiredSections) ? checklistConfig.requiredSections : [];
    const requiredTopicIds = Array.isArray(checklistConfig?.requiredTopicIds) ? checklistConfig.requiredTopicIds : [];
    const requiredRoles = Array.isArray(checklistConfig?.requiredRoles) ? checklistConfig.requiredRoles : [];

    const missingRequiredSections = requiredSections.filter((section) => !checklistText.includes(section));
    const missingRequiredTopics = requiredTopicIds.filter((topicId) => (
        !new RegExp(`\\b${escapeRegExp(topicId)}\\b`, "u").test(checklistText)
    ));
    const missingRequiredRoles = requiredRoles.filter((role) => !checklistText.includes(role));

    return {
        path: checklistConfig?.path || "",
        reviewCadenceDays: checklistConfig?.reviewCadenceDays || null,
        requiredSections: requiredSections.length,
        requiredTopicIds: requiredTopicIds.length,
        requiredRoles: requiredRoles.length,
        missingRequiredSections,
        missingRequiredTopics,
        missingRequiredRoles,
    };
}

function resolveMeasureValue(measures, measurePath) {
    return String(measurePath || "")
        .split(".")
        .filter(Boolean)
        .reduce((value, key) => (value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined), measures);
}

function buildMetricResults({ metricConfig = [], measures }) {
    return metricConfig.map((metric) => {
        const value = resolveMeasureValue(measures, metric.measure);
        const max = metric.threshold?.max;
        const min = metric.threshold?.min;
        const failures = [];

        if (typeof value !== "number" || Number.isNaN(value)) {
            failures.push(`${metric.id} measure ${metric.measure} did not resolve to a number.`);
        }
        if (typeof max === "number" && typeof value === "number" && value > max) {
            failures.push(`${metric.id} value ${value} exceeds max ${max}. ${metric.reviewAction || ""}`.trim());
        }
        if (typeof min === "number" && typeof value === "number" && value < min) {
            failures.push(`${metric.id} value ${value} is below min ${min}. ${metric.reviewAction || ""}`.trim());
        }

        return {
            id: metric.id,
            title: metric.title,
            measure: metric.measure,
            value,
            threshold: metric.threshold || {},
            passed: failures.length === 0,
            failures,
            reviewAction: metric.reviewAction || "",
        };
    });
}

function collectStaticConfigFailures({ cwd, matrix, packageScripts }) {
    const failures = [];
    if (matrix?.version !== 1) {
        failures.push(`sdlc metrics contract version must be 1; found ${matrix?.version || "missing"}.`);
    }
    if (!Array.isArray(matrix?.authority?.boundary) || matrix.authority.boundary.length === 0) {
        failures.push("sdlc metrics contract must define authority.boundary.");
    }
    if (!matrix?.trainingChecklist?.path || !fileExists(cwd, matrix.trainingChecklist.path)) {
        failures.push(`training checklist path is missing: ${matrix?.trainingChecklist?.path || "(missing)"}`);
    }

    const seenMetricIds = new Set();
    for (const metric of matrix?.metrics || []) {
        if (!metric.id) {
            failures.push("metric is missing id.");
        } else if (seenMetricIds.has(metric.id)) {
            failures.push(`duplicate metric id: ${metric.id}`);
        }
        seenMetricIds.add(metric.id);

        if (!metric.measure) {
            failures.push(`${metric.id || "(missing id)"} is missing measure.`);
        }
        for (const evidenceFile of metric.evidenceFiles || []) {
            if (!fileExists(cwd, evidenceFile)) {
                failures.push(`${metric.id || "(missing id)"} evidence file is missing: ${evidenceFile}`);
            }
        }
    }

    for (const command of matrix?.verificationCommands || []) {
        const match = String(command).match(/^npm run ([^\s]+)/u);
        if (match && !packageScripts[match[1]]) {
            failures.push(`verification command references missing package script: ${command}`);
        }
    }

    return failures;
}

function collectSdlcMetricsFailures({ report }) {
    return [
        ...report.staticFailures,
        ...report.training.missingRequiredSections.map((section) => `training checklist missing required section: ${section}`),
        ...report.training.missingRequiredTopics.map((topic) => `training checklist missing required topic: ${topic}`),
        ...report.training.missingRequiredRoles.map((role) => `training checklist missing required role: ${role}`),
        ...report.metricResults.flatMap((metric) => metric.failures),
    ];
}

function buildSdlcMetricsReport({
    cwd = process.cwd(),
    metricsPath = undefined,
    asOfDate = formatAsOfDate(new Date()),
} = {}) {
    const resolvedMetricsPath = resolveSdlcMetricsPath(cwd, metricsPath);
    const matrix = loadSdlcMetrics({ metricsPath: resolvedMetricsPath });
    const packageJson = JSON.parse(readText(cwd, "package.json"));
    const riskRecords = parseRiskRegister(readText(cwd, path.join("docs", "risk-register.md")));
    const securityRequirements = loadSecurityRequirementsTraceability();
    const checklistText = matrix.trainingChecklist?.path && fileExists(cwd, matrix.trainingChecklist.path)
        ? readText(cwd, matrix.trainingChecklist.path)
        : "";
    const risk = summarizeRiskRegister(riskRecords, { asOfDate });
    const requirements = summarizeSecurityRequirements(securityRequirements);
    const training = summarizeTrainingChecklist({
        checklistText,
        checklistConfig: matrix.trainingChecklist || {},
    });
    const measures = {
        risk,
        requirements,
        training: {
            missingRequiredSections: training.missingRequiredSections.length,
            missingRequiredTopics: training.missingRequiredTopics.length,
            missingRequiredRoles: training.missingRequiredRoles.length,
        },
    };
    const metricResults = buildMetricResults({
        metricConfig: matrix.metrics || [],
        measures,
    });
    const staticFailures = collectStaticConfigFailures({
        cwd,
        matrix,
        packageScripts: packageJson.scripts || {},
    });
    const report = {
        cwd,
        asOfDate,
        metricsPath: normalizePath(path.relative(cwd, resolvedMetricsPath) || resolvedMetricsPath),
        authority: matrix.authority || {},
        risk,
        requirements,
        training,
        metricResults,
        staticFailures,
    };
    const failures = collectSdlcMetricsFailures({ report });

    return {
        ...report,
        passed: failures.length === 0,
        failures,
    };
}

function formatThreshold(threshold = {}) {
    const parts = [];
    if (typeof threshold.min === "number") {
        parts.push(`>=${threshold.min}`);
    }
    if (typeof threshold.max === "number") {
        parts.push(`<=${threshold.max}`);
    }
    return parts.join(" and ") || "n/a";
}

function formatSdlcMetricsReport(report) {
    const lines = [
        "SDLC security metrics",
        `Status: ${report.passed ? "pass" : "fail"}`,
        `As of: ${report.asOfDate}`,
        `Metrics contract: ${report.metricsPath}`,
        "",
        "Authority boundary:",
    ];

    for (const boundary of report.authority.boundary || []) {
        lines.push(`- ${boundary}`);
    }

    lines.push("");
    lines.push("Risk posture:");
    lines.push(`- total records: ${report.risk.total}`);
    lines.push(`- high/critical open or blocked: ${report.risk.highCriticalOpenOrBlocked}${report.risk.highCriticalOpenOrBlockedRecords.length ? ` (${report.risk.highCriticalOpenOrBlockedRecords.join(", ")})` : ""}`);
    lines.push(`- external blocked: ${report.risk.externalBlocked}${report.risk.externalBlockedRecords.length ? ` (${report.risk.externalBlockedRecords.join(", ")})` : ""}`);
    lines.push(`- overdue reviews: ${report.risk.overdueReviews}${report.risk.overdueReviewRecords.length ? ` (${report.risk.overdueReviewRecords.join(", ")})` : ""}`);

    lines.push("");
    lines.push("Security requirements posture:");
    lines.push(`- total requirements: ${report.requirements.total}`);
    lines.push(`- release blockers: ${report.requirements.releaseBlockers}`);
    lines.push(`- manual QA required: ${report.requirements.manualQaRequired}`);
    lines.push(`- planned: ${report.requirements.planned}`);
    lines.push(`- external blocked: ${report.requirements.externalBlocked}`);
    lines.push(`- partially implemented: ${report.requirements.partiallyImplemented}`);

    lines.push("");
    lines.push("Training checklist:");
    lines.push(`- path: ${report.training.path}`);
    lines.push(`- review cadence days: ${report.training.reviewCadenceDays || "missing"}`);
    lines.push(`- required sections: ${report.training.requiredSections}, missing ${report.training.missingRequiredSections.length}`);
    lines.push(`- required topics: ${report.training.requiredTopicIds}, missing ${report.training.missingRequiredTopics.length}`);
    lines.push(`- required roles: ${report.training.requiredRoles}, missing ${report.training.missingRequiredRoles.length}`);

    lines.push("");
    lines.push("Metrics:");
    for (const metric of report.metricResults) {
        lines.push(`- ${metric.id}: ${metric.passed ? "pass" : "fail"}; ${metric.measure}=${metric.value}; target ${formatThreshold(metric.threshold)}; ${metric.title}`);
    }

    if (report.failures.length > 0) {
        lines.push("");
        lines.push("Failures:");
        for (const failure of report.failures) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildMetricResults,
    buildSdlcMetricsReport,
    collectSdlcMetricsFailures,
    formatAsOfDate,
    formatSdlcMetricsReport,
    parseRiskRegister,
    summarizeRiskRegister,
    summarizeSecurityRequirements,
    summarizeTrainingChecklist,
};
