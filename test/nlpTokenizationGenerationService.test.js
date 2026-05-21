const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildNlpKanjiTokenizationArtifact,
    buildNlpWordTokenizationArtifact,
    parseKanjiDeckTsvRows,
    parseWordDeckTsvRows,
    tokenizeText,
    writeNlpKanjiTokenizationArtifact,
    writeNlpWordTokenizationArtifact,
} = require("../src/services/nlpTokenizationGenerationService");
const {
    buildNlpTokenizationArtifactReport,
} = require("../src/services/nlpTokenizationArtifactService");

function buildManifest() {
    return {
        manifestPath: "templates/nlp_model_manifest.json",
        runtimes: {
            "kuromoji-js": {
                status: "active",
                runtimeType: "javascript",
                packageName: "kuromoji",
                packageVersion: "0.1.2",
                licenseUse: {
                    status: "approved",
                    license: "Apache-2.0",
                    notes: "Fixture approved.",
                },
                allowedTasks: ["tokenization"],
                dictionary: {
                    path: "node_modules/kuromoji/dict",
                    fileCount: 12,
                    byteSize: 128,
                    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                },
            },
        },
    };
}

function buildFakeTokenizer() {
    return {
        tokenize(inputText) {
            if (inputText === "日本語") {
                return [
                    {
                        surface_form: "日本",
                        basic_form: "日本",
                        reading: "ニホン",
                        pronunciation: "ニホン",
                        pos: "名詞",
                        pos_detail_1: "固有名詞",
                        pos_detail_2: "地域",
                        pos_detail_3: "国",
                        word_type: "KNOWN",
                    },
                    {
                        surface_form: "語",
                        basic_form: "語",
                        reading: "ゴ",
                        pronunciation: "ゴ",
                        pos: "名詞",
                        pos_detail_1: "接尾",
                        pos_detail_2: "一般",
                        word_type: "KNOWN",
                    },
                ];
            }
            return [{
                surface_form: inputText,
                basic_form: inputText,
                reading: "オカネ",
                pronunciation: "オカネ",
                pos: "名詞",
                pos_detail_1: "一般",
                word_type: "KNOWN",
            }];
        },
    };
}

test("parseWordDeckTsvRows binds generated word rows by written and reading", () => {
    const rows = parseWordDeckTsvRows("Word\tReading\tMeaning\tJLPTLevel\n日本語\tにほんご\tJapanese\tJLPT N5\n\t\tblank\t\nお金\tおかね\tmoney\tJLPT N5\n");

    assert.deepEqual(rows.map((row) => [row.written, row.reading, row.rowNumber]), [
        ["日本語", "にほんご", 2],
        ["お金", "おかね", 4],
    ]);
    assert.throws(() => parseWordDeckTsvRows("Word\tMeaning\n日本語\tJapanese\n"), /missing required Reading column/);
});

test("parseKanjiDeckTsvRows binds generated kanji rows by kanji-card identity", () => {
    const rows = parseKanjiDeckTsvRows("Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\n日\t日\tsun / day\tにち\n月\t月\tmoon / month\tつき\n");

    assert.deepEqual(rows.map((row) => [row.kanji, row.primaryReading, row.displayWord, row.rowNumber]), [
        ["日", "にち", "日", 2],
        ["月", "つき", "月", 3],
    ]);
    assert.throws(() => parseKanjiDeckTsvRows("Kanji\tMeaningJP\n日\tday\n"), /missing required PrimaryReading column/);
});

test("tokenizeText maps kuromoji tokens into contiguous artifact spans", () => {
    const tokens = tokenizeText({
        tokenizer: buildFakeTokenizer(),
        inputText: "日本語",
    });

    assert.deepEqual(tokens.map((token) => [token.surface, token.start, token.end]), [
        ["日本", 0, 2],
        ["語", 2, 3],
    ]);
    assert.equal(tokens[0].reading, "ニホン");
    assert.deepEqual(tokens[0].partOfSpeech, ["名詞", "固有名詞", "地域", "国"]);
});

test("buildNlpWordTokenizationArtifact emits governed word-card tokenization", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-generation-"));
    const wordTsvPath = path.join(dir, "jlpt-n5-words.tsv");
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(wordTsvPath, "Word\tReading\tMeaning\tJLPTLevel\n日本語\tにほんご\tJapanese\tJLPT N5\nお金\tおかね\tmoney\tJLPT N5\n");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const artifact = await buildNlpWordTokenizationArtifact({
        wordTsvPath,
        manifestPath,
        workspaceRoot: dir,
        level: 5,
        limit: 1,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildTokenizerFn: async () => buildFakeTokenizer(),
    });

    assert.equal(artifact.runtime.runtimeId, "kuromoji-js");
    assert.equal(artifact.scope.targetKind, "word-card");
    assert.equal(artifact.items.length, 1);
    assert.equal(artifact.items[0].target.written, "日本語");
    assert.equal(artifact.items[0].target.reading, "にほんご");
    assert.equal(artifact.items[0].tokens.length, 2);
    assert.equal(artifact.authority.certifiesCards, false);
    assert.equal(artifact.generator.inputHashes.length, 2);
});

test("buildNlpKanjiTokenizationArtifact emits governed kanji-card tokenization", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-generation-"));
    const kanjiTsvPath = path.join(dir, "jlpt-n5.tsv");
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    fs.writeFileSync(kanjiTsvPath, "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\n日\t日\tday / sun\tにち\n月\t月\tmoon / month\tつき\n");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const artifact = await buildNlpKanjiTokenizationArtifact({
        kanjiTsvPath,
        manifestPath,
        workspaceRoot: dir,
        level: 5,
        limit: 1,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildTokenizerFn: async () => buildFakeTokenizer(),
    });

    assert.equal(artifact.runtime.runtimeId, "kuromoji-js");
    assert.equal(artifact.scope.targetKind, "kanji-card");
    assert.equal(artifact.scope.source, "generated-kanji-rows");
    assert.equal(artifact.items.length, 1);
    assert.equal(artifact.items[0].target.deckKind, "kanji");
    assert.equal(artifact.items[0].target.written, "日");
    assert.equal(artifact.items[0].target.reading, "にち");
    assert.equal(artifact.items[0].target.cardId, "N5:日");
    assert.match(artifact.items[0].limitations.join("\n"), /Kanji-card tokenization checks the bare kanji anchor/);
    assert.match(artifact.items[0].limitations.join("\n"), /normal kanji-card differences are reading-variant context/);
    assert.equal(artifact.authority.certifiesCards, false);
});

test("writeNlpWordTokenizationArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-generation-"));
    const wordTsvPath = path.join(dir, "jlpt-n5-words.tsv");
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "tokens.json");
    fs.writeFileSync(wordTsvPath, "Word\tReading\tMeaning\tJLPTLevel\n日本語\tにほんご\tJapanese\tJLPT N5\n");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const result = await writeNlpWordTokenizationArtifact({
        wordTsvPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildTokenizerFn: async () => buildFakeTokenizer(),
    });
    const report = buildNlpTokenizationArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.items, 1);
});

test("writeNlpKanjiTokenizationArtifact writes artifacts accepted by the validator", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlp-token-generation-"));
    const kanjiTsvPath = path.join(dir, "jlpt-n5.tsv");
    const manifestPath = path.join(dir, "nlp_model_manifest.json");
    const outPath = path.join(dir, "kanji-tokens.json");
    fs.writeFileSync(kanjiTsvPath, "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\n日\t日\tday / sun\tにち\n");
    fs.writeFileSync(manifestPath, JSON.stringify(buildManifest(), null, 2));

    const result = await writeNlpKanjiTokenizationArtifact({
        kanjiTsvPath,
        manifestPath,
        outPath,
        workspaceRoot: dir,
        level: 5,
        now: () => new Date("2026-05-20T00:00:00.000Z"),
        loadManifestFn: () => ({
            ...buildManifest(),
            manifestPath,
        }),
        buildTokenizerFn: async () => buildFakeTokenizer(),
    });
    const report = buildNlpTokenizationArtifactReport({
        artifactPath: result.outPath,
        loadManifestFn: () => buildManifest(),
    });

    assert.equal(fs.existsSync(outPath), true);
    assert.equal(report.passed, true);
    assert.equal(report.counts.items, 1);
});
