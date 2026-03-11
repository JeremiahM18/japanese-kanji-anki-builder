const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCoverageSummary,
    getCoveredKanjiSet,
} = require("../src/datasets/sentenceCorpusCoverage");

test("getCoveredKanjiSet includes corpus and curated coverage", () => {
    const covered = getCoveredKanjiSet([
        { kanji: "日" },
        { kanji: "本" },
    ], {
        学: {
            englishMeaning: "study",
        },
        校: {
            exampleSentence: {
                japanese: "学校へ行きます。",
                english: "I go to school.",
            },
        },
    });

    assert.equal(covered.has("日"), true);
    assert.equal(covered.has("本"), true);
    assert.equal(covered.has("学"), true);
    assert.equal(covered.has("校"), true);
});

test("buildCoverageSummary reports totals by jlpt level", () => {
    const summary = buildCoverageSummary({
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
            学: { jlpt: 4 },
            校: { jlpt: 4 },
            難: { jlpt: 1 },
        },
        sentenceCorpus: [
            { kanji: "日" },
            { kanji: "本" },
        ],
        curatedStudyData: {
            学: {
                notes: "curated",
            },
        },
    });

    assert.equal(summary.totalKanji, 5);
    assert.equal(summary.coveredKanji, 3);
    assert.equal(summary.missingKanji, 2);
    assert.equal(summary.coverageRatio, 0.6);
    assert.equal(summary.levels.length, 3);

    const n5 = summary.levels.find((row) => row.level === 5);
    const n4 = summary.levels.find((row) => row.level === 4);
    const n1 = summary.levels.find((row) => row.level === 1);

    assert.deepEqual(n5, {
        level: 5,
        totalKanji: 2,
        coveredKanji: 2,
        missingKanji: 0,
        coverageRatio: 1,
        sampleMissing: [],
    });
    assert.deepEqual(n4, {
        level: 4,
        totalKanji: 2,
        coveredKanji: 1,
        missingKanji: 1,
        coverageRatio: 0.5,
        sampleMissing: ["校"],
    });
    assert.deepEqual(n1, {
        level: 1,
        totalKanji: 1,
        coveredKanji: 0,
        missingKanji: 1,
        coverageRatio: 0,
        sampleMissing: ["難"],
    });

    assert.deepEqual(summary.missingByPriority, [
        { kanji: "難", level: 1 },
        { kanji: "校", level: 4 },
    ]);
});
