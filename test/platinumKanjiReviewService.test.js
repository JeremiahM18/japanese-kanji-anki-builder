const test = require("node:test");
const assert = require("node:assert/strict");

const {
    REQUIRED_KANJI_EVIDENCE_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");

function buildQualityGates(overrides = {}) {
    return Object.fromEntries(REQUIRED_KANJI_QUALITY_GATES.map((gate) => [gate, overrides[gate] ?? true]));
}

function buildRow(overrides = {}) {
    return {
        kanji: "日",
        levelLabel: "N5",
        displayWord: "日",
        meaningJP: "day",
        primaryReading: "ひ",
        kanjiMeanings: "day / sun",
        studyWordKanji: "",
        onReading: "On: ニチ、 ジツ",
        kunReading: "Kun: ひ、 か",
        strokeOrder: "<img src=\"65E5_日-stroke-order.gif\" />",
        audio: "[sound:65E5_日-kanji-reading-日-ひ.wav]",
        radical: "日",
        notes: "<ruby>日<rt>ひ</rt></ruby> - day ／ <ruby>日本<rt>にほん</rt></ruby> - Japan",
        exampleSentence: "雨の日です。 ／ あめのひです。 ／ It is a rainy day.",
        ...overrides,
    };
}

function buildEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "platinum",
        readingIncludes: ["ひ"],
        meaningIncludes: ["day"],
        kanjiMeaningsIncludes: ["day", "sun"],
        levelIncludes: ["N5"],
        notesIncludes: ["日", "日本"],
        exampleIncludes: ["雨の日です。"],
        primaryReadingRationale: "Uses the common learner-facing kun reading ひ for the individual kanji 日.",
        reviewedAt: "2026-05-02",
        reviewer: "content-review",
        sourceEvidence: REQUIRED_KANJI_EVIDENCE_TYPES.map((type) => ({
            type,
            source: "test fixture",
            detail: `Reviewed ${type} evidence for 日.`,
        })),
        qualityGates: buildQualityGates(),
        ...overrides,
    };
}

test("evaluatePlatinumKanjiReviewSet passes active platinum entries with strict kanji card gates", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.activePlatinumCount, 1);
    assert.equal(report.failedCount, 0);
});

test("evaluatePlatinumKanjiReviewSet rejects entries when the kanji card anchor drifts", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({ displayWord: "日本", studyWordKanji: "<span>本: JLPT N5</span>" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /DisplayWord does not equal the target kanji/);
    assert.match(report.results[0].failures.join("\n"), /StudyWordKanji must be blank/);
});

test("evaluatePlatinumKanjiReviewSet rejects non-exact primary-reading audio", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow({ audio: "[sound:word-日本-にほん.wav]" })],
        entries: [buildEntry()],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /Audio field is not kanji-reading audio/);
});

test("evaluatePlatinumKanjiReviewSet rejects active entries with missing quality gates", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                qualityGates: buildQualityGates({ individualKanjiAnchor: false }),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /quality gate must be true: individualKanjiAnchor/);
});

test("evaluatePlatinumKanjiReviewSet requires primary-reading rationale and structured evidence", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                primaryReadingRationale: "",
                sourceEvidence: ["free text evidence is not enough"],
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /primaryReadingRationale must explain/);
    assert.match(failures, /sourceEvidence must contain structured evidence entries/);
    assert.match(failures, /sourceEvidence must include evidence type: japanese-source/);
});

test("evaluatePlatinumKanjiReviewSet requires every structured evidence type", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                sourceEvidence: REQUIRED_KANJI_EVIDENCE_TYPES
                    .filter((type) => type !== "audio-review")
                    .map((type) => ({
                        type,
                        source: "test fixture",
                        detail: `Reviewed ${type} evidence for 日.`,
                    })),
            }),
        ],
    });

    assert.equal(report.passed, false);
    assert.match(report.results[0].failures.join("\n"), /sourceEvidence must include evidence type: audio-review/);
});

test("evaluatePlatinumKanjiReviewSet can require every generated kanji to be platinum reviewed", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [
            buildRow(),
            buildRow({ kanji: "月", displayWord: "月", primaryReading: "つき", audio: "[sound:6708_月-kanji-reading-月-つき.wav]" }),
        ],
        entries: [buildEntry()],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingPlatinumRows, ["月"]);
    assert.match(formatPlatinumKanjiReviewReport(report), /missing platinum entries for generated kanji: 1/);
    assert.match(formatPlatinumKanjiReviewReport(report), /月/);
});

test("evaluatePlatinumKanjiReviewSet does not pass an empty platinum set by default", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [],
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.coverageFailures, ["no active platinum entries have been reviewed"]);
});

test("evaluatePlatinumKanjiReviewSet requires reviewer and date for non-shipping decisions", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [],
        entries: [{
            kanji: "日",
            status: "removed",
            decisionReason: "Not appropriate for this surface.",
        }],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /reviewedAt is required/);
    assert.match(failures, /reviewer is required/);
});
