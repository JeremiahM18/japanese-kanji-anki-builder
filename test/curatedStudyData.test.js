const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    loadCuratedStudyData,
    normalizeCuratedEntry,
    normalizeCuratedStudyData,
} = require("../src/datasets/curatedStudyData");

test("loadCuratedStudyData returns empty object when file is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "missing.json");

    assert.deepEqual(loadCuratedStudyData(filePath), {});
});

test("normalizeCuratedEntry canonicalizes metadata arrays and tags", () => {
    const result = normalizeCuratedEntry({
        englishMeaning: " sun / day marker ",
        source: " Manual-Curated ",
        tags: [" Curated ", "override", "curated"],
        jlpt: 5,
        preferredWords: [" 日本 ", "日本"],
        blockedWords: [" 日中 ", "日中"],
        blockedSentencePhrases: ["rare", " rare "],
        alternativeNotes: [" note-b ", "note-a", "note-b"],
        notes: " curated-note ",
        exampleSentence: {
            japanese: " 日本は島国です。 ",
            reading: " にほんはしまぐにです。 ",
            english: " Japan is an island nation. ",
            tags: [" Curated ", "example"],
        },
    });

    assert.equal(result.englishMeaning, "sun / day marker");
    assert.equal(result.source, "Manual-Curated");
    assert.deepEqual(result.tags, ["curated", "override"]);
    assert.deepEqual(result.preferredWords, ["日本"]);
    assert.deepEqual(result.blockedWords, ["日中"]);
    assert.deepEqual(result.blockedSentencePhrases, ["rare"]);
    assert.deepEqual(result.alternativeNotes, ["note-a", "note-b"]);
    assert.equal(result.exampleSentence.japanese, "日本は島国です。");
    assert.deepEqual(result.exampleSentence.tags, ["curated", "example"]);
});

test("normalizeCuratedStudyData sorts keys deterministically", () => {
    const result = normalizeCuratedStudyData({
        本: { notes: "book" },
        日: { notes: "sun" },
    });

    assert.deepEqual(Object.keys(result), ["日", "本"]);
});

test("loadCuratedStudyData validates and parses curated entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "curated_study_data.json");

    fs.writeFileSync(filePath, JSON.stringify({
        日: {
            englishMeaning: "sun / day marker",
            preferredWords: ["日本"],
            blockedWords: ["日中"],
            blockedSentencePhrases: ["rare"],
            alternativeNotes: ["note-a", "note-b"],
            notes: "日本 （にほん） - Japan ／ curated-note",
            exampleSentence: {
                japanese: "日本は島国です。",
                reading: "にほんはしまぐにです。",
                english: "Japan is an island nation.",
            },
        },
    }), "utf-8");

    const result = loadCuratedStudyData(filePath);

    assert.equal(result.日.englishMeaning, "sun / day marker");
    assert.deepEqual(result.日.preferredWords, ["日本"]);
    assert.deepEqual(result.日.blockedWords, ["日中"]);
    assert.deepEqual(result.日.blockedSentencePhrases, ["rare"]);
    assert.deepEqual(result.日.alternativeNotes, ["note-a", "note-b"]);
    assert.equal(result.日.exampleSentence.source, "curated-study-data");
    assert.deepEqual(result.日.exampleSentence.tags, ["curated"]);
});
