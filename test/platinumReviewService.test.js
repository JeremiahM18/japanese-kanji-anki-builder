const test = require("node:test");
const assert = require("node:assert/strict");

const {
    REQUIRED_WORD_EVIDENCE_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildWordPitchAccentData(overrides = {}) {
    const { ["今日|きょう"]: todayOverride = {}, ...extraEntries } = overrides;
    return {
        sources: {
            "kanjium-cc-by-sa-4.0": {
                name: "Kanjium pitch accent database",
                license: "CC BY-SA 4.0",
            },
        },
        entries: {
            "今日|きょう": {
                pattern: "0 [heiban]",
                sourceId: "kanjium-cc-by-sa-4.0",
                sourceWord: "今日",
                sourceReading: "きょう",
                sourceAccent: "0",
                ...todayOverride,
            },
            ...extraEntries,
        },
    };
}

function evaluateWordPlatinum(options = {}) {
    return evaluatePlatinumWordReviewSet({
        wordPitchAccentData: buildWordPitchAccentData(),
        ...options,
    });
}

function buildRow(overrides = {}) {
    return {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:4ECA_今日-word-reading-今日-きょう.wav]",
        pitchAccent: "<span aria-label=\"Pitch 1: 0\">きょう: Heiban</span>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "今 （いま） ／ now ... 日 （ひ） ／ day / sun",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Common N5 word.",
        ...overrides,
    };
}

function buildEntry(overrides = {}) {
    return {
        word: "今日",
        status: "platinum",
        readingIncludes: ["きょう"],
        meaningIncludes: ["today"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core"],
        focusIncludes: ["今", "日"],
        coversReadingIncludes: ["今: いま", "日: ひ"],
        breakdownIncludes: ["今 （いま）", "日 （ひ）"],
        exampleIncludes: ["今日は図書館へ行きます。"],
        pitchAccentIncludes: ["Pitch 1: 0"],
        selectionRationale: "Common N5 time word that is useful immediately and belongs in the word deck.",
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        sourceEvidence: REQUIRED_WORD_EVIDENCE_TYPES.map((type) => ({
            type,
            source: "test fixture",
            detail: `Reviewed ${type} evidence for 今日.`,
        })),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

test("evaluatePlatinumWordReviewSet passes active platinum entries with release gates and matching export fields", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.activePlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumWordReviewSet rejects active entries with missing release-quality gates", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildEntry({
                qualityGates: buildQualityGates({ commonOrUseful: false }),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /quality gate must be true: commonOrUseful/);
});

test("evaluatePlatinumWordReviewSet rejects active entries when media fields are not exported", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow({ audio: "", pitchAccent: "" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /audio field is empty/);
    assert.match(report.results[0].failures.join("\n"), /pitch accent field is empty/);
});

test("evaluatePlatinumWordReviewSet requires selection rationale and structured evidence", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [
            buildEntry({
                selectionRationale: "",
                sourceEvidence: ["free text evidence is not enough"],
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /selectionRationale must explain/);
    assert.match(failures, /sourceEvidence must contain structured evidence entries/);
    assert.match(failures, /sourceEvidence must include evidence type: pitch-accent-review/);
});

test("evaluatePlatinumWordReviewSet protects exact word audio and pitch accent expectations", () => {
    const report = evaluateWordPlatinum({
        rows: [
            buildRow({
                audio: "[sound:4ECA_今日-word-reading-今日-こんにち.wav]",
                pitchAccent: "<span aria-label=\"Pitch 1: 1\">きょう: Atamadaka</span>",
            }),
        ],
        entries: [buildEntry()],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /pitch accent did not include: Pitch 1: 0/);
    assert.match(failures, /pitch accent rendered output did not match source pattern/);
    assert.match(failures, /audio field did not include exact word-reading asset fragment: word-reading-今日-きょう/);
});

test("evaluatePlatinumWordReviewSet requires governed pitch source data", () => {
    const report = evaluatePlatinumWordReviewSet({
        rows: [buildRow()],
        entries: [buildEntry()],
        wordPitchAccentData: { sources: {}, entries: {} },
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /pitch accent source entry missing/);
});

test("evaluatePlatinumWordReviewSet rejects pitch source data that belongs to a different word-reading", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [buildEntry()],
        wordPitchAccentData: buildWordPitchAccentData({
            "今日|きょう": {
                sourceWord: "明日",
            },
        }),
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /pitch accent source validation failed/);
    assert.match(report.results[0].failures.join("\n"), /sourceWord does not match/);
});

test("evaluatePlatinumWordReviewSet keeps deferred and removed words out of the export", () => {
    const passing = evaluateWordPlatinum({
        rows: [],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
                reviewedAt: "2026-05-02",
                reviewer: "content-review",
                decisionReason: "Not common or useful enough for the current level.",
            },
        ],
        allowEmpty: true,
    });

    const failing = evaluateWordPlatinum({
        rows: [buildRow({ word: "難語", reading: "なんご" })],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
                reviewedAt: "2026-05-02",
                reviewer: "content-review",
                decisionReason: "Not common or useful enough for the current level.",
            },
        ],
        allowEmpty: true,
    });

    assert.equal(passing.passed, true);
    assert.equal(failing.passed, false);
    assert.match(failing.results[0].failures.join("\n"), /deferred word still appears/);
});

test("evaluatePlatinumWordReviewSet can require every generated row to be platinum reviewed", () => {
    const report = evaluateWordPlatinum({
        rows: [
            buildRow(),
            buildRow({ word: "明日", reading: "あした" }),
        ],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingPlatinumRows, ["明日 (あした)"]);
    assert.match(formatPlatinumWordReviewReport(report), /missing platinum entries for generated words: 1/);
    assert.match(formatPlatinumWordReviewReport(report), /明日 \(あした\)/);
});

test("evaluatePlatinumWordReviewSet does not pass an empty platinum set by default", () => {
    const report = evaluateWordPlatinum({
        rows: [buildRow()],
        entries: [],
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.coverageFailures, ["no active platinum entries have been reviewed"]);
});

test("evaluatePlatinumWordReviewSet requires reviewer and date for non-shipping decisions", () => {
    const report = evaluateWordPlatinum({
        rows: [],
        entries: [{
            word: "難語",
            status: "removed",
            readingIncludes: ["なんご"],
            decisionReason: "Not useful enough for the version 1 word deck.",
        }],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /reviewedAt is required/);
    assert.match(failures, /reviewer is required/);
});
