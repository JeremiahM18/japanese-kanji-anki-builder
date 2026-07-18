const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/auditDependencyLicenses");
const {
    buildDependencyLicenseAuditReport,
    buildDependencyLicenseReleaseSummary,
    classifyLicenseEntry,
    formatAsOfDate,
    formatDependencyLicenseAuditReport,
    packageNameFromPackagePath,
    writeDependencyLicenseReleaseSummary,
} = require("../src/services/dependencyLicenseAuditService");

const repoRoot = path.resolve(__dirname, "..");

function reviewedPolicy(overrides = {}) {
    return {
        allowedLicenseExpressions: new Set(["MIT"]),
        reviewedLicenseExceptions: [
            {
                licenseExpression: "LGPL-3.0-or-later",
                packageNamePrefix: "@img/sharp-libvips-",
                reason: "Reviewed native binary package exception.",
                nextReview: "2026-07-02",
            },
        ],
        deniedLicensePatterns: ["AGPL", "GPL-"],
        asOfDate: "2026-06-02",
        ...overrides,
    };
}

test("dependency license audit validates the current package-lock license surface", () => {
    const report = buildDependencyLicenseAuditReport({ cwd: repoRoot, asOfDate: "2026-06-02" });

    assert.equal(report.passed, true);
    assert.deepEqual(report.failures, []);
    assert.equal(report.summary.packageCount, 289);
    assert.equal(report.summary.statuses.allowed, 275);
    assert.equal(report.summary.statuses["reviewed-exception"], 14);
    assert.equal(report.summary.reviewedExceptions, 14);
    assert.equal(report.summary.missingLicenses, 0);
    assert.equal(report.summary.deniedLicenses, 0);
    assert.equal(report.summary.unreviewedLicenses, 0);
    assert.equal(report.summary.overdueReviewedExceptions, 0);
    assert.equal(report.summary.licenseExpressions.MIT, 197);
    assert.equal(report.summary.licenseExpressions["LGPL-3.0-or-later"], 10);
});

test("dependency license audit report preserves authority boundary and reviewed exceptions", () => {
    const report = buildDependencyLicenseAuditReport({ cwd: repoRoot, asOfDate: "2026-06-02" });
    const text = formatDependencyLicenseAuditReport(report);

    assert.match(text, /Dependency license audit/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Packages: 289/);
    assert.match(text, /reviewed-exception=14/);
    assert.match(text, /Unexpected, missing, denied, or overdue reviewed-exception licenses fail closed/);
    assert.match(text, /Reviewed exceptions:/);
    assert.match(text, /@img\/sharp-libvips-/);
});

test("dependency license classification fails closed for missing, denied, unreviewed, and overdue licenses", () => {
    assert.equal(classifyLicenseEntry({
        packageName: "safe",
        version: "1.0.0",
        license: "MIT",
    }, reviewedPolicy()).status, "allowed");

    assert.equal(classifyLicenseEntry({
        packageName: "@img/sharp-libvips-linux-x64",
        version: "1.2.3",
        license: "LGPL-3.0-or-later",
    }, reviewedPolicy()).status, "reviewed-exception");

    assert.equal(classifyLicenseEntry({
        packageName: "@img/sharp-libvips-linux-x64",
        version: "1.2.3",
        license: "LGPL-3.0-or-later",
    }, reviewedPolicy({ asOfDate: "2026-07-03" })).status, "overdue-reviewed-exception");

    assert.equal(classifyLicenseEntry({
        packageName: "missing",
        version: "1.0.0",
        license: "",
    }, reviewedPolicy()).status, "missing-license");

    assert.equal(classifyLicenseEntry({
        packageName: "denied",
        version: "1.0.0",
        license: "AGPL-3.0-only",
    }, reviewedPolicy()).status, "denied-license");

    assert.equal(classifyLicenseEntry({
        packageName: "unknown",
        version: "1.0.0",
        license: "MPL-2.0",
    }, reviewedPolicy()).status, "unreviewed-license");
});

test("dependency license release summary is generated only from a passing report", () => {
    const report = buildDependencyLicenseAuditReport({ cwd: repoRoot, asOfDate: "2026-06-02" });
    const summary = buildDependencyLicenseReleaseSummary(report);

    assert.equal(summary.version, 1);
    assert.equal(summary.generatedArtifact, true);
    assert.equal(summary.source, "package-lock.json");
    assert.equal(summary.policy, "templates/dependency_license_policy.json");
    assert.equal(summary.passed, true);
    assert.equal(summary.packages.length, report.summary.packageCount);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dependency-license-audit-"));
    const outPath = path.join(tempDir, "out", "security", "dependency-licenses.json");
    const writtenPath = writeDependencyLicenseReleaseSummary(report, outPath);
    const written = JSON.parse(fs.readFileSync(writtenPath, "utf-8"));

    assert.equal(written.summary.packageCount, 289);
    assert.equal(written.packages.length, 289);
});

test("dependency license helpers parse dates, scoped package paths, and CLI options", () => {
    assert.equal(formatAsOfDate("2026-06-02"), "2026-06-02");
    assert.throws(() => formatAsOfDate("06/02/2026"), /Invalid dependency license as-of date/);
    assert.equal(packageNameFromPackagePath("node_modules/@scope/name"), "@scope/name");
    assert.equal(packageNameFromPackagePath("node_modules/plain"), "plain");
    assert.deepEqual(parseArgs([]), {
        json: false,
        policyPath: undefined,
        out: undefined,
        asOfDate: undefined,
        unknownArgs: [],
    });
    assert.deepEqual(parseArgs(["--json", "--policy=custom.json", "--out=out/report.json", "--as-of=2026-06-02"]), {
        json: true,
        policyPath: "custom.json",
        out: "out/report.json",
        asOfDate: "2026-06-02",
        unknownArgs: [],
    });
});
