const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordCoverageContractSummary,
    loadWordStudyData,
    buildWordStudyEntryKey,
    normalizeWordStudyData,
} = require("../src/datasets/wordStudyData");

test("buildWordStudyEntryKey uses written and reading", () => {
    assert.equal(buildWordStudyEntryKey({ written: "今日", reading: "きょう" }), "今日|きょう");
});

test("normalizeWordStudyData canonicalizes keys from entry content", () => {
    const normalized = normalizeWordStudyData({
        today: {
            written: " 今日 ",
            reading: " きょう ",
            meaning: " today ",
            tags: [" Starter ", "starter"],
            exampleSentence: {
                japanese: "今日は忙しいです。",
                reading: "きょうはいそがしいです。",
                english: "Today is busy.",
            },
        },
    });

    assert.deepEqual(Object.keys(normalized), ["今日|きょう"]);
    assert.equal(normalized["今日|きょう"].written, "今日");
    assert.equal(normalized["今日|きょう"].reading, "きょう");
    assert.equal(normalized["今日|きょう"].meaning, "today");
    assert.deepEqual(normalized["今日|きょう"].tags, ["starter"]);
});

test("normalizeWordStudyData keeps explicit reading-coverage contracts", () => {
    const normalized = normalizeWordStudyData({
        today: {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            jlpt: 5,
            coverage: {
                role: "both",
                focusKanji: [" 今 ", "日", "今"],
                coversReadings: {
                    " 今 ": " いま ",
                    日: "ひ",
                },
            },
        },
    });

    assert.deepEqual(normalized["今日|きょう"].coverage, {
        role: "both",
        focusKanji: ["今", "日"],
        coversReadings: {
            今: "いま",
            日: "ひ",
        },
    });
});

test("buildWordCoverageContractSummary reports explicit reading-coverage tracking by level", () => {
    const summary = buildWordCoverageContractSummary({
        "今日|きょう": {
            written: "今日",
            reading: "きょう",
            meaning: "today",
            jlpt: 5,
            coverage: {
                role: "both",
                focusKanji: ["今", "日"],
                coversReadings: {
                    今: "いま",
                    日: "ひ",
                },
            },
        },
        "本|ほん": {
            written: "本",
            reading: "ほん",
            meaning: "book",
            jlpt: 5,
        },
    });

    assert.equal(summary.starterEntriesByLevel[5], 2);
    assert.equal(summary.explicitCoverageEntriesByLevel[5], 1);
    assert.equal(summary.explicitReadingTargetsByLevel[5], 2);
    assert.equal(summary.explicitCoveragePercentByLevel[5], 50);
});

test("tracked starter word data includes the first governed N4 starter entries", () => {
    const starterEntries = loadWordStudyData({
        starterPath: require("node:path").resolve(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });

    assert.equal(starterEntries["安心|あんしん"].jlpt, 4);
    assert.deepEqual(starterEntries["安心|あんしん"].tags, ["common", "n4", "starter"]);
    assert.equal(starterEntries["急ぐ|いそぐ"].jlpt, 4);
    assert.deepEqual(starterEntries["急ぐ|いそぐ"].tags, ["core", "n4", "starter"]);
    assert.equal(starterEntries["海岸|かいがん"].jlpt, 4);
    assert.equal(starterEntries["世界|せかい"].jlpt, 4);
    assert.equal(starterEntries["花見|はなみ"].jlpt, 4);
    assert.equal(starterEntries["開く|ひらく"].jlpt, 4);
});

test("tracked starter word data carries explicit N5 reading-coverage contracts for key learner-facing words", () => {
    const starterEntries = loadWordStudyData({
        starterPath: require("node:path").resolve(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });

    assert.deepEqual(starterEntries["今日|きょう"].coverage, {
        role: "both",
        focusKanji: ["今", "日"],
        coversReadings: {
            今: "いま",
            日: "ひ",
        },
    });
    assert.equal(starterEntries["休み時間|やすみじかん"].coverage.role, "support");
    assert.equal(starterEntries["時間|じかん"].coverage.coversReadings["間"], "かん");
    assert.equal(starterEntries["五分|ごふん"].coverage.coversReadings["分"], "ふん");
    assert.equal(starterEntries["七日|なのか"].coverage.coversReadings["七"], "なの");
    assert.equal(starterEntries["十日|とおか"].coverage.coversReadings["十"], "とお");
});
