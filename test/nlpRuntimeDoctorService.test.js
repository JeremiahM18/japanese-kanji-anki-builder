const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpRuntimeDoctorReport,
    describeModelArtifact,
    formatNlpRuntimeDoctorReport,
    resolvePackageAvailability,
} = require("../src/services/nlpRuntimeDoctorService");

function sha256Text(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function buildManifest({ runtimeOverrides = {}, modelOverrides = {}, artifactPath = null, artifactText = "fixture model" } = {}) {
    const artifact = artifactPath
        ? {
            path: artifactPath,
            sha256: sha256Text(artifactText),
            byteSize: Buffer.byteLength(artifactText),
        }
        : undefined;

    return {
        manifestPath: "templates/nlp_model_manifest.json",
        runtimes: {
            fixtureRuntime: {
                status: "active",
                runtimeType: "javascript",
                packageName: "zod",
                allowedTasks: ["embedding"],
                origin: {},
                ...runtimeOverrides,
            },
        },
        models: artifact
            ? {
                fixtureModel: {
                    status: "active",
                    runtimeId: "fixtureRuntime",
                    task: "embedding",
                    allowedUses: ["assistive-candidate-discovery"],
                    outputAuthority: "assistive_only",
                    promotionPolicy: "human_review_required",
                    localArtifact: artifact,
                    ...modelOverrides,
                },
            }
            : {},
    };
}

test("resolvePackageAvailability reports declared and installed package state", () => {
    const available = resolvePackageAvailability({
        packageName: "zod",
        packageJson: { dependencies: { zod: "^4.3.6" } },
        workspaceRoot: process.cwd(),
    });

    assert.equal(available.declared, true);
    assert.equal(available.declaredIn, "dependencies");
    assert.equal(available.installed, true);

    const missing = resolvePackageAvailability({
        packageName: "missing-nlp-package",
        packageJson: {},
        workspaceRoot: process.cwd(),
        requireResolveFn: () => {
            throw new Error("not found");
        },
    });

    assert.equal(missing.declared, false);
    assert.equal(missing.installed, false);
});

test("buildNlpRuntimeDoctorReport passes registered runtimes without active models", () => {
    const report = buildNlpRuntimeDoctorReport({
        loadManifestFn: () => ({
            manifestPath: "templates/nlp_model_manifest.json",
            runtimes: {
                candidateRuntime: {
                    status: "registered",
                    runtimeType: "javascript",
                    packageName: "candidate-runtime",
                    allowedTasks: ["embedding"],
                    origin: {},
                },
            },
            models: {},
        }),
        loadPackageJsonFn: () => ({ dependencies: {} }),
        requireResolveFn: () => {
            throw new Error("not installed");
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.readyForModelBackedSuggestions, false);
    assert.equal(report.counts.activeModels, 0);
});

test("buildNlpRuntimeDoctorReport verifies active runtime packages and model artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-runtime-"));
    const artifactText = "fixture model";
    fs.writeFileSync(path.join(dir, "fixture-model.bin"), artifactText);

    const report = buildNlpRuntimeDoctorReport({
        workspaceRoot: dir,
        loadManifestFn: () => buildManifest({
            artifactPath: "fixture-model.bin",
            artifactText,
        }),
        loadPackageJsonFn: () => ({ dependencies: { zod: "^4.3.6" } }),
        requireResolveFn: () => path.join(dir, "node_modules/zod/index.js"),
    });

    assert.equal(report.passed, true);
    assert.equal(report.readyForModelBackedSuggestions, true);
    assert.equal(report.runtimeChecks[0].packageStatus.declared, true);
    assert.equal(report.modelChecks[0].artifact.byteSizeMatches, true);
    assert.equal(report.modelChecks[0].artifact.sha256Matches, true);
});

test("buildNlpRuntimeDoctorReport fails active runtime and artifact mismatches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-runtime-"));
    fs.writeFileSync(path.join(dir, "fixture-model.bin"), "changed model");

    const report = buildNlpRuntimeDoctorReport({
        workspaceRoot: dir,
        loadManifestFn: () => buildManifest({
            artifactPath: "fixture-model.bin",
            artifactText: "expected model",
        }),
        loadPackageJsonFn: () => ({ dependencies: {} }),
        requireResolveFn: () => {
            throw new Error("not installed");
        },
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /not declared in package.json/);
    assert.match(report.errors.join("\n"), /not resolvable from the workspace/);
    assert.match(report.errors.join("\n"), /byteSize mismatch/);
    assert.match(report.errors.join("\n"), /sha256 mismatch/);
});

test("describeModelArtifact reports missing artifact paths", () => {
    const artifact = describeModelArtifact({
        localArtifact: {
            path: "missing-model.bin",
            sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            byteSize: 123,
        },
    }, os.tmpdir());

    assert.equal(artifact.exists, false);
    assert.equal(artifact.byteSizeMatches, false);
    assert.equal(artifact.sha256Matches, false);
});

test("formatNlpRuntimeDoctorReport renders runtime and release boundaries", () => {
    const text = formatNlpRuntimeDoctorReport({
        passed: true,
        readyForModelBackedSuggestions: false,
        manifestPath: "templates/nlp_model_manifest.json",
        workspaceRoot: ".",
        packageJsonPath: "package.json",
        counts: {
            runtimes: 1,
            activeRuntimes: 0,
            models: 0,
            activeModels: 0,
        },
        runtimeChecks: [{
            id: "candidateRuntime",
            status: "registered",
            runtimeType: "javascript",
            packageStatus: {
                packageName: "candidate-runtime",
                declared: false,
                installed: false,
            },
            errors: [],
        }],
        modelChecks: [],
        errors: [],
        releaseBoundary: {
            runtimeReadinessActivatesModelOutputAuthority: false,
            modelOutputsAreCertificationEvidence: false,
            modelOutputsMayWriteTrackedTemplatesDirectly: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Runtime Doctor/);
    assert.match(text, /runtime readiness activates model output authority: no/);
    assert.match(text, /model outputs certify cards: no/);
});
