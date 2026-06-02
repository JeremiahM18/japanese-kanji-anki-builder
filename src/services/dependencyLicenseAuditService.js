const fs = require("node:fs");
const path = require("node:path");

const {
    loadDependencyLicensePolicy,
    resolveDependencyLicensePolicyPath,
} = require("../datasets/dependencyLicensePolicy");

function readJson(cwd, relativePath) {
    return JSON.parse(fs.readFileSync(path.join(cwd, relativePath), "utf-8"));
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join("/");
}

function parseIsoDate(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/u);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function formatAsOfDate(value = new Date()) {
    if (typeof value === "string") {
        const parsed = parseIsoDate(value);
        if (!parsed) {
            throw new Error(`Invalid dependency license as-of date: ${value}`);
        }
        return parsed;
    }
    return value.toISOString().slice(0, 10);
}

function packageNameFromPackagePath(packagePath) {
    const normalized = normalizePath(packagePath);
    const parts = normalized.split("/");
    if (parts[0] !== "node_modules") {
        return normalized;
    }
    if (parts[1]?.startsWith("@")) {
        return `${parts[1]}/${parts[2]}`;
    }
    return parts[1] || normalized;
}

function collectLockfilePackages(lock) {
    return Object.entries(lock?.packages || {})
        .filter(([packagePath]) => packagePath.startsWith("node_modules/"))
        .map(([packagePath, metadata]) => ({
            packagePath: normalizePath(packagePath),
            packageName: packageNameFromPackagePath(packagePath),
            version: String(metadata?.version || ""),
            license: String(metadata?.license || "").trim(),
            dev: Boolean(metadata?.dev),
            optional: Boolean(metadata?.optional),
            resolved: metadata?.resolved || "",
        }))
        .sort((a, b) => (
            a.packageName.localeCompare(b.packageName)
            || a.version.localeCompare(b.version)
            || a.packagePath.localeCompare(b.packagePath)
        ));
}

function matchesException(entry, exception) {
    if (entry.license !== exception.licenseExpression) {
        return false;
    }
    if (exception.packageName && entry.packageName === exception.packageName) {
        return true;
    }
    if (exception.packageNamePrefix && entry.packageName.startsWith(exception.packageNamePrefix)) {
        return true;
    }
    return false;
}

function findReviewedException(entry, exceptions = []) {
    return exceptions.find((exception) => matchesException(entry, exception)) || null;
}

function licenseMatchesDeniedPattern(license, deniedPatterns = []) {
    return deniedPatterns.some((pattern) => new RegExp(pattern, "iu").test(license));
}

function classifyLicenseEntry(entry, {
    allowedLicenseExpressions,
    reviewedLicenseExceptions,
    deniedLicensePatterns,
    asOfDate,
}) {
    if (!entry.license) {
        return {
            ...entry,
            status: "missing-license",
            reason: "package-lock entry is missing a license expression",
        };
    }

    const reviewedException = findReviewedException(entry, reviewedLicenseExceptions);
    if (reviewedException) {
        const nextReview = parseIsoDate(reviewedException.nextReview);
        if (!nextReview || nextReview < asOfDate) {
            return {
                ...entry,
                status: "overdue-reviewed-exception",
                reason: `reviewed exception is overdue or missing nextReview: ${reviewedException.nextReview || "missing"}`,
                exception: reviewedException,
            };
        }
        return {
            ...entry,
            status: "reviewed-exception",
            reason: reviewedException.reason,
            exception: reviewedException,
        };
    }

    if (licenseMatchesDeniedPattern(entry.license, deniedLicensePatterns)) {
        return {
            ...entry,
            status: "denied-license",
            reason: `license expression matches denied pattern: ${entry.license}`,
        };
    }

    if (allowedLicenseExpressions.has(entry.license)) {
        return {
            ...entry,
            status: "allowed",
            reason: "license expression is in the approved dependency allowlist",
        };
    }

    return {
        ...entry,
        status: "unreviewed-license",
        reason: `license expression is not allowed or reviewed: ${entry.license}`,
    };
}

function countBy(entries, key) {
    return entries.reduce((counts, entry) => {
        const value = entry[key] || "unknown";
        counts[value] = (counts[value] || 0) + 1;
        return counts;
    }, {});
}

function collectPolicyFailures(policy) {
    const failures = [];
    if (policy?.version !== 1) {
        failures.push(`dependency license policy version must be 1; found ${policy?.version || "missing"}.`);
    }
    if (!Array.isArray(policy?.authority?.boundary) || policy.authority.boundary.length === 0) {
        failures.push("dependency license policy must define authority.boundary.");
    }
    if (!Array.isArray(policy?.allowedLicenseExpressions) || policy.allowedLicenseExpressions.length === 0) {
        failures.push("dependency license policy must define allowedLicenseExpressions.");
    }
    if (!policy?.releaseSummaryPath) {
        failures.push("dependency license policy must define releaseSummaryPath.");
    }

    const allowedExpressions = new Set();
    for (const allowed of policy?.allowedLicenseExpressions || []) {
        if (!allowed.expression) {
            failures.push("allowed license entry is missing expression.");
            continue;
        }
        if (allowedExpressions.has(allowed.expression)) {
            failures.push(`duplicate allowed license expression: ${allowed.expression}`);
        }
        allowedExpressions.add(allowed.expression);
    }

    for (const exception of policy?.reviewedLicenseExceptions || []) {
        if (!exception.licenseExpression) {
            failures.push("reviewed license exception is missing licenseExpression.");
        }
        if (!exception.packageName && !exception.packageNamePrefix) {
            failures.push(`reviewed license exception for ${exception.licenseExpression || "(missing)"} must define packageName or packageNamePrefix.`);
        }
        if (!exception.reason || !exception.owner || !parseIsoDate(exception.reviewedAt) || !parseIsoDate(exception.nextReview)) {
            failures.push(`reviewed license exception for ${exception.licenseExpression || "(missing)"} must define reason, owner, reviewedAt, and nextReview.`);
        }
    }

    return failures;
}

function buildDependencyLicenseAuditReport({
    cwd = process.cwd(),
    policyPath = undefined,
    asOfDate = formatAsOfDate(new Date()),
} = {}) {
    const normalizedAsOfDate = formatAsOfDate(asOfDate);
    const resolvedPolicyPath = resolveDependencyLicensePolicyPath(cwd, policyPath);
    const policy = loadDependencyLicensePolicy({ policyPath: resolvedPolicyPath });
    const lock = readJson(cwd, "package-lock.json");
    const allowedLicenseExpressions = new Set((policy.allowedLicenseExpressions || []).map((entry) => entry.expression));
    const packages = collectLockfilePackages(lock);
    const classifiedPackages = packages.map((entry) => classifyLicenseEntry(entry, {
        allowedLicenseExpressions,
        reviewedLicenseExceptions: policy.reviewedLicenseExceptions || [],
        deniedLicensePatterns: policy.deniedLicensePatterns || [],
        asOfDate: normalizedAsOfDate,
    }));
    const failingPackages = classifiedPackages.filter((entry) => !["allowed", "reviewed-exception"].includes(entry.status));
    const policyFailures = collectPolicyFailures(policy);
    const failures = [
        ...policyFailures,
        ...failingPackages.map((entry) => `${entry.packageName}@${entry.version} (${entry.packagePath}) ${entry.status}: ${entry.reason}`),
    ];

    return {
        passed: failures.length === 0,
        failures,
        asOfDate: normalizedAsOfDate,
        policyPath: normalizePath(path.relative(cwd, resolvedPolicyPath) || resolvedPolicyPath),
        releaseSummaryPath: policy.releaseSummaryPath || "",
        authority: policy.authority || {},
        summary: {
            packageCount: classifiedPackages.length,
            licenseExpressions: countBy(classifiedPackages, "license"),
            statuses: countBy(classifiedPackages, "status"),
            reviewedExceptions: classifiedPackages.filter((entry) => entry.status === "reviewed-exception").length,
            missingLicenses: classifiedPackages.filter((entry) => entry.status === "missing-license").length,
            deniedLicenses: classifiedPackages.filter((entry) => entry.status === "denied-license").length,
            unreviewedLicenses: classifiedPackages.filter((entry) => entry.status === "unreviewed-license").length,
            overdueReviewedExceptions: classifiedPackages.filter((entry) => entry.status === "overdue-reviewed-exception").length,
        },
        packages: classifiedPackages,
    };
}

function buildDependencyLicenseReleaseSummary(report) {
    return {
        version: 1,
        generatedArtifact: true,
        generatedAt: new Date().toISOString(),
        source: "package-lock.json",
        policy: report.policyPath,
        asOfDate: report.asOfDate,
        passed: report.passed,
        authorityBoundary: report.authority.boundary || [],
        summary: report.summary,
        packages: report.packages.map((entry) => ({
            packageName: entry.packageName,
            version: entry.version,
            packagePath: entry.packagePath,
            license: entry.license,
            status: entry.status,
            optional: entry.optional,
            dev: entry.dev,
            reason: entry.reason,
        })),
    };
}

function formatLicenseCounts(counts = {}) {
    return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([license, count]) => `${license}=${count}`)
        .join(", ") || "none";
}

function formatDependencyLicenseAuditReport(report) {
    const lines = [
        "Dependency license audit",
        `Status: ${report.passed ? "pass" : "fail"}`,
        `As of: ${report.asOfDate}`,
        `Policy: ${report.policyPath}`,
        `Release summary path: ${report.releaseSummaryPath}`,
        `Packages: ${report.summary.packageCount}`,
        `Statuses: ${formatLicenseCounts(report.summary.statuses)}`,
        `License expressions: ${formatLicenseCounts(report.summary.licenseExpressions)}`,
        "",
        "Authority boundary:",
    ];

    for (const boundary of report.authority.boundary || []) {
        lines.push(`- ${boundary}`);
    }

    const exceptions = report.packages.filter((entry) => entry.status === "reviewed-exception");
    if (exceptions.length > 0) {
        lines.push("");
        lines.push("Reviewed exceptions:");
        for (const entry of exceptions) {
            lines.push(`- ${entry.packageName}@${entry.version} (${entry.license}) - next review ${entry.exception.nextReview}`);
        }
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

function writeDependencyLicenseReleaseSummary(report, outPath, { cwd = process.cwd() } = {}) {
    const resolved = path.isAbsolute(outPath) ? outPath : path.resolve(cwd, outPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, `${JSON.stringify(buildDependencyLicenseReleaseSummary(report), null, 2)}\n`, "utf-8");
    return resolved;
}

module.exports = {
    buildDependencyLicenseAuditReport,
    buildDependencyLicenseReleaseSummary,
    classifyLicenseEntry,
    collectLockfilePackages,
    formatAsOfDate,
    formatDependencyLicenseAuditReport,
    packageNameFromPackagePath,
    writeDependencyLicenseReleaseSummary,
};
