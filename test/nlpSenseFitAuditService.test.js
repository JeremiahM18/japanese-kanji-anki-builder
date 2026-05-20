const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_EMBEDDING_AUTHORITY,
} = require("../src/datasets/nlpEmbeddingArtifact");
const {
    buildExampleFitInput,
    buildMeaningFitInput,
    buildNlpSenseFitArtifact,
    parseCardExample,
    scoreSenseFitRow,
    shouldWarnSenseFit,
    writeNlpSenseFitArtifact,
} = require("../src/services/nlpSenseFitAuditService");
const {
    buildNlpSuggestionArtifactReport,
} = require("../src/services/nlpSuggestionArtifactService");

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
                licenseUse: {
                    status: "approved",
                    license: "Apache-2.0",
                    notes: "Fixture approved.",
                },
                allowedUses: ["assistive-sense-fit-audit"],
                outputAuthority: "assistive_only",
                promotionPolicy: "human_review_required",
                embeddingConfig: {
                    embeddingDimension: 3,
                    pooling: "mean",
                    normalized: true,
                    distanceMetric: "cosine",
                    dtype: "q8",
                },
            },
        },
    };
}

function writeWordTsv(dir, example = "日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.") {
    const wordTsvPath = path.join(dir, "jlpt-n5-words.tsv");
    fs.writeFileSync(wordTsvPath, [
        "Word\tReading\tMeaning\tExampleSentence\tJLPTLevel\tNotes",
        `日本語\tにほんご\tJapanese language\t${example}\tJLPT N5\tCore beginner language word.`,
    ].join("\n"));
    return wordTsvPath;
}

function writeEmbeddingArtifact(dir) {
    const embeddingArtifactPath = path.join(dir, "embeddings.json");
    fs.writeFileSync(embeddingArtifactPath, `${JSON.stringify({
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
            runtimeId: "transformers-js",
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
            id: "n5-word-embedding-0001",
            target: {
                kind: "word-card",
                deckKind: "word",
                level: 5,
                written: "日本語",
                reading: "にほんご",
            },
            inputText: "word: 日本語",
            embedding: {
                vector: [1, 0, 0],
                magnitude: 1,
            },
            limitations: ["Fixture only."],
        }],
    }, null, 2)}\n`);
    return embeddingArtifactPath;
}

test("sense-fit input builders bind meaning and example context", () => {
    const row = {
        written: "日本語",
        reading: "にほんご",
        meaning: "Japanese language",
        exampleSentence: "日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.",
    };

    assert.match(buildMeaningFitInput(row), /meaning: Japanese language/);
    assert.match(buildExampleFitInput(row), /translation: I study Japanese./);
    assert.deepEqual(parseCardExample(row.exampleSentence), {
        japanese: "日本語を勉強します。",
        reading: "にほんごをべんきょうします。",
        english: "I study Japanese.",
    });
});

test("scoreSenseFitRow computes warning scores and parse warnings", async () => {
    const row = {
        written: "日本語",
        reading: "にほんご",
        meaning: "Japanese language",
        exampleSentence: "日本語を勉強します。",
    };
    const score = await scoreSenseFitRow({
        row,
        anchorVector: [1, 0, 0],
        embedTextFn: async (input) => input.includes("meaning:") ? [1, 0, 0] : [0, 1, 0],
    });

    assert.equal(score.normalizedMeaningExampleScore, 0.5);
    assert.equal(score.parseWarnings.length, 1);
    assert.equal(shouldWarnSenseFit(score, 0.62), true);
});

test("buildNlpSenseFitArtifact emits governed warning suggestions", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-sense-fit-"));
    const wordTsvPath = writeWordTsv(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const artifact = await buildNlpSenseFitArtifact({
        wordTsvPath,
        embeddingArtifactPath,
        manifestPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        threshold: 0.9,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (input) => input.includes("meaning:") ? [1, 0, 0] : [0, 1, 0],
    });

    assert.equal(artifact.scope.lane, "assistive-sense-fit-audit");
    assert.equal(artifact.suggestions.length, 1);
    assert.equal(artifact.suggestions[0].action, "warn");
    assert.equal(artifact.suggestions[0].target.reading, "にほんご");
    assert.equal(artifact.suggestions[0].authority, undefined);
    assert.equal(artifact.authority.certifiesCards, false);
});

test("writeNlpSenseFitArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-sense-fit-"));
    const wordTsvPath = writeWordTsv(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "suggestions.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const result = await writeNlpSenseFitArtifact({
        wordTsvPath,
        embeddingArtifactPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        threshold: 0.9,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (input) => input.includes("meaning:") ? [1, 0, 0] : [0, 1, 0],
    });
    const report = buildNlpSuggestionArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.suggestions, 1);
});
