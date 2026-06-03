const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildBranchProtectionAuditReport,
    extractCiCheckNames,
    formatBranchProtectionAuditReport,
} = require("../scripts/auditBranchProtection");

const repoRoot = path.resolve(__dirname, "..");

test("branch protection policy, docs, and CI checks stay aligned", () => {
    const report = buildBranchProtectionAuditReport({ cwd: repoRoot });

    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
    assert.equal(report.branch, "main");
    assert.equal(report.requiredStatusChecks.length, 13);
    assert.equal(report.requiredStatusChecks.includes("CodeQL Analysis (actions)"), true);
    assert.equal(report.requiredStatusChecks.includes("CodeQL Analysis (javascript-typescript)"), true);
    assert.equal(report.requiredSettings.requiredApprovingReviewCount, 0);
    assert.equal(report.requiredSettings.requireCodeOwnerReviews, false);
    assert.equal(report.requiredSettings.requireBranchesUpToDateBeforeMerging, true);
    assert.equal(report.requiredSettings.doNotAllowBypassing, true);
});

test("branch protection audit expands matrix job names", () => {
    const workflowText = [
        "jobs:",
        "  sample:",
        "    name: Example ${{ matrix.os }} Node ${{ matrix.node-version }}",
        "    strategy:",
        "      matrix:",
        "        os:",
        "          - ubuntu-latest",
        "          - windows-2025-vs2026",
        "        node-version:",
        "          - 20",
        "          - 22",
    ].join("\n");

    assert.deepEqual(extractCiCheckNames(workflowText), [
        "Example ubuntu-latest Node 20",
        "Example ubuntu-latest Node 22",
        "Example windows-2025-vs2026 Node 20",
        "Example windows-2025-vs2026 Node 22",
    ]);
});

test("branch protection audit report is readable for local verification", () => {
    const report = buildBranchProtectionAuditReport({ cwd: repoRoot });
    const text = formatBranchProtectionAuditReport(report);

    assert.match(text, /Branch protection audit/);
    assert.match(text, /Status: pass/);
    assert.match(text, /Required status checks: 13/);
    assert.match(text, /Dependency Review/);
});
