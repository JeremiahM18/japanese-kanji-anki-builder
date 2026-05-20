const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_EMBEDDING_AUTHORITY,
} = require("../src/datasets/nlpEmbeddingArtifact");
const {
    buildNlpEmbeddingArtifactReport,
    formatNlpEmbeddingArtifactReport,
    resolveNlpEmbeddingArtifactPaths,
} = require("../src/services/nlpEmbeddingArtifactService");

function buildManifest(modelOverrides = {}) {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        models: {
            fixtureEmbeddingModel: {
                status: "active",
                runtimeId: "fixture-runtime",
                task: "embedding",
                modelFamily: "fixture-family",
                modelVersion: "fixture-version",
                allowedUses: ["assistive-example-reranking"],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                ...modelOverrides,
            },
        },
    };
}

function buildArtifact(overrides = {}) {
    const artifact = {
        version: 1,
        artifactType: "nlp_embedding_batch",
        generatedAt: "2026-05-20T00:00:00.000Z",
        generator: {
            modelId: "fixtureEmbeddingModel",
            runId: "fixture-run",
            manifestPath: "templates/nlp_model_manifest.json",
            createdBy: "test fixture",
            inputHashes: [{
                path: "out/word.tsv",
                sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                byteSize: 128,
            }],
        },
        model: {
            modelId: "fixtureEmbeddingModel",
            runtimeId: "fixture-runtime",
            modelFamily: "fixture-family",
            modelVersion: "fixture-version",
            embeddingDimension: 3,
            pooling: "mean",
            normalized: true,
            distanceMetric: "cosine",
            deterministic: {
                requiresPinnedModel: true,
                requiresPinnedRuntime: true,
                requiresPinnedInputs: true,
            },
        },
        authority: { ...NLP_EMBEDDING_AUTHORITY },
        scope: {
            targetKind: "word-card",
            deckKind: "word",
            levels: [5],
            source: "generated-word-rows",
            lane: "assistive-example-reranking",
        },
        items: [{
            id: "n5-word-embedding-001",
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            inputText: "日本語",
            embedding: {
                vector: [0.1, 0.2, 0.3],
                magnitude: 1,
            },
            limitations: ["Fixture embedding only."],
        }],
    };

    return {
        ...artifact,
        ...overrides,
        generator: {
            ...artifact.generator,
            ...(overrides.generator || {}),
        },
        model: {
            ...artifact.model,
            ...(overrides.model || {}),
        },
        authority: {
            ...artifact.authority,
            ...(overrides.authority || {}),
        },
        scope: {
            ...artifact.scope,
            ...(overrides.scope || {}),
        },
    };
}

function writeArtifact(dir, name, artifact) {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`);
    return filePath;
}

test("resolveNlpEmbeddingArtifactPaths treats a missing embedding directory as empty", () => {
    const missingDir = path.join(os.tmpdir(), `missing-nlp-embeddings-${Date.now()}`);
    const resolved = resolveNlpEmbeddingArtifactPaths({ artifactDir: missingDir });

    assert.equal(resolved.missingArtifactDir, true);
    assert.deepEqual(resolved.artifactPaths, []);
});

test("buildNlpEmbeddingArtifactReport validates governed embedding artifacts", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embeddings-"));
    writeArtifact(dir, "embeddings.json", buildArtifact());

    const report = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.artifacts, 1);
    assert.equal(report.counts.items, 1);
    assert.equal(report.counts.itemsByTargetKind["word-card"], 1);
    assert.equal(report.counts.itemsByLevel.N5, 1);
    assert.equal(report.counts.itemsByLane["assistive-example-reranking"], 1);
    assert.equal(report.counts.itemsByModel.fixtureEmbeddingModel, 1);
    assert.equal(report.releaseBoundary.embeddingArtifactsAreCertificationEvidence, false);
    assert.equal(report.releaseBoundary.embeddingArtifactsMayWriteTrackedTemplatesDirectly, false);
});

test("buildNlpEmbeddingArtifactReport fails inactive or wrong-task models", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embeddings-"));
    writeArtifact(dir, "embeddings.json", buildArtifact());

    const inactive = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ status: "registered" }),
    });

    assert.equal(inactive.passed, false);
    assert.match(inactive.errors.join("\n"), /require an active model/);

    const wrongTask = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ task: "classification" }),
    });

    assert.equal(wrongTask.passed, false);
    assert.match(wrongTask.errors.join("\n"), /require an embedding model/);
});

test("buildNlpEmbeddingArtifactReport rejects under-authorized embedding lanes", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embeddings-"));
    writeArtifact(dir, "embeddings.json", buildArtifact());

    const report = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest({ allowedUses: ["assistive-sense-fit-audit"] }),
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /does not allow embedding artifact lane/);
});

test("buildNlpEmbeddingArtifactReport rejects vector dimension mismatches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embeddings-"));
    writeArtifact(dir, "embeddings.json", buildArtifact({
        items: [{
            id: "n5-word-embedding-001",
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            inputText: "日本語",
            embedding: {
                vector: [0.1, 0.2],
            },
            limitations: ["Fixture embedding only."],
        }],
    }));

    const report = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /vector length 2 does not match model embedding dimension 3/);
});

test("buildNlpEmbeddingArtifactReport reports invalid embedding JSON without throwing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embeddings-"));
    fs.writeFileSync(path.join(dir, "broken.json"), "{ nope");

    const report = buildNlpEmbeddingArtifactReport({
        artifactDir: dir,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(report.passed, false);
    assert.match(report.errors.join("\n"), /NLP embedding artifact contains invalid JSON/);
    assert.match(report.errors.join("\n"), /Parser detail:/);
});

test("formatNlpEmbeddingArtifactReport renders the release boundary", () => {
    const text = formatNlpEmbeddingArtifactReport({
        passed: true,
        manifestPath: "templates/nlp_model_manifest.json",
        artifactDir: "out/nlp-embeddings",
        missingArtifactDir: true,
        counts: {
            artifacts: 0,
            items: 0,
            itemsByTargetKind: {},
            itemsByLevel: {},
            itemsByLane: {},
            itemsByModel: {},
        },
        artifacts: [],
        errors: [],
        releaseBoundary: {
            embeddingArtifactsAreCertificationEvidence: false,
            embeddingArtifactsMayWriteTrackedTemplatesDirectly: false,
            embeddingArtifactsClaimReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    });

    assert.match(text, /NLP Embedding Artifact Validation/);
    assert.match(text, /embedding artifacts certify cards: no/);
    assert.match(text, /embedding artifacts claim release readiness: no/);
    assert.match(text, /human promotion required: yes/);
});
