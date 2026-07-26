const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArgs } = require("../scripts/reportSdlcMetrics");
const {
    buildSdlcMetricsReport,
    formatAsOfDate,
    formatSdlcMetricsReport,
    parseRiskRegister,
    summarizeTrainingChecklist,
} = require("../src/services/sdlcMetricsService");

const repoRoot = path.resolve(__dirname, "..");

test("SDLC metrics report validates current tracked security posture", () => {
    const report = buildSdlcMetricsReport({ cwd: repoRoot, asOfDate: "2026-07-26" });

    assert.equal(report.passed, true);
    assert.equal(report.risk.total, 13);
    assert.equal(report.risk.highCriticalOpenOrBlocked, 4);
    assert.deepEqual(report.risk.externalBlockedRecords, []);
    assert.equal(report.risk.overdueReviews, 0);
    assert.equal(report.requirements.total, 14);
    assert.equal(report.requirements.planned, 0);
    assert.equal(report.requirements.partialOrExternal, 1);
    assert.equal(report.requirements.unimplementedReleaseBlockers, 1);
    assert.deepEqual(report.requirements.unimplementedReleaseBlockerRecords, ["SEC-REQ-007"]);
    assert.equal(report.releaseTrust.enforced, false);
    assert.equal(report.releaseTrust.phase, "visibility");
    assert.equal(report.releaseTrust.highCriticalReleaseBlockerRisks, 3);
    assert.deepEqual(report.releaseTrust.highCriticalReleaseBlockerRiskRecords, [
        "SEC-P0-004",
        "SEC-P0-005",
        "PROD-REL-001",
    ]);
    assert.equal(report.training.missingRequiredSections.length, 0);
    assert.equal(report.training.missingRequiredTopics.length, 0);
    assert.equal(report.training.missingRequiredRoles.length, 0);
    assert.deepEqual(report.failures, []);
});

test("SDLC metrics report preserves blocker visibility in human-readable output", () => {
    const report = buildSdlcMetricsReport({ cwd: repoRoot, asOfDate: "2026-07-26" });
    const text = formatSdlcMetricsReport(report);

    assert.match(text, /SDLC security metrics/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Mode: visibility/);
    assert.match(text, /high\/critical open or blocked: 4 \(SEC-P0-003, SEC-P0-004, SEC-P0-005, PROD-REL-001\)/);
    assert.match(text, /external blocked: 0/);
    assert.match(text, /planned: 0/);
    assert.match(text, /partially implemented: 1/);
    assert.match(text, /Release trust posture:/);
    assert.match(text, /enforced: no/);
    assert.match(text, /phase: visibility/);
    assert.match(text, /high\/critical release-blocker risks: 3 \(SEC-P0-004, SEC-P0-005, PROD-REL-001\)/);
    assert.match(text, /SDLC-MET-004: pass; requirements\.partialOrExternal=1; target <=4/);
});

test("SDLC pre-release trust mode defers only hosted post-attestation proof", () => {
    const report = buildSdlcMetricsReport({ cwd: repoRoot, asOfDate: "2026-07-26", releaseTrustMode: "pre" });
    const text = formatSdlcMetricsReport(report);

    assert.equal(report.passed, false);
    assert.equal(report.mode, "pre-release-trust");
    assert.equal(report.releaseTrust.enforced, true);
    assert.equal(report.releaseTrust.phase, "pre");
    assert.deepEqual(report.releaseTrust.highCriticalReleaseBlockerRiskRecords, ["SEC-P0-005", "PROD-REL-001"]);
    assert.deepEqual(report.releaseTrust.deferredHighCriticalReleaseBlockerRiskRecords, ["SEC-P0-004"]);
    assert.deepEqual(report.releaseTrust.unimplementedReleaseBlockerRequirementRecords, []);
    assert.deepEqual(report.releaseTrust.deferredUnimplementedReleaseBlockerRequirementRecords, ["SEC-REQ-007"]);
    assert.deepEqual(report.failures, [
        "release trust has unresolved high/critical release-blocker risks: SEC-P0-005, PROD-REL-001",
    ]);
    assert.match(text, /Mode: pre-release-trust/);
    assert.match(text, /pre-release deferred high\/critical risks: 1 \(SEC-P0-004\)/);
    assert.match(text, /pre-release deferred unimplemented requirements: 1 \(SEC-REQ-007\)/);
});

test("SDLC release-trust mode fails closed on unresolved release blockers", () => {
    const report = buildSdlcMetricsReport({ cwd: repoRoot, asOfDate: "2026-07-26", releaseTrust: true });
    const text = formatSdlcMetricsReport(report);

    assert.equal(report.passed, false);
    assert.equal(report.mode, "release-trust");
    assert.equal(report.releaseTrust.enforced, true);
    assert.equal(report.releaseTrust.phase, "full");
    assert.equal(report.releaseTrust.highCriticalReleaseBlockerRisks, 3);
    assert.equal(report.releaseTrust.unimplementedReleaseBlockerRequirements, 1);
    assert.deepEqual(report.failures, [
        "release trust has unresolved high/critical release-blocker risks: SEC-P0-004, SEC-P0-005, PROD-REL-001",
        "release trust has unimplemented release-blocker requirements: SEC-REQ-007",
    ]);
    assert.match(text, /Status: fail/);
    assert.match(text, /Mode: release-trust/);
});

test("SDLC metrics parser identifies unresolved and overdue risk posture", () => {
    const riskRecords = parseRiskRegister([
        "| ID | Severity | Decision | Owner | Risk | Evidence | Required next action | Next review |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| SEC-TEST-001 | Critical | Open | owner | risk | evidence | action | 2026-01-01 |",
        "| SEC-TEST-002 | High | Blocked external | owner | risk | evidence | action | 2026-06-16 |",
        "| SEC-TEST-003 | High | Mitigated | owner | risk | evidence | action | 2026-01-01 |",
    ].join("\n"));
    const report = buildSdlcMetricsReport({ cwd: repoRoot, asOfDate: "2026-06-02" });
    const service = require("../src/services/sdlcMetricsService");
    const summary = service.summarizeRiskRegister(riskRecords, { asOfDate: "2026-06-02" });

    assert.equal(report.passed, true);
    assert.equal(summary.highCriticalOpenOrBlocked, 2);
    assert.equal(summary.externalBlocked, 1);
    assert.deepEqual(summary.overdueReviewRecords, ["SEC-TEST-001", "SEC-TEST-003"]);
});

test("SDLC metrics training checklist validation catches missing required topics", () => {
    const summary = summarizeTrainingChecklist({
        checklistText: "## Purpose\nSecurity reviewer\nsecure-coding-basics\n",
        checklistConfig: {
            path: "docs/security-training-checklist.md",
            requiredSections: ["## Purpose", "## Missing Section"],
            requiredTopicIds: ["secure-coding-basics", "source-use-provenance"],
            requiredRoles: ["Security reviewer", "NLP governance reviewer"],
        },
    });

    assert.deepEqual(summary.missingRequiredSections, ["## Missing Section"]);
    assert.deepEqual(summary.missingRequiredTopics, ["source-use-provenance"]);
    assert.deepEqual(summary.missingRequiredRoles, ["NLP governance reviewer"]);
});

test("SDLC metrics CLI parsing supports JSON, path override, and as-of date", () => {
    assert.deepEqual(parseArgs([]), {
        json: false,
        metricsPath: undefined,
        asOfDate: undefined,
        releaseTrustMode: "visibility",
        unknownArgs: [],
    });
    assert.deepEqual(parseArgs(["--json", "--release-trust", "--metrics=custom.json", "--as-of=2026-06-02"]), {
        json: true,
        metricsPath: "custom.json",
        asOfDate: "2026-06-02",
        releaseTrustMode: "full",
        unknownArgs: [],
    });
    assert.deepEqual(parseArgs(["--release-trust=pre"]), {
        json: false,
        metricsPath: undefined,
        asOfDate: undefined,
        releaseTrustMode: "pre",
        unknownArgs: [],
    });
    assert.throws(() => formatAsOfDate("not-a-date"), /Invalid SDLC metrics as-of date/);
});
