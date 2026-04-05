const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    loadCuratedStudyData,
    mergeCuratedEntry,
    mergeCuratedStudyData,
    normalizeCuratedEntry,
    normalizeCuratedStudyData,
    resolveTrackedStarterPaths,
} = require("../src/datasets/curatedStudyData");

test("loadCuratedStudyData returns empty object when file and starter are missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "missing.json");
    const starterPath = path.join(dir, "missing-starter.json");

    assert.deepEqual(loadCuratedStudyData(filePath, { starterPath }), {});
});

test("normalizeCuratedEntry canonicalizes metadata arrays and tags", () => {
    const result = normalizeCuratedEntry({
        englishMeaning: " sun / day marker ",
        displayWord: { written: " 日 ", pron: " ひ " },
        source: " Manual-Curated ",
        tags: [" Curated ", "override", "curated"],
        jlpt: 5,
        preferredWords: [" 日本 ", "日曜日", "日本"],
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
    assert.equal(result.displayWord.written, "日");
    assert.equal(result.displayWord.pron, "ひ");
    assert.equal(result.source, "Manual-Curated");
    assert.deepEqual(result.tags, ["curated", "override"]);
    assert.deepEqual(result.preferredWords, ["日本", "日曜日"]);
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

test("mergeCuratedEntry preserves starter defaults while keeping local overrides", () => {
    const result = mergeCuratedEntry(
        {
            englishMeaning: "day / sun",
            displayWord: { written: "日", pron: "ひ" },
            notes: "starter-note",
            exampleSentence: {
                japanese: "今日は日曜日です。",
                reading: "きょうはにちようびです。",
                english: "Today is Sunday.",
            },
        },
        {
            notes: "local-note",
            exampleSentence: {
                english: "It is Sunday today.",
            },
        }
    );

    assert.equal(result.englishMeaning, "day / sun");
    assert.equal(result.displayWord.pron, "ひ");
    assert.equal(result.notes, "local-note");
    assert.equal(result.exampleSentence.japanese, "今日は日曜日です。");
    assert.equal(result.exampleSentence.english, "It is Sunday today.");
});

test("mergeCuratedStudyData overlays local entries onto starter entries field-by-field", () => {
    const result = mergeCuratedStudyData(
        {
            日: {
                englishMeaning: "day / sun",
                displayWord: { written: "日", pron: "ひ" },
            },
        },
        {
            日: {
                notes: "local-note",
            },
        }
    );

    assert.equal(result.日.englishMeaning, "day / sun");
    assert.equal(result.日.displayWord.pron, "ひ");
    assert.equal(result.日.notes, "local-note");
});

test("loadCuratedStudyData validates parses and merges starter data with local overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "curated_study_data.json");
    const starterPath = path.join(dir, "starter_curated_study_data.json");

    fs.writeFileSync(starterPath, JSON.stringify({
        日: {
            englishMeaning: "sun / day marker",
            displayWord: { written: "日", pron: "ひ" },
            preferredWords: ["日本", "日曜日"],
            notes: "日本 （にほん） - Japan ／ starter-note",
            exampleSentence: {
                japanese: "日本は島国です。",
                reading: "にほんはしまぐにです。",
                english: "Japan is an island nation.",
            },
        },
    }), "utf-8");

    fs.writeFileSync(filePath, JSON.stringify({
        日: {
            blockedWords: ["日中"],
            blockedSentencePhrases: ["rare"],
            alternativeNotes: ["note-a", "note-b"],
            notes: "local-note",
        },
    }), "utf-8");

    const result = loadCuratedStudyData(filePath, { starterPath });

    assert.equal(result.日.englishMeaning, "sun / day marker");
    assert.equal(result.日.displayWord.written, "日");
    assert.equal(result.日.displayWord.pron, "ひ");
    assert.deepEqual(result.日.preferredWords, ["日本", "日曜日"]);
    assert.deepEqual(result.日.blockedWords, ["日中"]);
    assert.deepEqual(result.日.blockedSentencePhrases, ["rare"]);
    assert.deepEqual(result.日.alternativeNotes, ["note-a", "note-b"]);
    assert.equal(result.日.notes, "local-note");
    assert.equal(result.日.exampleSentence.source, "curated-study-data");
    assert.deepEqual(result.日.exampleSentence.tags, ["curated"]);
});

test("resolveTrackedStarterPaths includes sorted starter batch extensions after the base file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const starterPath = path.join(dir, "starter_curated_study_data.json");
    const batchBPath = path.join(dir, "starter_curated_study_data_n1_batch_02.json");
    const batchAPath = path.join(dir, "starter_curated_study_data_n1_batch_01.json");

    fs.writeFileSync(starterPath, "{}\n", "utf-8");
    fs.writeFileSync(batchBPath, "{}\n", "utf-8");
    fs.writeFileSync(batchAPath, "{}\n", "utf-8");

    const result = resolveTrackedStarterPaths({ starterPath });

    assert.deepEqual(result, [starterPath, batchAPath, batchBPath]);
});

test("loadCuratedStudyData merges multiple tracked starter files before local overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "curated_study_data.json");
    const starterPath = path.join(dir, "starter_curated_study_data.json");
    const starterBatchPath = path.join(dir, "starter_curated_study_data_n1_batch_01.json");

    fs.writeFileSync(starterPath, JSON.stringify({
        日: {
            englishMeaning: "day / sun",
            notes: "日本 （にほん） - Japan",
        },
    }), "utf-8");
    fs.writeFileSync(starterBatchPath, JSON.stringify({
        本: {
            englishMeaning: "book / origin",
            notes: "本 （ほん） - book",
        },
    }), "utf-8");
    fs.writeFileSync(filePath, JSON.stringify({
        本: {
            preferredWords: ["本屋"],
        },
    }), "utf-8");

    const result = loadCuratedStudyData(filePath, { starterPath });

    assert.equal(result.日.englishMeaning, "day / sun");
    assert.equal(result.本.englishMeaning, "book / origin");
    assert.deepEqual(result.本.preferredWords, ["本屋"]);
});
