const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpWordEmbeddingArtifact,
    buildWordEmbeddingInput,
    parseWordDeckEmbeddingRows,
    writeNlpWordEmbeddingArtifact,
} = require("../src/services/nlpEmbeddingGenerationService");
const {
    buildNlpEmbeddingArtifactReport,
} = require("../src/services/nlpEmbeddingArtifactService");

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
                allowedUses: ["assistive-example-reranking"],
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

function writeWordTsv(dir, text = null) {
    const wordTsvPath = path.join(dir, "jlpt-n5-words.tsv");
    fs.writeFileSync(wordTsvPath, text || [
        "Word\tReading\tMeaning\tExampleSentence\tJLPTLevel\tNotes",
        "日本語\tにほんご\tJapanese language\t日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.\tJLPT N5\tCore beginner language word.",
        "お金\tおかね\tmoney\tお金があります。 ／ おかねがあります。 ／ I have money.\tJLPT N5\tPolite money word.",
    ].join("\n"));
    return wordTsvPath;
}

test("parseWordDeckEmbeddingRows binds generated word rows with embedding context fields", () => {
    const rows = parseWordDeckEmbeddingRows([
        "Word\tReading\tMeaning\tExampleSentence\tJLPTLevel\tNotes",
        "日本語\tにほんご\tJapanese language\t日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.\tJLPT N5\tCore beginner language word.",
        "\t\tblank\tblank\t\t",
        "お金\tおかね\tmoney\tお金があります。 ／ おかねがあります。 ／ I have money.\tJLPT N5\tPolite money word.",
    ].join("\n"));

    assert.deepEqual(rows.map((row) => [row.written, row.reading, row.rowNumber]), [
        ["日本語", "にほんご", 2],
        ["お金", "おかね", 4],
    ]);
    assert.throws(() => parseWordDeckEmbeddingRows("Word\tReading\n日本語\tにほんご\n"), /missing required Meaning column/);
});

test("buildWordEmbeddingInput includes exact written-reading identity and review context", () => {
    const input = buildWordEmbeddingInput({
        written: "日本語",
        reading: "にほんご",
        meaning: "Japanese language",
        exampleSentence: "日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.",
        notes: "Core beginner language word.",
    });

    assert.match(input, /word: 日本語/);
    assert.match(input, /reading: にほんご/);
    assert.match(input, /meaning: Japanese language/);
    assert.match(input, /example: 日本語を勉強します。 \/ にほんごをべんきょうします。 \/ I study Japanese./);
});

test("buildNlpWordEmbeddingArtifact emits governed word-card embeddings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embedding-generation-"));
    const wordTsvPath = writeWordTsv(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const artifact = await buildNlpWordEmbeddingArtifact({
        wordTsvPath,
        manifestPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        limit: 1,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async ({ model }) => {
            assert.equal(model.embeddingConfig.embeddingDimension, 3);
            return async () => [0.1, 0.2, 0.3];
        },
    });

    assert.equal(artifact.model.modelId, "fixtureEmbeddingModel");
    assert.equal(artifact.model.embeddingDimension, 3);
    assert.equal(artifact.scope.targetKind, "word-card");
    assert.equal(artifact.scope.lane, "assistive-example-reranking");
    assert.equal(artifact.items.length, 1);
    assert.equal(artifact.items[0].target.written, "日本語");
    assert.equal(artifact.items[0].target.reading, "にほんご");
    assert.equal(artifact.items[0].embedding.vector.length, 3);
    assert.equal(artifact.authority.certifiesCards, false);
    assert.equal(artifact.generator.inputHashes.length, 2);
});

test("writeNlpWordEmbeddingArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-embedding-generation-"));
    const wordTsvPath = writeWordTsv(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "embeddings.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const result = await writeNlpWordEmbeddingArtifact({
        wordTsvPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (text) => {
            if (text.includes("お金")) {
                return [0.4, 0.5, 0.6];
            }
            return [0.1, 0.2, 0.3];
        },
    });
    const report = buildNlpEmbeddingArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.items, 2);
});
