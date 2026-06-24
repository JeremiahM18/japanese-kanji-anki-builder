const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildNlpEmbeddingSmokeGateReport,
    formatNlpEmbeddingSmokeGateReport,
} = require("../src/services/nlpEmbeddingSmokeGateService");
const {
    parseArgs,
} = require("../scripts/runNlpEmbeddingSmokeGate");

function makeTempWorkspace() {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-smoke-gate-"));
    fs.mkdirSync(path.join(workspaceRoot, "templates"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "templates", "manifest.json"), "{\"version\":1}\n", "utf8");
    fs.writeFileSync(path.join(workspaceRoot, "templates", "benchmark.json"), "{\"version\":1}\n", "utf8");
    return workspaceRoot;
}

function buildManifest() {
    return {
        models: {
            fixtureModel: {
                status: "active",
                task: "embedding",
            },
        },
    };
}

function buildPassingEvaluationReport() {
    return {
        passed: true,
        modelId: "fixtureModel",
        benchmarkId: "fixture-benchmark",
        metrics: {
            positiveMean: 0.9,
            negativeMean: 0.1,
            margin: 0.8,
            positiveMin: 0.9,
            negativeMax: 0.1,
        },
        releaseBoundary: {
            evaluationCertifiesCards: false,
            evaluationMayWriteTrackedTemplatesDirectly: false,
            evaluationClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    };
}

test("buildNlpEmbeddingSmokeGateReport reuses unchanged passing smoke without evaluation", async () => {
    const workspaceRoot = makeTempWorkspace();
    const smokeGatePath = "out/nlp-runtime-smoke/fixture-smoke.json";
    let evaluationCalls = 0;
    const commonOptions = {
        workspaceRoot,
        manifestPath: "templates/manifest.json",
        benchmarkPath: "templates/benchmark.json",
        cacheDir: "cache/nlp-models",
        smokeGatePath,
        loadManifestFn: () => buildManifest(),
    };
    const first = await buildNlpEmbeddingSmokeGateReport({
        ...commonOptions,
        now: () => new Date("2026-06-24T00:00:00.000Z"),
        buildEvaluationReportFn: async () => {
            evaluationCalls += 1;
            return buildPassingEvaluationReport();
        },
    });
    const second = await buildNlpEmbeddingSmokeGateReport({
        ...commonOptions,
        buildEvaluationReportFn: async () => {
            evaluationCalls += 1;
            throw new Error("Evaluation should not run for unchanged passing smoke.");
        },
    });

    assert.equal(evaluationCalls, 1);
    assert.equal(first.skipped, false);
    assert.equal(second.skipped, true);
    assert.equal(second.skipReason, "unchanged-passing-smoke");
    assert.equal(second.passed, true);
    assert.match(formatNlpEmbeddingSmokeGateReport(second), /reused unchanged passing smoke/);
    assert.match(formatNlpEmbeddingSmokeGateReport(second), /smoke gate certifies cards: no/);
});

test("buildNlpEmbeddingSmokeGateReport reruns when manifest hash changes or force is set", async () => {
    const workspaceRoot = makeTempWorkspace();
    const smokeGatePath = "out/nlp-runtime-smoke/fixture-smoke.json";
    let evaluationCalls = 0;
    const commonOptions = {
        workspaceRoot,
        manifestPath: "templates/manifest.json",
        benchmarkPath: "templates/benchmark.json",
        cacheDir: "cache/nlp-models",
        smokeGatePath,
        loadManifestFn: () => buildManifest(),
        buildEvaluationReportFn: async () => {
            evaluationCalls += 1;
            return buildPassingEvaluationReport();
        },
    };

    await buildNlpEmbeddingSmokeGateReport(commonOptions);
    fs.writeFileSync(path.join(workspaceRoot, "templates", "manifest.json"), "{\"version\":2}\n", "utf8");
    const afterHashChange = await buildNlpEmbeddingSmokeGateReport(commonOptions);
    const forced = await buildNlpEmbeddingSmokeGateReport({
        ...commonOptions,
        force: true,
    });

    assert.equal(evaluationCalls, 3);
    assert.equal(afterHashChange.skipped, false);
    assert.equal(forced.skipped, false);
    assert.equal(forced.skipReason, "forced");
});

test("runNlpEmbeddingSmokeGate parseArgs supports cache-aware smoke controls", () => {
    const options = parseArgs([
        "--json",
        "--force-smoke",
        "--manifest=templates/nlp_model_manifest.json",
        "--benchmark=templates/nlp_embedding_model_benchmark.json",
        "--model-id=fixture",
        "--cache-dir=cache/nlp-models",
        "--smoke-gate=out/nlp-runtime-smoke/test.json",
        "--workspace-root=.",
        "--allow-remote-models",
        "--oops",
    ]);

    assert.equal(options.json, true);
    assert.equal(options.force, true);
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.benchmarkPath, "templates/nlp_embedding_model_benchmark.json");
    assert.equal(options.modelId, "fixture");
    assert.equal(options.cacheDir, "cache/nlp-models");
    assert.equal(options.smokeGatePath, "out/nlp-runtime-smoke/test.json");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.allowRemoteModels, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});
