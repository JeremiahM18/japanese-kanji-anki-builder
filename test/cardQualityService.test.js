const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCardQualitySummary,
    buildOfflineMeaning,
    buildOfflineReading,
    buildOfflineSentenceCandidate,
} = require("../src/services/cardQualityService");

test("buildOfflineSentenceCandidate prefers curated examples before corpus entries", () => {
    const candidate = buildOfflineSentenceCandidate("日", {
        preferredWords: ["日本"],
        exampleSentence: {
            japanese: "日本です。",
            reading: "にほんです。",
            english: "It is Japan.",
        },
    }, [
        { kanji: "日", japanese: "日よう日です。", reading: "にちようびです。", english: "It is Sunday.", frequencyRank: 5 },
    ]);

    assert.equal(candidate.type, "curated");
    assert.equal(candidate.japanese, "日本です。");
});

test("buildOfflineSentenceCandidate prefers corpus entries with readings and better rank", () => {
    const candidate = buildOfflineSentenceCandidate("学", null, [
        { kanji: "学", japanese: "学生です。", english: "I am a student.", frequencyRank: 2 },
        { kanji: "学", japanese: "学校へ行きます。", reading: "がっこうへいきます。", english: "I go to school.", frequencyRank: 5 },
    ]);

    assert.equal(candidate.type, "corpus");
    assert.equal(candidate.japanese, "学校へ行きます。");
});

test("buildOfflineReading formats JLPT readings", () => {
    assert.equal(
        buildOfflineReading({ on_readings: ["ガク"], kun_readings: ["まな.ぶ"] }),
        "オン: ガク ／ くん: まな.ぶ"
    );
});

test("buildOfflineMeaning prefers curated wording and learner-facing meaning", () => {
    assert.equal(
        buildOfflineMeaning(
            { meanings: ["study", "learning"] },
            { preferredWords: ["学校"], displayWord: { written: "学", pron: "まな" }, englishMeaning: "school" },
            null,
            "学"
        ),
        "学 （まな） ／ school"
    );
});

test("buildCardQualitySummary reports per-level local card quality coverage", () => {
    const summary = buildCardQualitySummary({
        jlptOnlyJson: {
            日: { jlpt: 5, on_readings: ["ニチ"], kun_readings: ["ひ"], meanings: ["day", "sun"] },
            本: { jlpt: 5, on_readings: [], kun_readings: [], meanings: [] },
            不: { jlpt: 4, on_readings: ["フ"], kun_readings: [], meanings: ["not"] },
        },
        sentenceCorpus: [
            { kanji: "日", japanese: "日本です。", reading: "にほんです。", english: "It is Japan.", frequencyRank: 1 },
        ],
        curatedStudyData: {
            不: { notes: "Negative prefix.", preferredWords: ["不便"], englishMeaning: "inconvenient" },
        },
        levels: [5, 4],
    });

    assert.equal(summary.levels[0].level, 4);
    assert.equal(summary.levels[0].readingCoverageRatio, 1);
    assert.equal(summary.levels[0].contextualNotesCoverageRatio, 1);
    assert.equal(summary.levels[1].level, 5);
    assert.equal(summary.levels[1].readingCoverageRatio, 0.5);
    assert.equal(summary.levels[1].exampleCoverageRatio, 0.5);
    assert.equal(summary.levels[1].contextualNotesCoverageRatio, 0.5);
    assert.deepEqual(summary.levels[1].sampleMissing.reading, ["本"]);
    assert.deepEqual(summary.levels[1].sampleMissing.example, ["本"]);
});

