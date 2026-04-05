const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildMissingKanjiEntries,
    buildMissingKanjiPriorityList,
    buildCuratedStudySummary,
    buildWordCachePath,
    getCuratedCoverageSet,
    scoreWordCandidate,
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

test("scoreWordCandidate rewards prioritized learner-friendly candidates", () => {
    const highValue = scoreWordCandidate({
        written: "計画",
        pron: "けいかく",
        meaning: { glosses: ["plan"] },
        variant: { priorities: ["ichi1", "news1", "nf05"] },
    });
    const obscure = scoreWordCandidate({
        written: "古代伝承録",
        pron: "こだいでんしょうろく",
        meaning: { glosses: ["classical chronicle of ancient China"] },
        variant: { priorities: [] },
    });

    assert.equal(highValue.priorities, 3);
    assert.equal(highValue.score > obscure.score, true);
});

test("buildMissingKanjiPriorityList prefers missing kanji with strong cached candidates", () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "curated-coverage-cache-"));
    const missingEntries = [
        { kanji: "弱", level: 1 },
        { kanji: "強", level: 1 },
    ];

    fs.writeFileSync(buildWordCachePath(cacheDir, "強"), JSON.stringify([
        {
            meanings: [{ glosses: ["strength"] }],
            variants: [{ written: "強力", pronounced: "きょうりょく", priorities: ["ichi1", "news1", "nf10"] }],
        },
    ]), "utf-8");
    fs.writeFileSync(buildWordCachePath(cacheDir, "弱"), JSON.stringify([
        {
            meanings: [{ glosses: ["classical title of ancient China"] }],
            variants: [{ written: "弱古代伝承録", pronounced: "じゃくこだいでんしょうろく", priorities: [] }],
        },
    ]), "utf-8");

    const result = buildMissingKanjiPriorityList(missingEntries, { cacheDir });

    assert.equal(result[0].kanji, "強");
    assert.deepEqual(result[0].bestCandidate, {
        written: "強力",
        pron: "きょうりょく",
        gloss: "strength",
        priorities: ["ichi1", "news1", "nf10"],
    });
    assert.equal(result[1].kanji, "弱");
});

test("buildMissingKanjiEntries returns the full missing set for a requested level", () => {
    const result = buildMissingKanjiEntries(
        {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
            校: { jlpt: 4 },
            難: { jlpt: 1 },
        },
        {
            日: { notes: "covered" },
            校: { notes: "covered" },
        },
        5
    );

    assert.deepEqual(result, [{ kanji: "本", level: 5 }]);
});
