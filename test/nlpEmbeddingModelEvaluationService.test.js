const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseNlpEmbeddingBenchmark,
} = require("../src/datasets/nlpEmbeddingBenchmark");
const {
    buildNlpEmbeddingModelEvaluationReport,
    cosineSimilarity,
    evaluateEmbeddingBenchmark,
    formatNlpEmbeddingModelEvaluationReport,
} = require("../src/services/nlpEmbeddingModelEvaluationService");

function buildBenchmark(overrides = {}) {
    return {
        version: 1,
        benchmarkId: "fixture-benchmark",
        description: "Fixture embedding benchmark.",
        task: "embedding",
        pairs: [
            {
                id: "same-topic",
                label: "positive",
                textA: "日本語を勉強します。",
                textB: "日本語を学びます。",
                rationale: "Same topic.",
            },
            {
                id: "different-topic",
                label: "negative",
                textA: "日本語を勉強します。",
                textB: "赤い花を買います。",
                rationale: "Different topic.",
            },
        ],
        thresholds: {
            minimumMargin: 0.25,
            requirePositiveMinAboveNegativeMax: true,
        },
        limitations: ["Fixture only."],
        ...overrides,
    };
}

function buildManifest() {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        models: {
            fixtureEmbeddingModel: {
                status: "active",
                runtimeId: "transformers-js",
                task: "embedding",
                modelFamily: "fixture-family",
                modelVersion: "fixture-version",
                origin: {
                    huggingFaceModelId: "fixture/model",
                },
                embeddingConfig: {
                    embeddingDimension: 2,
                    pooling: "mean",
                    normalized: true,
                    distanceMetric: "cosine",
                    dtype: "q8",
                },
            },
        },
    };
}

test("parseNlpEmbeddingBenchmark requires both positive and negative pairs", () => {
    const benchmark = parseNlpEmbeddingBenchmark(buildBenchmark());
    assert.equal(benchmark.benchmarkId, "fixture-benchmark");

    assert.throws(() => parseNlpEmbeddingBenchmark(buildBenchmark({
        pairs: [
            {
                id: "only-positive",
                label: "positive",
                textA: "a",
                textB: "b",
                rationale: "Fixture.",
            },
            {
                id: "only-positive-2",
                label: "positive",
                textA: "c",
                textB: "d",
                rationale: "Fixture.",
            },
        ],
    })), /both positive and negative pairs/);
});

test("evaluateEmbeddingBenchmark scores semantic separation with supplied embeddings", async () => {
    const vectors = new Map([
        ["日本語を勉強します。", [1, 0]],
        ["日本語を学びます。", [0.9, 0.1]],
        ["赤い花を買います。", [0, 1]],
    ]);

    const report = await evaluateEmbeddingBenchmark({
        benchmark: parseNlpEmbeddingBenchmark(buildBenchmark()),
        embedTextFn: async (text) => vectors.get(text),
    });

    assert.equal(report.passed, true);
    assert.equal(report.pairs.length, 2);
    assert.equal(report.metrics.positiveMean > report.metrics.negativeMean, true);
    assert.equal(report.thresholdResults.minimumMargin, true);
    assert.equal(report.thresholdResults.positiveMinAboveNegativeMax, true);
});

test("cosineSimilarity rejects dimension and zero-vector problems", () => {
    assert.equal(Math.round(cosineSimilarity([1, 0], [1, 0]) * 1000) / 1000, 1);
    assert.throws(() => cosineSimilarity([1], [1, 0]), /Cannot compare embedding dimensions/);
    assert.throws(() => cosineSimilarity([0, 0], [1, 0]), /zero-magnitude/);
});

test("buildNlpEmbeddingModelEvaluationReport uses manifest model config and release boundaries", async () => {
    const report = await buildNlpEmbeddingModelEvaluationReport({
        manifestPath: "templates/nlp_model_manifest.json",
        benchmarkPath: "templates/nlp_embedding_model_benchmark.json",
        loadManifestFn: () => buildManifest(),
        readJsonFileFn: () => buildBenchmark(),
        buildEmbedTextFn: async ({ model }) => {
            assert.equal(model.origin.huggingFaceModelId, "fixture/model");
            assert.equal(model.embeddingConfig.dtype, "q8");
            return async (text) => {
                if (text === "赤い花を買います。") {
                    return [0, 1];
                }
                if (text === "日本語を学びます。") {
                    return [0.9, 0.1];
                }
                return [1, 0];
            };
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.modelId, "fixtureEmbeddingModel");
    assert.equal(report.releaseBoundary.evaluationCertifiesCards, false);
    assert.equal(report.releaseBoundary.evaluationMayWriteTrackedTemplatesDirectly, false);
});

test("formatNlpEmbeddingModelEvaluationReport renders metrics and limitations", () => {
    const text = formatNlpEmbeddingModelEvaluationReport({
        passed: true,
        modelId: "fixtureEmbeddingModel",
        benchmarkId: "fixture-benchmark",
        benchmarkPath: "templates/fixture.json",
        cacheDir: "cache/nlp-models",
        allowRemoteModels: false,
        metrics: {
            positiveMean: 0.9,
            negativeMean: 0.1,
            margin: 0.8,
            positiveMin: 0.9,
            negativeMax: 0.1,
        },
        pairs: [{
            id: "pair",
            label: "positive",
            cosine: 0.9,
            rationale: "Fixture.",
        }],
        limitations: ["Fixture only."],
        releaseBoundary: {
            evaluationCertifiesCards: false,
            evaluationMayWriteTrackedTemplatesDirectly: false,
            evaluationClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /Embedding Model Evaluation/);
    assert.match(text, /evaluation certifies cards: no/);
    assert.match(text, /human promotion required: yes/);
    assert.match(text, /Fixture only/);
});
