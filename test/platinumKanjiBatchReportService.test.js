const test = require("node:test");
const assert = require("node:assert/strict");

const {
    KANJI_BATCH_QUEUE_MODES,
    REVIEW_RUBRIC_RESULTS,
    REVIEW_RUBRIC_STATUSES,
    buildPlatinumKanjiBatchReport,
    buildRiskFlags,
    buildReviewRubric,
    describeCuratedReadingConflict,
    formatPlatinumKanjiBatchReport,
    normalizeReadingEvidence,
    selectBatchRows,
} = require("../src/services/platinumKanjiBatchReportService");
const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_QUALITY_GATES,
} = require("../src/services/platinumKanjiReviewService");

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
        notes: "<ruby>日<rt>ひ</rt></ruby> - day",
        exampleSentence: "今日はいい日です。 ／ きょうはいいひです。 ／ Today is a good day.",
        ...overrides,
    };
}

function buildCurrentStandardEntry(kanji = "日") {
    return {
        kanji,
        status: "platinum",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        primaryReadingRationale: `Uses the exported primary reading for ${kanji} because it is learner-facing at this level.`,
        sourceEvidence: [{
            type: "japanese-source",
            source: "fixture Japanese source",
            detail: `Fixture Japanese source verified ${kanji} card-field truth.`,
        }],
        internalChecks: [
            {
                type: "generated-surface",
                source: "fixture generated-surface audit",
                detail: `Fixture generated surface was checked for ${kanji}.`,
            },
            {
                type: "golden-regression",
                source: "fixture golden regression",
                detail: `Fixture separate golden regression gate was checked for ${kanji} and is not source evidence.`,
            },
            {
                type: "media-audit",
                source: "fixture media audit",
                detail: `Fixture media audit checked ${kanji} audio and stroke-order media.`,
            },
            {
                type: "audio-review",
                source: "fixture audio review",
                detail: `Fixture exact audio identity was checked for ${kanji}.`,
            },
            {
                type: "stroke-order-review",
                source: "fixture stroke-order review",
                detail: `Fixture stroke-order media target was checked for ${kanji}.`,
            },
        ],
        reviewEvidence: [
            {
                type: "manual-review",
                source: "fixture manual review",
                detail: `Manual reviewer judged the fixture ${kanji} card.`,
            },
            {
                type: "current-standard-review",
                source: "fixture current-standard review",
                detail: `Current-standard review with evidence lanes checked fixture kanji ${kanji}.`,
            },
        ],
        qualityGates: Object.fromEntries(REQUIRED_KANJI_QUALITY_GATES.map((gate) => [gate, true])),
    };
}

test("normalizeReadingEvidence sees dictionary punctuation and katakana readings as comparable", () => {
    assert.equal(normalizeReadingEvidence("On: ジ、 Kun: か.く"), "onじkunかく");
});

test("selectBatchRows defaults to substantive rereview queue in generated deck order", () => {
    const rows = [
        buildRow({ kanji: "一", displayWord: "一" }),
        buildRow({ kanji: "二", displayWord: "二" }),
        buildRow({ kanji: "三", displayWord: "三" }),
    ];
    const entries = [buildCurrentStandardEntry("一")];

    assert.deepEqual(selectBatchRows({ rows, entries, limit: 2 }).map((row) => row.kanji), ["一", "二"]);
});

test("batch report does not count revalidationSummary prose as rereview proof", () => {
    const entry = buildCurrentStandardEntry("一");
    entry.revalidationSummary += " Substantive current-standard rereview for 一|いち: checked all evidence lanes and not a mechanical migration.";

    const report = buildPlatinumKanjiBatchReport({
        rows: [buildRow({ kanji: "一", displayWord: "一", primaryReading: "いち" })],
        entries: [entry],
        level: 5,
        limit: 1,
    });

    assert.equal(report.summary.substantiveRereviewProven, 0);
    assert.equal(report.summary.remainingSubstantiveRereview, 1);
    assert.equal(report.cards[0].reviewStatus, "current_standard_structural_only");
    assert.equal(
        report.cards[0].reviewRubric.items.find((item) => item.id === "substantive_rereview_provenance").status,
        REVIEW_RUBRIC_STATUSES.NOT_PROVEN
    );
});

test("selectBatchRows can still expose the missing current-standard structure queue explicitly", () => {
    const rows = [
        buildRow({ kanji: "一", displayWord: "一" }),
        buildRow({ kanji: "二", displayWord: "二" }),
        buildRow({ kanji: "三", displayWord: "三" }),
    ];
    const entries = [buildCurrentStandardEntry("一")];

    assert.deepEqual(selectBatchRows({
        rows,
        entries,
        limit: 2,
        queue: KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
    }).map((row) => row.kanji), ["二", "三"]);
});

test("buildPlatinumKanjiBatchReport summarizes surfaces checks and risks without writing entries", () => {
    const rows = [
        buildRow(),
        buildRow({
            kanji: "月",
            displayWord: "月",
            primaryReading: "つき",
            meaningJP: "month / moon / lunar",
            kanjiMeanings: "month / moon",
            onReading: "On: ゲツ、 ガツ",
            kunReading: "Kun: つき",
            notes: "つき - moon",
            exampleSentence: "夜はきれいです。 ／ よるはきれいです。 ／ The night is beautiful.",
            audio: "[sound:6708_月-kanji-reading-月-つき.wav]",
        }),
    ];

    const report = buildPlatinumKanjiBatchReport({
        rows,
        entries: [buildCurrentStandardEntry("日")],
        level: 5,
        limit: 12,
    });

    assert.equal(report.summary.generatedRows, 2);
    assert.equal(report.summary.activePlatinum, 1);
    assert.equal(report.summary.remainingPlatinum, 1);
    assert.equal(report.summary.substantiveRereviewProven, 0);
    assert.equal(report.summary.remainingSubstantiveRereview, 2);
    assert.deepEqual(report.cards.map((card) => card.kanji), ["日", "月"]);
    assert.equal(report.cards[1].hardChecksPassed, true);
    assert.equal(report.reviewRubricSummary.version, "kanji-platinum-rereview-rubric-v1");
    assert.equal(report.cards[0].reviewRubric.result, REVIEW_RUBRIC_RESULTS.READY_FOR_SUBSTANTIVE_REVIEW);
    assert.equal(
        report.cards[0].reviewRubric.items.find((item) => item.id === "substantive_rereview_provenance").status,
        REVIEW_RUBRIC_STATUSES.NOT_PROVEN
    );
    assert.equal(
        report.cards[0].reviewRubric.items.find((item) => item.id === "source_evidence_lane").status,
        REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED
    );
    assert.equal(
        report.cards[0].reviewRubric.items.find((item) => item.id === "example_and_support_usage").status,
        REVIEW_RUBRIC_STATUSES.MANUAL_JUDGMENT_REQUIRED
    );
    assert.match(report.cards[0].riskFlags.join("\n"), /square-zero substantive rereview proof is still required/);
    assert.match(report.cards[1].riskFlags.join("\n"), /notes do not visibly include the target kanji/);
    assert.match(report.cards[1].riskFlags.join("\n"), /MeaningJP has several glosses/);
});

test("buildReviewRubric blocks dirty generated cards before provenance work", () => {
    const row = buildRow({
        displayWord: "日本",
        studyWordKanji: "日本",
        audio: "[sound:65E5_日-kanji-reading-日-にち.wav]",
    });
    const hardChecks = [
        { name: "DisplayWord equals target kanji", passed: false },
        { name: "StudyWordKanji is blank", passed: false },
        { name: "Audio is exact target plus primary reading", passed: false },
    ];
    const rubric = buildReviewRubric(row, {
        reviewStatus: "current_standard_structural_only",
        statuses: ["platinum"],
        currentStandardEntry: buildCurrentStandardEntry("日"),
        hardChecks,
        generatedFailures: ["DisplayWord must equal the target kanji."],
    });

    assert.equal(rubric.result, REVIEW_RUBRIC_RESULTS.BLOCKED);
    assert.equal(
        rubric.items.find((item) => item.id === "kanji_card_contract").status,
        REVIEW_RUBRIC_STATUSES.BLOCKED
    );
    assert.equal(
        rubric.items.find((item) => item.id === "media_identity").status,
        REVIEW_RUBRIC_STATUSES.BLOCKED
    );
});

test("buildRiskFlags calls out active entries and generated support risks", () => {
    const flags = buildRiskFlags(buildRow({
        exampleSentence: "天気がいいです。 ／ てんきがいいです。 ／ The weather is good.",
    }), {
        reviewStatus: "active_platinum",
        statuses: ["platinum"],
    });

    assert.match(flags.join("\n"), /already has active platinum/);
    assert.match(flags.join("\n"), /example sentence does not visibly include the target kanji/);
});

test("buildRiskFlags calls out curated kanji-card and word-breakdown reading conflicts", () => {
    const row = buildRow({
        kanji: "図",
        displayWord: "図",
        primaryReading: "と",
        onReading: "On: ズ、 ト",
        kunReading: "Kun: はかる",
        notes: "図 （ず） - diagram / plan ／ 地図 （ちず） - map",
        exampleSentence: "地図を見ます。 ／ ちずをみます。 ／ I look at a map.",
    });
    const curatedEntry = {
        displayWord: { written: "図", pron: "ず" },
        breakdownDisplayWord: { written: "図", pron: "と" },
    };

    assert.match(
        describeCuratedReadingConflict(row, curatedEntry),
        /curated display reading ず differs from word-breakdown reading と/
    );

    const flags = buildRiskFlags(row, { curatedEntry });
    assert.match(flags.join("\n"), /word-breakdown reading と/);
    assert.match(flags.join("\n"), /explicitly justified against Japanese source evidence/);
});

test("buildPlatinumKanjiBatchReport includes curated reading conflict risks from loaded study data", () => {
    const report = buildPlatinumKanjiBatchReport({
        rows: [buildRow({
            kanji: "元",
            displayWord: "元",
            primaryReading: "げん",
            onReading: "On: ゲン",
            kunReading: "Kun: もと",
            notes: "<ruby>元<rt>もと</rt></ruby> - origin ／ 元気 （げんき） - energetic",
            exampleSentence: "元気です。 ／ げんきです。 ／ I am well.",
        })],
        entries: [],
        level: 4,
        curatedStudyData: {
            元: {
                displayWord: { written: "元", pron: "もと" },
                breakdownDisplayWord: { written: "元", pron: "げん" },
            },
        },
    });

    assert.match(report.cards[0].riskFlags.join("\n"), /curated display reading もと differs/);
});

test("formatPlatinumKanjiBatchReport states that the report is read-only", () => {
    const report = buildPlatinumKanjiBatchReport({
        rows: [buildRow()],
        entries: [],
        level: 5,
        limit: 1,
    });

    const formatted = formatPlatinumKanjiBatchReport(report);
    assert.match(formatted, /Platinum N5 Kanji Batch Report/);
    assert.match(formatted, /Rubric: kanji-platinum-rereview-rubric-v1/);
    assert.match(formatted, /Review rubric: blocked/);
    assert.match(formatted, /manual_judgment_required/);
    assert.match(formatted, /This report is read-only/);
    assert.match(formatted, /日 \[missing_platinum\]/);
});
