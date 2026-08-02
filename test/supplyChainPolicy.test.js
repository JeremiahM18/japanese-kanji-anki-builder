const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    ACTION_ALLOWLIST,
    LIFECYCLE_SCRIPT_ALLOWLIST,
    auditDependencySecurityOverrides,
    auditOutOfRangeOverrideCompatibility,
    buildSupplyChainAuditReport,
    formatSupplyChainAuditReport,
    satisfiesReviewedSimpleRange,
} = require("../scripts/auditSupplyChain");
const fs = require("node:fs");
const os = require("node:os");

const repoRoot = path.resolve(__dirname, "..");

function loadSharpOverride() {
    const policy = JSON.parse(fs.readFileSync(
        path.join(repoRoot, "templates", "dependency_security_overrides.json"),
        "utf8"
    ));
    return {
        entry: policy.overrides.find((candidate) => candidate.packageName === "sharp"),
        policy,
    };
}

function makeOverrideCompatibilityFixture() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "override-compatibility-"));
    for (const relativePath of [
        path.join("templates", "nlp_model_manifest.json"),
        path.join("src", "services", "nlpEmbeddingModelEvaluationService.js"),
    ]) {
        const sourcePath = path.join(repoRoot, relativePath);
        const targetPath = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
    }
    fs.mkdirSync(path.join(tempDir, "scripts"), { recursive: true });
    return tempDir;
}

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
    const sharpOverride = report.dependencySecurityOverrides.entries.find((entry) => entry.packageName === "sharp");
    assert.deepEqual(sharpOverride.compatibilityBoundary.sourceBoundary.activeModelTasks, ["embedding"]);
    assert.deepEqual(
        sharpOverride.compatibilityBoundary.sourceBoundary.productionImports,
        [{
            path: "src/services/nlpEmbeddingModelEvaluationService.js",
            pipelineCallCount: 1,
            pipelineTasks: ["feature-extraction"],
        }]
    );
    assert.equal(report.package.registryHosts["registry.npmjs.org"], report.package.packageCount);
    assert.deepEqual(
        report.package.lifecycleScripts.map((entry) => entry.key).sort(),
        Object.keys(LIFECYCLE_SCRIPT_ALLOWLIST).sort()
    );
    assert.equal(report.workflows.length, 3);
    assert.equal(report.workflows.some((workflow) => workflow.relativePath === ".github/workflows/codeql.yml"), true);
    const installSteps = report.workflows.flatMap((workflow) => workflow.installSteps);
    assert.equal(installSteps.every((step) => step.hasOnnxruntimeNodeInstallSkip), true);
    assert.equal(installSteps.filter((step) => step.kind === "no-script-bootstrap").length, 6);
    assert.equal(installSteps.filter((step) => step.kind === "reviewed-lifecycle-activation").length, 6);
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
    assert.match(text, /compatibility boundary: imports=src\/services\/nlpEmbeddingModelEvaluationService\.js/);
    assert.match(text, /pipeline tasks=feature-extraction; active model tasks=embedding/);
    assert.match(text, /upstream 4\.2\.0 declares \^0\.34\.5/);
    assert.match(text, /GitHub Actions pins:/);
    assert.match(text, /Install policy:/);
    assert.match(text, /no-script bootstrap=4; reviewed lifecycle activation=4/);
    assert.match(text, /Release artifact boundary:/);
});

test("supply-chain audit report preserves validation errors for malformed compatibility boundaries", () => {
    const report = buildSupplyChainAuditReport({ cwd: repoRoot });
    const sharpOverride = report.dependencySecurityOverrides.entries.find((entry) => entry.packageName === "sharp");
    sharpOverride.compatibilityBoundary = {};

    assert.doesNotThrow(() => formatSupplyChainAuditReport(report));
    assert.match(formatSupplyChainAuditReport(report), /compatibility boundary: imports=unavailable/);
    assert.match(formatSupplyChainAuditReport(report), /upstream unavailable declares unavailable/);
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
        cwd: repoRoot,
        packageJson,
        lock,
        policy,
        asOfDate: "2026-07-26",
    });

    assert.equal(report.errors.some((error) => /package-lock\.json declares \^0\.34\.1/u.test(error)), true);
    assert.equal(report.errors.some((error) => /rangeCompatibility/u.test(error)), true);
});

test("outside-range override compatibility audit rejects an undeclared production import", () => {
    const tempDir = makeOverrideCompatibilityFixture();
    try {
        const { entry, policy } = loadSharpOverride();
        const baseline = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry,
            policyCheckedAt: policy.checkedAt,
        });
        assert.deepEqual(baseline.errors, []);

        const visionPath = path.join(tempDir, "src", "services", "visionPipeline.jsx");
        fs.writeFileSync(
            visionPath,
            "const transformers = require(\"@huggingface/transformers\");\nmodule.exports = transformers;\n",
            "utf8"
        );
        const report = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry,
            policyCheckedAt: policy.checkedAt,
        });
        assert.equal(report.errors.some((error) => (
            /production import paths drifted/u.test(error)
            && /src\/services\/visionPipeline\.jsx/u.test(error)
        )), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("outside-range override compatibility audit ignores commented decoys and rejects computed imports", () => {
    const tempDir = makeOverrideCompatibilityFixture();
    try {
        const { entry, policy } = loadSharpOverride();
        const servicePath = path.join(tempDir, "src", "services", "nlpEmbeddingModelEvaluationService.js");
        fs.writeFileSync(servicePath, `
/*
const { pipeline, env } = await import("@huggingface/transformers");
pipeline("feature-extraction", "comment-only");
*/
async function build(task) {
    const { pipeline: buildPipeline } = await import("@huggingface/" + "transformers");
    return buildPipeline(task, "vision-model");
}
module.exports = { build };
`, "utf8");

        const report = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry,
            policyCheckedAt: policy.checkedAt,
        });
        assert.equal(report.errors.some((error) => /cannot prove computed dynamic-import target/u.test(error)), true);
        assert.equal(report.errors.some((error) => /production import paths drifted/u.test(error)), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("outside-range override compatibility audit rejects pipeline and active-model task expansion", () => {
    const tempDir = makeOverrideCompatibilityFixture();
    try {
        const { entry, policy } = loadSharpOverride();
        const servicePath = path.join(tempDir, "src", "services", "nlpEmbeddingModelEvaluationService.js");
        const serviceText = fs.readFileSync(servicePath, "utf8")
            .replace('pipeline("feature-extraction"', 'pipeline("image-classification"');
        fs.writeFileSync(servicePath, serviceText, "utf8");

        const manifestPath = path.join(tempDir, "templates", "nlp_model_manifest.json");
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest.models["vision-expansion"] = {
            status: "active",
            runtimeId: "transformers-js",
            task: "image-classification",
        };
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

        const report = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry,
            policyCheckedAt: policy.checkedAt,
        });
        assert.equal(report.errors.some((error) => /pipeline tasks drifted/u.test(error)), true);
        assert.equal(report.errors.some((error) => /active model tasks drifted/u.test(error)), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("outside-range override compatibility audit rejects stale upstream-resolution posture", () => {
    const tempDir = makeOverrideCompatibilityFixture();
    try {
        const { entry, policy } = loadSharpOverride();
        const mutatedEntry = structuredClone(entry);
        mutatedEntry.compatibilityBoundary.upstreamEvidence.latestDeclaredRange = "^0.35.0";
        const report = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry: mutatedEntry,
            policyCheckedAt: policy.checkedAt,
        });
        assert.equal(report.errors.some((error) => /now accepts 0\.35\.3/u.test(error)), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
