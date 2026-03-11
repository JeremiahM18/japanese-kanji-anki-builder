const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCuratedStudySummary,
    getCuratedCoverageSet,
} = require("../src/datasets/curatedStudyCoverage");

test("getCuratedCoverageSet includes kanji with real curated overrides", () => {
    const covered = getCuratedCoverageSet({
        日: {
            englishMeaning: "day",
        },
        本: {
            preferredWords: ["本"],
        },
        学: {
            exampleSentence: {
                japanese: "勉強します。",
                english: "I study.",
            },
        },
    });

    assert.equal(covered.has("日"), true);
    assert.equal(covered.has("本"), true);
    assert.equal(covered.has("学"), true);
});

test("buildCuratedStudySummary reports override coverage and counts", () => {
    const summary = buildCuratedStudySummary({
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
            学: { jlpt: 4 },
            校: { jlpt: 4 },
        },
        curatedStudyData: {
            日: {
                englishMeaning: "day",
                notes: "curated",
            },
            学: {
                exampleSentence: {
                    japanese: "勉強します。",
                    english: "I study.",
                },
                preferredWords: ["学生"],
                blockedWords: ["学舎"],
            },
        },
    });

    assert.equal(summary.totalKanji, 4);
    assert.equal(summary.curatedKanji, 2);
    assert.equal(summary.missingKanji, 2);
    assert.equal(summary.coverageRatio, 0.5);
    assert.equal(summary.curatedStudyEntries, 2);
    assert.equal(summary.customMeaningEntries, 1);
    assert.equal(summary.customNotesEntries, 1);
    assert.equal(summary.customSentenceEntries, 1);
    assert.equal(summary.blockedWordEntries, 1);
    assert.equal(summary.preferredWordEntries, 1);
    assert.deepEqual(summary.missingByPriority, [
        { kanji: "校", level: 4 },
        { kanji: "本", level: 5 },
    ]);
});
