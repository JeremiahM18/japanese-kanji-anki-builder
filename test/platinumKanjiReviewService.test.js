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

function buildSourceEvidence() {
    const details = {
        "generated-surface": "Generated card surface inspected for 日: single-kanji anchor, primary reading ひ, meaning, notes, example 雨の日です。, audio, and stroke-order fields.",
        "golden-review": "N5 golden review protects 日.",
        "japanese-source": "Japanese dictionary-style source verified 日 primary reading ひ, primary meaning day, and broader meanings day and sun.",
        "media-audit": "Managed media provenance audit checked 日 audio and stroke-order source policy.",
        "audio-review": "Audio review checked 日 exact asset fragment kanji-reading-日-ひ.",
        "stroke-order-review": "Visual stroke-order review checked target 日 against source-policy governed media.",
        "manual-review": "Manual review judged 日 as an individual-kanji learner card.",
    };

    return REQUIRED_KANJI_EVIDENCE_TYPES.map((type) => ({
        type,
        source: type === "japanese-source"
            ? "Kanjipedia https://www.kanjipedia.jp/kanji/0006416300; Bunka Joyo Kanji reading index"
            : "test fixture source",
        detail: details[type],
    }));
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
        sourceEvidence: buildSourceEvidence(),
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

test("evaluatePlatinumKanjiReviewSet rejects source evidence that does not bind to reviewed field values", () => {
    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [
            buildEntry({
                sourceEvidence: REQUIRED_KANJI_EVIDENCE_TYPES.map((type) => ({
                    type,
                    source: type === "japanese-source"
                        ? "Kanjipedia https://www.kanjipedia.jp/kanji/0006416300"
                        : "test fixture source",
                    detail: "Reviewed this field.",
                })),
            }),
        ],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /japanese-source evidence must explicitly support/);
    assert.match(failures, /audio-review evidence must explicitly support/);
    assert.match(failures, /stroke-order-review evidence must explicitly support/);
});

test("evaluatePlatinumKanjiReviewSet rejects generated-only japanese-source evidence", () => {
    const localOnlyEvidence = buildSourceEvidence().map((evidence) => (
        evidence.type === "japanese-source"
            ? {
                ...evidence,
                source: "templates/starter_curated_study_data.json; templates/jlpt_kanji_source_evidence.json; out/build/exports/kanji-n5.tsv",
                detail: "Local starter/source-governance/generated files list 日 with primary reading ひ, primary meaning day, and broader meanings day and sun.",
            }
            : evidence
    ));

    const report = evaluatePlatinumKanjiReviewSet({
        rows: [buildRow()],
        entries: [buildEntry({ sourceEvidence: localOnlyEvidence })],
    });

    const failures = report.results[0].failures.join("\n");
    assert.equal(report.passed, false);
    assert.match(failures, /japanese-source evidence must cite a governed source allowed for kanji-field-verification for kanji card accuracy/);
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
