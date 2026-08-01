const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    ACTION_ALLOWLIST,
    LIFECYCLE_SCRIPT_ALLOWLIST,
    auditDependencySecurityOverrides,
    buildSupplyChainAuditReport,
    formatSupplyChainAuditReport,
    satisfiesReviewedSimpleRange,
} = require("../scripts/auditSupplyChain");
const fs = require("node:fs");

const repoRoot = path.resolve(__dirname, "..");

test("supply-chain audit keeps lockfile, install scripts, workflows, and release artifacts governed", () => {
    const report = buildSupplyChainAuditReport({ cwd: repoRoot });

    assert.deepEqual(report.errors, []);
    assert.equal(report.ok, true);
    assert.equal(report.dependencySecurityOverrides.entries.length, 2);
    assert.equal(
        report.dependencySecurityOverrides.entries.some((entry) => (
            entry.parentPackage === "@huggingface/transformers"
            && entry.packageName === "sharp"
            && entry.forcedVersion === "0.35.3"
        )),
        true
    );
    assert.equal(report.package.registryHosts["registry.npmjs.org"], report.package.packageCount);
    assert.deepEqual(
        report.package.lifecycleScripts.map((entry) => entry.key).sort(),
        Object.keys(LIFECYCLE_SCRIPT_ALLOWLIST).sort()
    );
    assert.equal(report.workflows.length, 3);
    assert.equal(report.workflows.some((workflow) => workflow.relativePath === ".github/workflows/codeql.yml"), true);
    assert.equal(
        report.workflows
            .flatMap((workflow) => workflow.installSteps)
            .every((step) => step.hasOnnxruntimeNodeInstallSkip),
        true
    );
    assert.ok(report.releaseArtifacts.requiredReleaseBundlePaths.includes(".release-bundle/release-artifacts.sha256"));
    assert.ok(report.releaseArtifacts.requiredReleaseBundlePaths.includes(".release-bundle/sbom.cdx.json"));
    assert.ok(report.releaseArtifacts.requiredReleaseBundlePaths.includes(".release-bundle/dependency-licenses.json"));
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
    assert.match(text, /Dependency security overrides:/);
    assert.match(text, /GHSA-f88m-g3jw-g9cj/);
    assert.match(text, /GitHub Actions pins:/);
    assert.match(text, /Install policy:/);
    assert.match(text, /Release artifact boundary:/);
});

test("dependency override audit computes range posture and rejects recorded-range drift", () => {
    assert.equal(satisfiesReviewedSimpleRange("7.5.22", "^7.0.1"), true);
    assert.equal(satisfiesReviewedSimpleRange("0.35.3", "^0.34.1"), false);

    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
    const policy = JSON.parse(fs.readFileSync(
        path.join(repoRoot, "templates", "dependency_security_overrides.json"),
        "utf8"
    ));
    policy.overrides[0].declaredParentRange = "^0.35.0";
    const report = auditDependencySecurityOverrides({
        packageJson,
        lock,
        policy,
        asOfDate: "2026-07-26",
    });

    assert.equal(report.errors.some((error) => /package-lock\.json declares \^0\.34\.1/u.test(error)), true);
    assert.equal(report.errors.some((error) => /rangeCompatibility/u.test(error)), true);
});
