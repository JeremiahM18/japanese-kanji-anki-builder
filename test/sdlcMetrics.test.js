const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const { parseArgs } = require("../scripts/reportSdlcMetrics");
const {
    buildSdlcMetricsReport,
    formatAsOfDate,
    formatSdlcMetricsReport,
    parseRiskRegister,
    summarizeTrainingChecklist,
} = require("../src/services/sdlcMetricsService");

const repoRoot = path.resolve(__dirname, "..");

function makeRiskFixture(t, { open = false } = {}) {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "sdlc-risk-fixture-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    for (const file of [
        "package.json",
        "docs/risk-register.md",
        "docs/security-training-checklist.md",
        "docs/github-repository-settings-checklist.md",
        "templates/security_requirements_traceability.json",
    ]) {
        const target = path.join(cwd, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(repoRoot, file), target);
    }
    const riskPath = path.join(cwd, "docs/risk-register.md");
    const risks = fs.readFileSync(riskPath, "utf8").split(/\r?\n/u).map((line) => {
        if (!/^\| (?:SEC|GOV|PROD|NLP)-/u.test(line)) return line;
        const cells = line.split("|");
        cells[3] = open && /SEC-P0-00[35]/u.test(cells[1]) ? " Open " : " Mitigated ";
        cells[8] = " 2026-10-03 ";
        return cells.join("|");
    });
    fs.writeFileSync(riskPath, risks.join("\n"));
    return cwd;
}

test("SDLC metrics report validates tracked contracts with reviewed risk fixtures", (t) => {
    const report = buildSdlcMetricsReport({ cwd: makeRiskFixture(t), asOfDate: "2026-09-03" });

    assert.equal(report.passed, true);
    assert.equal(report.risk.total, 13);
    assert.equal(report.risk.highCriticalOpenOrBlocked, 0);
    assert.deepEqual(report.risk.externalBlockedRecords, []);
    assert.equal(report.risk.overdueReviews, 0);
    assert.equal(report.requirements.total, 14);
    assert.equal(report.requirements.planned, 0);
    assert.equal(report.requirements.partialOrExternal, 0);
    assert.equal(report.requirements.unimplementedReleaseBlockers, 0);
    assert.deepEqual(report.requirements.unimplementedReleaseBlockerRecords, []);
    assert.equal(report.releaseTrust.enforced, false);
    assert.equal(report.releaseTrust.phase, "visibility");
    assert.equal(report.releaseTrust.highCriticalReleaseBlockerRisks, 0);
    assert.deepEqual(report.releaseTrust.highCriticalReleaseBlockerRiskRecords, []);
    assert.equal(report.training.missingRequiredSections.length, 0);
    assert.equal(report.training.missingRequiredTopics.length, 0);
    assert.equal(report.training.missingRequiredRoles.length, 0);
    assert.deepEqual(report.failures, []);
});

test("SDLC metrics report formats a reviewed risk fixture", (t) => {
    const report = buildSdlcMetricsReport({ cwd: makeRiskFixture(t), asOfDate: "2026-09-03" });
    const text = formatSdlcMetricsReport(report);

    assert.match(text, /SDLC security metrics/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Mode: visibility/);
    assert.match(text, /high\/critical open or blocked: 0/);
    assert.match(text, /external blocked: 0/);
    assert.match(text, /planned: 0/);
    assert.match(text, /partially implemented: 0/);
    assert.match(text, /Release trust posture:/);
    assert.match(text, /enforced: no/);
    assert.match(text, /phase: visibility/);
    assert.match(text, /high\/critical release-blocker risks: 0/);
    assert.match(text, /SDLC-MET-004: pass; requirements\.partialOrExternal=0; target <=4/);
});

test("SDLC pre-release trust mode has no deferred post-tag proof after closure", (t) => {
    const report = buildSdlcMetricsReport({ cwd: makeRiskFixture(t), asOfDate: "2026-09-03", releaseTrustMode: "pre" });
    const text = formatSdlcMetricsReport(report);

    assert.equal(report.passed, true);
    assert.equal(report.mode, "pre-release-trust");
    assert.equal(report.releaseTrust.enforced, true);
    assert.equal(report.releaseTrust.phase, "pre");
    assert.deepEqual(report.releaseTrust.highCriticalReleaseBlockerRiskRecords, []);
    assert.deepEqual(report.releaseTrust.deferredHighCriticalReleaseBlockerRiskRecords, []);
    assert.deepEqual(report.releaseTrust.unimplementedReleaseBlockerRequirementRecords, []);
    assert.deepEqual(report.releaseTrust.deferredUnimplementedReleaseBlockerRequirementRecords, []);
    assert.deepEqual(report.failures, []);
    assert.match(text, /Mode: pre-release-trust/);
    assert.match(text, /pre-release deferred high\/critical risks: 0/);
    assert.match(text, /pre-release deferred unimplemented requirements: 0/);
});

test("SDLC release-trust mode passes after hosted release proof closure", (t) => {
    const report = buildSdlcMetricsReport({ cwd: makeRiskFixture(t), asOfDate: "2026-09-03", releaseTrust: true });
    const text = formatSdlcMetricsReport(report);

    assert.equal(report.passed, true);
    assert.equal(report.mode, "release-trust");
    assert.equal(report.releaseTrust.enforced, true);
    assert.equal(report.releaseTrust.phase, "full");
    assert.equal(report.releaseTrust.highCriticalReleaseBlockerRisks, 0);
    assert.equal(report.releaseTrust.unimplementedReleaseBlockerRequirements, 0);
    assert.deepEqual(report.failures, []);
    assert.match(text, /Status: pass/);
    assert.match(text, /Mode: release-trust/);
});

test("reviewed open risks pass visibility but fail both release-trust modes", (t) => {
    const cwd = makeRiskFixture(t, { open: true });
    const visibility = buildSdlcMetricsReport({ cwd, asOfDate: "2026-09-03" });
    assert.equal(visibility.passed, true);
    assert.equal(visibility.risk.overdueReviews, 0);
    assert.deepEqual(visibility.risk.highCriticalOpenOrBlockedRecords, ["SEC-P0-003", "SEC-P0-005"]);
    assert.match(formatSdlcMetricsReport(visibility), /high\/critical open or blocked: 2/u);
    for (const releaseTrustMode of ["pre", "full"]) {
        const report = buildSdlcMetricsReport({ cwd, asOfDate: "2026-09-03", releaseTrustMode });
        assert.equal(report.passed, false);
        assert.equal(report.releaseTrust.enforced, true);
        assert.deepEqual(report.releaseTrust.highCriticalReleaseBlockerRiskRecords, ["SEC-P0-005"]);
        assert.deepEqual(report.releaseTrust.deferredHighCriticalReleaseBlockerRiskRecords, []);
        assert.deepEqual(report.failures, ["release trust has unresolved high/critical release-blocker risks: SEC-P0-005"]);
        assert.match(formatSdlcMetricsReport(report), /Status: fail/u);
    }
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
