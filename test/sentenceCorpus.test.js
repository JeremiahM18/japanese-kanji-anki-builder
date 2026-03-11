const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    loadSentenceCorpus,
    normalizeSentenceCorpus,
    normalizeSentenceEntry,
} = require("../src/datasets/sentenceCorpus");

test("normalizeSentenceEntry trims and canonicalizes sentence metadata", () => {
    const result = normalizeSentenceEntry({
        kanji: " 日 ",
        written: " 日本 ",
        japanese: " 日本へ行きます。 ",
        reading: " にほんへいきます。 ",
        english: " I will go to Japan. ",
        source: " Manual-Curated ",
        tags: [" Core ", "common", "core"],
        register: " Spoken ",
        frequencyRank: 120,
        jlpt: 5,
    });

    assert.equal(result.kanji, "日");
    assert.equal(result.written, "日本");
    assert.equal(result.japanese, "日本へ行きます。");
    assert.equal(result.reading, "にほんへいきます。");
    assert.equal(result.english, "I will go to Japan.");
    assert.equal(result.source, "Manual-Curated");
    assert.deepEqual(result.tags, ["common", "core"]);
    assert.equal(result.register, "spoken");
});

test("normalizeSentenceCorpus deduplicates and keeps the richer entry", () => {
    const result = normalizeSentenceCorpus([
        {
            kanji: "日",
            written: "日本",
            japanese: "日本へ行きます。",
            english: "I will go to Japan.",
        },
        {
            kanji: "日",
            written: "日本",
            japanese: "日本へ行きます。",
            reading: "にほんへいきます。",
            english: "I will go to Japan.",
            source: "manual-curated",
            tags: ["core"],
            frequencyRank: 120,
            jlpt: 5,
        },
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].reading, "にほんへいきます。");
    assert.equal(result[0].source, "manual-curated");
    assert.deepEqual(result[0].tags, ["core"]);
});

test("loadSentenceCorpus returns normalized sorted entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sentence-corpus-"));
    const filePath = path.join(dir, "sentence_corpus.json");

    fs.writeFileSync(filePath, JSON.stringify([
        {
            kanji: "本",
            written: "本",
            japanese: "本を読みます。",
            english: "I read a book.",
            tags: [" beginner "],
        },
        {
            kanji: "日",
            written: "日本",
            japanese: "日本へ行きます。",
            reading: "にほんへいきます。",
            english: "I will go to Japan.",
            source: "manual-curated",
            tags: ["core", "common"],
        },
    ]), "utf-8");

    const result = loadSentenceCorpus(filePath);

    assert.equal(result.length, 2);
    assert.equal(result[0].kanji, "日");
    assert.equal(result[1].kanji, "本");
    assert.deepEqual(result[1].tags, ["beginner"]);
});
