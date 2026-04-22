const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    formatWordDeckCompletionReport,
    hasPhraseTag,
} = require("../src/services/wordDeckCompletionService");

test("hasPhraseTag detects phrase-tagged starter entries", () => {
    assert.equal(hasPhraseTag({ tags: ["starter", "phrase"] }), true);
    assert.equal(hasPhraseTag({ tags: ["starter", "core"] }), false);
});

test("buildWordDeckInventorySummary separates phrase exclusions from real eligible misses", () => {
    const summary = buildWordDeckInventorySummary({
        level: 5,
        starterEntries: {
            "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5, tags: ["starter", "core"] },
            "赤い花|あかいはな": { written: "赤い花", reading: "あかいはな", jlpt: 5, tags: ["starter", "common"] },
            "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
                "赤い花|あかいはな": { written: "赤い花", reading: "あかいはな", jlpt: 5 },
                "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5 },
            },
        },
        builtWordRows: [
            { Word: "今日", Reading: "きょう" },
        ],
    });

    assert.equal(summary.canonicalInventoryCount, 3);
    assert.equal(summary.starterEligibleCount, 2);
    assert.equal(summary.builtEligibleCount, 1);
    assert.equal(summary.phraseExcludedCount, 1);
    assert.equal(summary.missingEligibleCount, 1);
    assert.equal(summary.missingEligibleEntries[0].key, "赤い花|あかいはな");
    assert.equal(summary.phraseExcludedEntries[0].key, "高い山|たかいやま");
});

test("buildWordDeckCompletionReport combines vocabulary and reading coverage into one N-level audit", () => {
    const report = buildWordDeckCompletionReport({
        level: 5,
        starterEntries: {
            "今日|きょう": {
                written: "今日",
                reading: "きょう",
                jlpt: 5,
                tags: ["starter", "core"],
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "今日|きょう": { written: "今日", reading: "きょう", jlpt: 5 },
            },
        },
        kanjiTsv: [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence",
            "今\t今\t今 （いま） ／ now\tいま\tオン: コン\tくん: いま\t\t\t\t\t\t今日 （きょう） - today\t",
            "日\t日\t日 （ひ） ／ day\tひ\tオン: ニチ\tくん: ひ\t\t\t\t\t\t今日 （きょう） - today\t",
        ].join("\n"),
        wordTsv: [
            "Word\tReading\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "今日\tきょう\ttoday\tJLPT N5\tJLPT core + reading coverage\t今、日\t今: いま ／ 日: ひ\t\t\t",
        ].join("\n"),
    });

    assert.equal(report.inventory.starterEligibleCount, 1);
    assert.equal(report.inventory.builtEligibleCount, 1);
    assert.equal(report.readingCoverage.coveredReadings, 2);
});

test("formatWordDeckCompletionReport renders missing rows and phrase exclusions clearly", () => {
    const text = formatWordDeckCompletionReport({
        level: 5,
        inventory: {
            canonicalInventoryCount: 3,
            starterEligibleCount: 2,
            builtEligibleCount: 1,
            starterEligibleCoveragePercent: 50,
            phraseExcludedCount: 1,
            missingEligibleCount: 1,
            extraBuiltCount: 0,
            missingEligibleEntries: [{ written: "赤い花", reading: "あかいはな" }],
            phraseExcludedEntries: [{ written: "高い山", reading: "たかいやま" }],
        },
        readingCoverage: {
            totalReadings: 10,
            coveredReadings: 4,
            coreCoveredReadings: 4,
            supportCoveredReadings: 0,
            missingWordCardReadings: 0,
            missingExampleReadings: 6,
        },
    });

    assert.match(text, /Built starter-eligible rows: 1 \(50%\)/);
    assert.match(text, /Missing starter-eligible N-level rows:/);
    assert.match(text, /赤い花 \(あかいはな\)/);
    assert.match(text, /Phrase-tagged exclusions still in the canonical inventory:/);
    assert.match(text, /高い山 \(たかいやま\)/);
});
