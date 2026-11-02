const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    ACTION_ALLOWLIST,
    LIFECYCLE_SCRIPT_ALLOWLIST,
    auditDependencySecurityOverrides,
    auditPackageManifest,
    auditOutOfRangeOverrideCompatibility,
    auditDevToolGlobCompatibility,
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
    assert.equal(report.dependencySecurityOverrides.entries.length, 5);
    assert.equal(
        report.dependencySecurityOverrides.entries.some((entry) => (
            entry.parentPackage === "@huggingface/transformers"
            && entry.packageName === "sharp"
            && entry.forcedVersion === "0.35.5"
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
    assert.deepEqual(report.package.allowScripts, [
        "fsevents@2.3.3",
        "onnxruntime-node@1.21.0",
        "protobufjs@7.6.5",
    ]);
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

test("supply-chain audit requires exact-version npm allowScripts parity", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));

    const missing = structuredClone(packageJson);
    delete missing.allowScripts["onnxruntime-node@1.21.0"];
    assert.equal(
        auditPackageManifest({ packageJson: missing, lock }).errors.some((error) => (
            /must explicitly approve reviewed lifecycle package onnxruntime-node@1\.21\.0/u.test(error)
        )),
        true
    );

    const broad = structuredClone(packageJson);
    broad.allowScripts.protobufjs = true;
    assert.equal(
        auditPackageManifest({ packageJson: broad, lock }).errors.some((error) => (
            /unreviewed, broad, stale, or unexpected entry protobufjs/u.test(error)
        )),
        true
    );

    const denied = structuredClone(packageJson);
    denied.allowScripts["protobufjs@7.6.5"] = false;
    assert.equal(
        auditPackageManifest({ packageJson: denied, lock }).errors.some((error) => (
            /allowScripts entry protobufjs@7\.6\.5 must be exactly true/u.test(error)
        )),
        true
    );
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
    assert.match(text, /npm allowScripts approvals:/);
    assert.match(text, /fsevents@2\.3\.3/);
    assert.match(text, /Dependency security overrides:/);
    assert.match(text, /GHSA-wq5f-xc86-pv6w/);
    assert.match(text, /compatibility boundary: imports=src\/services\/nlpEmbeddingModelEvaluationService\.js/);
    assert.match(text, /pipeline tasks=feature-extraction; active model tasks=embedding/);
    assert.match(text, /upstream 4\.3\.2 declares \^0\.35\.4/);
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
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
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
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
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
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
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
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
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
        mutatedEntry.compatibilityBoundary.upstreamEvidence.resolutionStatus = "parent_range_still_excludes_forced_version";
        delete mutatedEntry.compatibilityBoundary.upstreamEvidence.migrationRationale;
        const report = auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry: mutatedEntry,
            policyCheckedAt: policy.checkedAt,
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
        });
        assert.equal(report.errors.some((error) => /now accepts 0\.35\.5/u.test(error)), true);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("newer-major override migration is explicit, pinned, and fail-closed", () => {
    const tempDir = makeOverrideCompatibilityFixture();
    try {
        const { entry, policy } = loadSharpOverride();
        entry.forcedVersion = "0.35.5";
        entry.compatibilityBoundary.upstreamEvidence = {
            checkedAt: policy.checkedAt,
            latestParentVersion: "4.3.2",
            latestDeclaredRange: "^0.35.4",
            resolutionStatus: "newer_parent_major_accepts_forced_version_pending_migration",
            verificationCommand: "npm view @huggingface/transformers version dependencies.sharp --json",
            migrationRationale: "Retain the pinned 3.8.1 text runtime until its model benchmark is revalidated on the new major.",
        };
        const audit = (candidate = entry, overrides = {}) => auditOutOfRangeOverrideCompatibility({
            cwd: tempDir,
            entry: candidate,
            policyCheckedAt: policy.checkedAt,
            installedParentVersion: "3.8.1",
            pinnedParentVersion: "3.8.1",
            ...overrides,
        });
        assert.deepEqual(audit().errors, []);
        for (const [field, value, message] of [
            ["latestParentVersion", "3.9.0", /strictly newer parent major/u],
            ["latestParentVersion", "2.9.0", /strictly newer parent major/u],
            ["latestDeclaredRange", "^0.34.1", /requires latest upstream range/u],
            ["latestDeclaredRange", "", /must record a reviewed dependency range/u],
            ["migrationRationale", "   ", /nonempty migrationRationale/u],
            ["resolutionStatus", "unreviewed", /must declare an unresolved parent range/u],
        ]) {
            const changed = structuredClone(entry);
            changed.compatibilityBoundary.upstreamEvidence[field] = value;
            assert.ok(audit(changed).errors.some((error) => message.test(error)), field);
        }
        const missingReason = structuredClone(entry);
        delete missingReason.compatibilityBoundary.upstreamEvidence.migrationRationale;
        assert.ok(audit(missingReason).errors.some((error) => /exact governed fields/u.test(error)));
        for (const pin of [undefined, "^3.8.1", "3.8.0"]) {
            assert.ok(audit(entry, { pinnedParentVersion: pin }).errors.some((error) => /exact direct parent pin/u.test(error)));
        }
        assert.ok(audit(entry, { installedParentVersion: undefined }).errors.some((error) => /exact direct parent pin/u.test(error)));
        const unknownField = structuredClone(entry);
        unknownField.compatibilityBoundary.upstreamEvidence.ignoreChecks = true;
        assert.ok(audit(unknownField).errors.some((error) => /exact governed fields/u.test(error)));

        const oldStatus = structuredClone(entry);
        oldStatus.compatibilityBoundary.upstreamEvidence.resolutionStatus = "parent_range_still_excludes_forced_version";
        oldStatus.compatibilityBoundary.upstreamEvidence.latestDeclaredRange = "^0.34.1";
        delete oldStatus.compatibilityBoundary.upstreamEvidence.migrationRationale;
        assert.deepEqual(audit(oldStatus).errors, []);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("development glob overrides reject production graphs, source drift and relaxed validation", () => {
    const policy = JSON.parse(fs.readFileSync(path.join(repoRoot, "templates/dependency_security_overrides.json"), "utf8"));
    const lock = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
    for (const entry of policy.overrides.filter((item) => item.packageName === "minimatch")) {
        const audit = (candidate = entry, candidateLock = lock) => auditDevToolGlobCompatibility({ cwd: repoRoot, entry: candidate, lock: candidateLock });
        assert.deepEqual(audit().errors, []);
        for (const [mutate, expected] of [
            [(copy) => { copy.compatibilityBoundary.consumerFiles[0].sha256 = "0".repeat(64); }, /source hash drifted/u],
            [(copy) => { copy.compatibilityBoundary.consumerFiles[0].path = "../../package.json"; }, /file paths drifted/u],
            [(copy) => { copy.compatibilityBoundary.parentVersion = "0.0.0"; }, /exact reviewed development-only parent/u],
            [(copy) => { copy.compatibilityBoundary.liveValidationCommands = []; }, /requires full lint/u],
            [(copy) => { copy.parentPackage = "express"; }, /not a reviewed development-tool/u],
            [(copy) => { copy.forcedVersion = "10.2.6"; }, /not a reviewed development-tool/u],
            [(copy) => { copy.compatibilityBoundary.ignore = true; }, /exact governed fields/u],
            [(copy) => { copy.compatibilityBoundary.consumerFiles = [null]; }, /file paths drifted/u],
        ]) {
            const changed = structuredClone(entry);
            mutate(changed);
            assert.ok(audit(changed).errors.some((error) => expected.test(error)), String(expected));
        }
        const production = structuredClone(lock);
        production.packages["node_modules/minimatch"].dev = false;
        assert.ok(audit(entry, production).errors.some((error) => /development-only and patched/u.test(error)));
        const staleNested = structuredClone(lock);
        staleNested.packages["node_modules/other/node_modules/minimatch"] = { version: "10.2.6", dev: true };
        assert.ok(audit(entry, staleNested).errors.some((error) => /development-only and patched/u.test(error)));
        const newConsumer = structuredClone(lock);
        newConsumer.packages["node_modules/other"] = { version: "1.0.0", dev: true, dependencies: { minimatch: "^11.0.1" } };
        assert.ok(audit(entry, newConsumer).errors.some((error) => /unreviewed or production minimatch consumer/u.test(error)));
        const nestedKnownConsumer = structuredClone(lock);
        nestedKnownConsumer.packages["node_modules/other/node_modules/eslint"] = {
            version: "99.0.0", dev: true, dependencies: { minimatch: "^11.0.1" },
        };
        assert.ok(audit(entry, nestedKnownConsumer).errors.some((error) => /unreviewed or production minimatch consumer/u.test(error)));
    }
});

test("patched minimatch preserves reviewed consumer APIs and cross-platform glob semantics", () => {
    const { createRequire } = require("node:module");
    for (const parent of ["eslint", "@eslint/config-array", "nodemon"]) {
        const consumerRequire = createRequire(require.resolve(parent));
        assert.equal(consumerRequire("minimatch/package.json").version, "11.0.1");
        const { minimatch, Minimatch } = consumerRequire("minimatch");
        for (const platform of ["linux", "darwin", "win32"]) {
            const options = { platform, dot: true };
            const matcher = new Minimatch("src/**/*.{js,cjs}", options);
            assert.equal(matcher.pattern, "src/**/*.{js,cjs}");
            assert.equal(matcher.match("src/nested/app.js"), true);
            assert.equal(matcher.match("src/nested"), false);
            assert.equal(matcher.match("src/nested", true), true);
            assert.equal(matcher.match("test/nested", true), false);
            assert.equal(matcher.match("src/.hidden.cjs"), true);
            assert.equal(matcher.match("src/app.txt"), false);
            assert.equal(minimatch("node_modules/pkg/a.js", "!**/node_modules/**", options), false);
            assert.equal(minimatch("src/a.js", "!**/node_modules/**", options), true);
        }
        const windows = { platform: "win32", nocase: true, windowsPathsNoEscape: true, dot: true };
        assert.equal(minimatch("C:\\PROJECT\\src\\APP.JS", "c:/project/src/**/*.js", windows), true);
        assert.equal(minimatch("//HOST/SHARE/src/a.js", "//host/share/src/**/*.js", windows), true);
        assert.equal(minimatch("src/a.js", "src/*.JS", { platform: "linux" }), false);
        // The advisory's amplification path is bounded by the patched engine.
        const bounded = new Minimatch(Array(10).fill("**/../a/b").join("/"), { optimizationLevel: 2, braceExpandMax: 64 });
        assert.ok(bounded.set.length <= 64);
    }
});

test("ESLint, config-array and nodemon integrate with the reviewed glob override", async () => {
    const { ESLint } = require("eslint");
    const { ConfigArray } = require("@eslint/config-array");
    const match = require("nodemon/lib/monitor/match");
    const eslint = new ESLint({ cwd: repoRoot });
    const results = await eslint.lintFiles(["src/{app,server}.js"]);
    assert.deepEqual(results.map((result) => path.basename(result.filePath)).sort(), ["app.js", "server.js"]);
    assert.equal(await eslint.isPathIgnored(path.join(repoRoot, "out", "ignored.js")), true);
    assert.equal(await eslint.isPathIgnored(path.join(repoRoot, "src", "app.js")), false);
    const configs = new ConfigArray([{ ignores: ["**/ignored/**"] }, { files: ["**/*.{js,cjs}"] }], { basePath: repoRoot });
    configs.normalizeSync();
    assert.equal(configs.getConfigStatus(path.join(repoRoot, "src", ".hidden.js")), "matched");
    assert.equal(configs.getConfigStatus(path.join(repoRoot, "ignored", "a.js")), "ignored");
    assert.equal(configs.getConfigStatus(path.join(repoRoot, "src", "a.txt")), "unconfigured");
    const watched = match(["src/app.js", "src/app.txt", "node_modules/pkg/a.js"], ["**/src/**", "!**/node_modules/**"], "js");
    const expectedPath = path.resolve("src/app.js");
    const expectedWatchedPath = process.platform === "win32"
        ? expectedPath.slice(0, 1).toLowerCase() + expectedPath.slice(1)
        : expectedPath;
    assert.deepEqual(watched.result, [expectedWatchedPath]);
});
