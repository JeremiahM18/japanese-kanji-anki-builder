const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");

test("loadCuratedStudyData returns empty object when file is missing", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "missing.json");

    assert.deepEqual(loadCuratedStudyData(filePath), {});
});

test("loadCuratedStudyData validates and parses curated entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-study-"));
    const filePath = path.join(dir, "curated_study_data.json");

    fs.writeFileSync(filePath, JSON.stringify({
        日: {
            englishMeaning: "sun / day marker",
            preferredWords: ["日本"],
            blockedWords: ["日中"],
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
    assert.equal(result.日.exampleSentence.source, "curated-study-data");
    assert.deepEqual(result.日.exampleSentence.tags, ["curated"]);
});
