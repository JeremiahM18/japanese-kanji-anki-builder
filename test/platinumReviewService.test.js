const test = require("node:test");
const assert = require("node:assert/strict");

const {
    REQUIRED_WORD_QUALITY_GATES,
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildRow(overrides = {}) {
    return {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:word-今日-きょう.wav]",
        pitchAccent: "<span>きょう: Heiban</span>",
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
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        sourceEvidence: ["Project word contract, dictionary cross-check, generated card surface, audio/pitch/media audits."],
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

test("evaluatePlatinumWordReviewSet passes active platinum entries with release gates and matching export fields", () => {
    const report = evaluatePlatinumWordReviewSet({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.activePlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumWordReviewSet rejects active entries with missing release-quality gates", () => {
    const report = evaluatePlatinumWordReviewSet({
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
    const report = evaluatePlatinumWordReviewSet({
        rows: [buildRow({ audio: "", pitchAccent: "" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /audio field is empty/);
    assert.match(report.results[0].failures.join("\n"), /pitch accent field is empty/);
});

test("evaluatePlatinumWordReviewSet keeps deferred and removed words out of the export", () => {
    const passing = evaluatePlatinumWordReviewSet({
        rows: [],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
                decisionReason: "Not common or useful enough for the current level.",
            },
        ],
        allowEmpty: true,
    });

    const failing = evaluatePlatinumWordReviewSet({
        rows: [buildRow({ word: "難語", reading: "なんご" })],
        entries: [
            {
                word: "難語",
                status: "deferred",
                readingIncludes: ["なんご"],
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
    const report = evaluatePlatinumWordReviewSet({
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
    const report = evaluatePlatinumWordReviewSet({
        rows: [buildRow()],
        entries: [],
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.coverageFailures, ["no active platinum entries have been reviewed"]);
});
