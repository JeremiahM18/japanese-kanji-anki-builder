const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordInventoryExpansionCandidateReport,
    classifyCandidateDisposition,
    formatWordInventoryExpansionCandidateReport,
    normalizeTriageDecisions,
    normalizeCandidateSourceRow,
    normalizeCandidateSourceRows,
    parseCandidateSourceText,
    parseDelimitedLine,
    parseSourceLevel,
    splitReadingVariants,
} = require("../src/services/wordInventoryExpansionCandidateService");

const jlptLevelContract = {
    kanjiLevels: {
        山: 5,
        川: 5,
        学: 5,
        校: 5,
        行: 5,
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
        "行く|いく": { written: "行く", reading: "いく", jlpt: 5 },
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
        { written: "行く", reading: "いく/ゆく", meaning: "to go", jlpt: "N5" },
        { written: "～円", reading: "～えん", meaning: "yen suffix", jlpt: "N5" },
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
        triageDecisions: {
            "山川|さんせん": {
                decision: "keep_candidate",
                priority: "high",
                reason: "Useful sourced word for review.",
                nextStep: "Promote only after source review.",
            },
            "行く|ゆく": {
                decision: "reject_candidate",
                priority: "low",
                reason: "Same written duplicate.",
            },
        },
    });

    assert.equal(report.summary.sourceRows, 10);
    assert.equal(report.summary.normalizedRows, 11);
    assert.equal(report.summary.uniqueRows, 10);
    assert.equal(report.summary.duplicateSourceRows, 1);
    assert.equal(report.summary.reviewCandidateRows, 2);
    assert.equal(report.summary.sameWrittenCandidateRows, 1);
    assert.equal(report.summary.triagedCandidateRows, 2);
    assert.equal(report.summary.untriagedCandidateRows, 0);
    assert.deepEqual(report.summary.triageDecisions, {
        keep_candidate: 1,
        reject_candidate: 1,
    });
    assert.equal(report.candidates[0].key, "山川|さんせん");
    assert.equal(report.candidates[0].triageDecision.decision, "keep_candidate");
    assert.equal(report.candidates[1].key, "行く|ゆく");
    assert.deepEqual(report.candidates[1].sameWrittenContractEntries, [{
        key: "行く|いく",
        reading: "いく",
        jlpt: 5,
        exclusionReason: "",
        type: "governed",
    }]);
    assert.equal(report.summary.dispositions.already_governed, 2);
    assert.equal(report.summary.dispositions.kana_only, 1);
    assert.equal(report.summary.dispositions.no_target_kanji, 2);
    assert.equal(report.summary.dispositions.kanji_scope_mismatch, 1);
    assert.equal(report.summary.dispositions.already_excluded, 1);
    assert.equal(report.summary.dispositions.source_template, 1);
});

test("normalizeTriageDecisions keeps only decisions with a reason", () => {
    assert.deepEqual(normalizeTriageDecisions({
        "山川|さんせん": {
            decision: " keep_candidate ",
            priority: " high ",
            reason: " review this ",
            nextStep: " promote later ",
        },
        "行く|ゆく": {
            decision: "reject_candidate",
        },
    }), {
        "山川|さんせん": {
            decision: "keep_candidate",
            priority: "high",
            reason: "review this",
            nextStep: "promote later",
        },
    });

    assert.throws(() => normalizeTriageDecisions({
        "山川|さんせん": {
            decision: "maybe_candidate",
            reason: "Unsupported review state.",
        },
    }), /Unsupported word expansion triage decision for 山川\|さんせん: maybe_candidate/);
});

test("source normalization splits slash readings into exact word identities", () => {
    assert.deepEqual(splitReadingVariants("いく/ゆく"), ["いく", "ゆく"]);
    assert.deepEqual(normalizeCandidateSourceRows({
        written: "行く",
        reading: "いく/ゆく",
        meaning: "to go",
    }).map((row) => row.key), ["行く|いく", "行く|ゆく"]);
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
    assert.match(text, /Triaged review candidates: 0\/1/);
    assert.match(text, /triage: untriaged/);
});

test("formatWordInventoryExpansionCandidateReport flags same-written governed readings", () => {
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows: [{ written: "行く", reading: "ゆく", meaning: "to go" }],
        targetLevel: 5,
        jlptLevelContract,
        jlptWordLevelContract,
        sourceLabel: "fixture",
        triageDecisions: {
            "行く|ゆく": {
                decision: "reject_candidate",
                priority: "low",
                reason: "Same written duplicate.",
                nextStep: "Do not promote.",
            },
        },
    });
    const text = formatWordInventoryExpansionCandidateReport(report);

    assert.equal(report.summary.sameWrittenCandidateRows, 1);
    assert.match(text, /Same-written candidate warnings: 1/);
    assert.match(text, /same-written warning: already tracked with reading\(s\) いく \(N5\)/);
    assert.match(text, /Triaged review candidates: 1\/1/);
    assert.match(text, /triage: reject_candidate \[low\]/);
    assert.match(text, /triage reason: Same written duplicate\./);
    assert.match(text, /triage next step: Do not promote\./);
});
