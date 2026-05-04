const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordInventoryExpansionCandidateReport,
    classifyCandidateDisposition,
    formatWordInventoryExpansionCandidateReport,
    normalizeCandidateSourceRow,
    parseCandidateSourceText,
    parseDelimitedLine,
    parseSourceLevel,
} = require("../src/services/wordInventoryExpansionCandidateService");

const jlptLevelContract = {
    kanjiLevels: {
        山: 5,
        川: 5,
        学: 5,
        校: 5,
        茶: 4,
        新: 4,
        幹: 4,
        線: 4,
        謎: 1,
    },
};

const jlptWordLevelContract = {
    wordLevels: {
        "学校|がっこう": { written: "学校", reading: "がっこう", jlpt: 5 },
    },
    excludedWordLevels: {
        "山の上|やまのうえ": { written: "山の上", reading: "やまのうえ", jlpt: 5, exclusionReason: "phrase" },
    },
};

test("parseCandidateSourceText reads TSV, CSV, and JSON candidate sources", () => {
    assert.deepEqual(parseDelimitedLine("\"山川\",さんせん,\"mountains, rivers\"", ","), [
        "山川",
        "さんせん",
        "mountains, rivers",
    ]);

    assert.deepEqual(parseCandidateSourceText("word\treading\tmeaning\n山川\tさんせん\tmountains and rivers"), [{
        word: "山川",
        reading: "さんせん",
        meaning: "mountains and rivers",
    }]);

    assert.deepEqual(parseCandidateSourceText("[{\"written\":\"山川\",\"reading\":\"さんせん\"}]"), [{
        written: "山川",
        reading: "さんせん",
    }]);
});

test("normalizeCandidateSourceRow maps common external vocab headers", () => {
    assert.deepEqual(normalizeCandidateSourceRow({
        Expression: "山川",
        Kana: "さんせん",
        English: "mountains and rivers",
        JLPT: "JLPT N5",
        Source: "fixture",
    }), {
        written: "山川",
        reading: "さんせん",
        meaning: "mountains and rivers",
        source: "fixture",
        notes: "",
        sourceLevel: 5,
        frequencyRank: null,
        key: "山川|さんせん",
    });

    assert.equal(parseSourceLevel("n4"), 4);
    assert.equal(parseSourceLevel(""), null);
});

test("buildWordInventoryExpansionCandidateReport keeps only new source words that match the requested kanji scope", () => {
    const sourceRows = [
        { written: "学校", reading: "がっこう", meaning: "school", jlpt: "N5" },
        { written: "山川", reading: "さんせん", meaning: "mountains and rivers", jlpt: "N5" },
        { written: "山川", reading: "さんせん", meaning: "duplicate", jlpt: "N5" },
        { written: "おちゃ", reading: "おちゃ", meaning: "tea", jlpt: "N5" },
        { written: "お茶", reading: "おちゃ", meaning: "tea", jlpt: "N5" },
        { written: "新幹線", reading: "しんかんせん", meaning: "bullet train", jlpt: "N5" },
        { written: "山茶", reading: "やまちゃ", meaning: "mountain tea", jlpt: "N5" },
        { written: "山の上", reading: "やまのうえ", meaning: "on the mountain", jlpt: "N5" },
    ];

    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows,
        targetLevel: 5,
        kanjiScope: "at-or-below",
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
    });

    assert.equal(report.summary.sourceRows, 8);
    assert.equal(report.summary.normalizedRows, 8);
    assert.equal(report.summary.uniqueRows, 7);
    assert.equal(report.summary.duplicateSourceRows, 1);
    assert.equal(report.summary.reviewCandidateRows, 1);
    assert.equal(report.candidates[0].key, "山川|さんせん");
    assert.equal(report.summary.dispositions.already_governed, 1);
    assert.equal(report.summary.dispositions.kana_only, 1);
    assert.equal(report.summary.dispositions.no_target_kanji, 2);
    assert.equal(report.summary.dispositions.kanji_scope_mismatch, 1);
    assert.equal(report.summary.dispositions.already_excluded, 1);
});

test("target-level scope rejects easier-level kanji while at-or-below accepts them", () => {
    const row = { written: "茶山", reading: "ちゃやま", sourceLevel: 4, key: "茶山|ちゃやま" };

    assert.equal(classifyCandidateDisposition(row, {
        targetLevel: 4,
        kanjiScope: "at-or-below",
        jlptLevelContract,
        jlptWordLevelContract: { wordLevels: {}, excludedWordLevels: {} },
    }).disposition, "review_candidate");

    assert.equal(classifyCandidateDisposition(row, {
        targetLevel: 4,
        kanjiScope: "target-level",
        jlptLevelContract,
        jlptWordLevelContract: { wordLevels: {}, excludedWordLevels: {} },
    }).disposition, "kanji_scope_mismatch");
});

test("formatWordInventoryExpansionCandidateReport is explicit that candidates do not change readiness", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{ written: "山川", reading: "さんせん", meaning: "mountains and rivers" }],
        targetLevel: 5,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
    });
    const text = formatWordInventoryExpansionCandidateReport(report);

    assert.match(text, /Read-only report/);
    assert.match(text, /does not promote words, change contracts, or affect readiness/);
    assert.match(text, /Use after the current reading-coverage pass/);
    assert.match(text, /山川 \(さんせん\)/);
});
