const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    NLP_EMBEDDING_AUTHORITY,
} = require("../src/datasets/nlpEmbeddingArtifact");
const {
    buildExampleCandidateInput,
    buildNlpExampleRerankingArtifact,
    collectExampleCandidates,
    parseCardExample,
    rankExampleCandidates,
    writeNlpExampleRerankingArtifact,
} = require("../src/services/nlpExampleRerankingService");
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
                inputPolicy: {
                    maxInputCharacters: 4096,
                    maxInputTokens: 128,
                    overflowPolicy: "reject",
                },
            },
        },
    };
}

function writeWordTsv(dir) {
    const wordTsvPath = path.join(dir, "jlpt-n5-words.tsv");
    fs.writeFileSync(wordTsvPath, [
        "Word\tReading\tMeaning\tExampleSentence\tJLPTLevel\tNotes",
        "日本語\tにほんご\tJapanese language\t日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.\tJLPT N5\tCore beginner language word.",
    ].join("\n"));
    return wordTsvPath;
}

function writeSentenceCorpus(dir) {
    const sentenceCorpusPath = path.join(dir, "sentence_corpus.json");
    fs.writeFileSync(sentenceCorpusPath, `${JSON.stringify([
        {
            kanji: "語",
            written: "日本語",
            japanese: "日本語を学びます。",
            reading: "にほんごをまなびます。",
            english: "I learn Japanese.",
            source: "fixture-corpus",
            tags: ["beginner"],
            jlpt: 5,
        },
    ], null, 2)}\n`);
    return sentenceCorpusPath;
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
            inputPolicy: {
                maxInputCharacters: 4096,
                maxInputTokens: 128,
                overflowPolicy: "reject",
            },
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

test("parseCardExample splits generated card example fields", () => {
    assert.deepEqual(parseCardExample("日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese."), {
        japanese: "日本語を勉強します。",
        reading: "にほんごをべんきょうします。",
        english: "I study Japanese.",
    });
});

test("collectExampleCandidates includes current and exact-reading corpus candidates", () => {
    const row = {
        written: "日本語",
        reading: "にほんご",
        exampleSentence: "日本語を勉強します。 ／ にほんごをべんきょうします。 ／ I study Japanese.",
    };
    const candidates = collectExampleCandidates(row, [
        {
            kanji: "語",
            written: "日本語",
            japanese: "日本語を学びます。",
            reading: "にほんごをまなびます。",
            english: "I learn Japanese.",
            source: "fixture-corpus",
        },
        {
            kanji: "語",
            written: "日本語",
            japanese: "英語を学びます。",
            reading: "えいごをまなびます。",
            english: "I learn English.",
            source: "fixture-corpus",
        },
    ]);

    assert.deepEqual(candidates.map((candidate) => candidate.sourceType), ["generated-row", "corpus"]);
    assert.equal(candidates[1].japanese, "日本語を学びます。");
});

test("rankExampleCandidates sorts candidates by embedding similarity", async () => {
    const row = {
        written: "日本語",
        reading: "にほんご",
        meaning: "Japanese language",
    };
    const candidates = [
        {
            sourceType: "generated-row",
            japanese: "日本語を勉強します。",
            reading: "にほんごをべんきょうします。",
            english: "I study Japanese.",
        },
        {
            sourceType: "corpus",
            japanese: "日本語を学びます。",
            reading: "にほんごをまなびます。",
            english: "I learn Japanese.",
        },
    ];
    const ranked = await rankExampleCandidates({
        row,
        anchorVector: [1, 0, 0],
        candidates,
        embedTextFn: async (input) => input.includes("学びます") ? [1, 0, 0] : [0, 1, 0],
    });

    assert.equal(ranked[0].japanese, "日本語を学びます。");
    assert.equal(ranked[0].rank, 1);
    assert.equal(ranked[1].rank, 2);
});

test("buildExampleCandidateInput keeps card identity and candidate text together", () => {
    const input = buildExampleCandidateInput({
        row: {
            written: "日本語",
            reading: "にほんご",
            meaning: "Japanese language",
        },
        candidate: {
            japanese: "日本語を学びます。",
            reading: "にほんごをまなびます。",
            english: "I learn Japanese.",
        },
    });

    assert.match(input, /word: 日本語/);
    assert.match(input, /reading: にほんご/);
    assert.match(input, /example: 日本語を学びます。/);
});

test("buildNlpExampleRerankingArtifact emits governed suggestion artifacts", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-example-rerank-"));
    const wordTsvPath = writeWordTsv(dir);
    const sentenceCorpusPath = writeSentenceCorpus(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const artifact = await buildNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
        manifestPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => async (input) => input.includes("学びます") ? [1, 0, 0] : [0, 1, 0],
    });

    assert.equal(artifact.scope.lane, "assistive-example-reranking");
    assert.equal(artifact.suggestions.length, 1);
    assert.equal(artifact.suggestions[0].target.written, "日本語");
    assert.equal(artifact.suggestions[0].target.reading, "にほんご");
    assert.equal(artifact.suggestions[0].evidence.some((entry) => entry.sourceType === "model-score"), true);
    assert.equal(artifact.authority.certifiesCards, false);
});

test("writeNlpExampleRerankingArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-example-rerank-"));
    const wordTsvPath = writeWordTsv(dir);
    const sentenceCorpusPath = writeSentenceCorpus(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "suggestions.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const result = await writeNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
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
        buildEmbedTextFn: async () => async (input) => input.includes("学びます") ? [1, 0, 0] : [0, 1, 0],
    });
    const report = buildNlpSuggestionArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.suggestions, 1);
});

test("writeNlpExampleRerankingArtifact skips unchanged full-scope reranking artifacts", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-example-rerank-"));
    const wordTsvPath = writeWordTsv(dir);
    const sentenceCorpusPath = writeSentenceCorpus(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "suggestions.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const first = await writeNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
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
        buildEmbedTextFn: async () => async (input) => input.includes("学びます") ? [1, 0, 0] : [0, 1, 0],
    });
    const firstText = fs.readFileSync(outPath, "utf8");

    const second = await writeNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn: async () => {
            throw new Error("reranking model should not be rebuilt for unchanged inputs");
        },
    });

    assert.equal(first.skipped, false);
    assert.equal(first.artifact.generator.parameters.fullScope, true);
    assert.equal(second.skipped, true);
    assert.equal(second.skipReason, "unchanged-inputs");
    assert.equal(second.artifact.suggestions.length, 1);
    assert.equal(fs.readFileSync(outPath, "utf8"), firstText);
});

test("writeNlpExampleRerankingArtifact regenerates when min-candidates changes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-example-rerank-"));
    const wordTsvPath = writeWordTsv(dir);
    const sentenceCorpusPath = writeSentenceCorpus(dir);
    const embeddingArtifactPath = writeEmbeddingArtifact(dir);
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "suggestions.json");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));
    let modelBuilds = 0;
    const buildEmbedTextFn = async () => {
        modelBuilds += 1;
        return async (input) => input.includes("学びます") ? [1, 0, 0] : [0, 1, 0];
    };

    await writeNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn,
    });
    const changed = await writeNlpExampleRerankingArtifact({
        wordTsvPath,
        sentenceCorpusPath,
        embeddingArtifactPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        modelId: "fixtureEmbeddingModel",
        minCandidates: 3,
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildEmbedTextFn,
    });

    assert.equal(changed.skipped, false);
    assert.equal(changed.artifact.generator.parameters.minCandidates, 3);
    assert.equal(changed.artifact.suggestions.length, 0);
    assert.equal(modelBuilds, 2);
});
