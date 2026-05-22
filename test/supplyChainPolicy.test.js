const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    ACTION_ALLOWLIST,
    LIFECYCLE_SCRIPT_ALLOWLIST,
    buildSupplyChainAuditReport,
    formatSupplyChainAuditReport,
} = require("../scripts/auditSupplyChain");

const repoRoot = path.resolve(__dirname, "..");

test("supply-chain audit keeps lockfile, install scripts, workflows, and release artifacts governed", () => {
    const report = buildSupplyChainAuditReport({ cwd: repoRoot });

    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
    assert.equal(report.package.registryHosts["registry.npmjs.org"], report.package.packageCount);
    assert.deepEqual(
        report.package.lifecycleScripts.map((entry) => entry.key).sort(),
        Object.keys(LIFECYCLE_SCRIPT_ALLOWLIST).sort()
    );
    assert.equal(report.workflows.length, 2);
    assert.ok(report.releaseArtifacts.requiredReleaseBundlePaths.includes("release-artifacts.sha256"));
});

test("supply-chain audit pins GitHub Actions to reviewed commit SHAs", () => {
    const report = buildSupplyChainAuditReport({ cwd: repoRoot });
    const expectedPins = new Set(Object.entries(ACTION_ALLOWLIST).map(([action, entry]) => `${action}@${entry.sha}`));
    const actualPins = new Set(report.workflows.flatMap((workflow) => workflow.actionUses));

    for (const pin of expectedPins) {
        assert.equal(actualPins.has(pin), true, `Missing reviewed GitHub Actions pin: ${pin}`);
    }
});

test("supply-chain audit report is readable for local verification", () => {
    const report = buildSupplyChainAuditReport({ cwd: repoRoot });
    const text = formatSupplyChainAuditReport(report);

    assert.match(text, /Supply chain audit/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Lifecycle script packages:/);
    assert.match(text, /GitHub Actions pins:/);
    assert.match(text, /Release artifact boundary:/);
});
