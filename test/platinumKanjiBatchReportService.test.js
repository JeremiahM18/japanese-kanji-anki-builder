const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPlatinumKanjiBatchReport,
    buildRiskFlags,
    describeCuratedReadingConflict,
    formatPlatinumKanjiBatchReport,
    normalizeReadingEvidence,
    selectBatchRows,
} = require("../src/services/platinumKanjiBatchReportService");
const { CURRENT_KANJI_PLATINUM_REVIEW_STANDARD } = require("../src/services/platinumKanjiReviewService");

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
        revalidationSummary: "Revalidated generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: [{ type: "current-standard-review" }],
    };
}

test("normalizeReadingEvidence sees dictionary punctuation and katakana readings as comparable", () => {
    assert.equal(normalizeReadingEvidence("On: ジ、 Kun: か.く"), "onじkunかく");
});

test("selectBatchRows defaults to next missing rows in generated deck order", () => {
    const rows = [
        buildRow({ kanji: "一", displayWord: "一" }),
        buildRow({ kanji: "二", displayWord: "二" }),
        buildRow({ kanji: "三", displayWord: "三" }),
    ];
    const entries = [buildCurrentStandardEntry("一")];

    assert.deepEqual(selectBatchRows({ rows, entries, limit: 2 }).map((row) => row.kanji), ["二", "三"]);
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
    assert.deepEqual(report.cards.map((card) => card.kanji), ["月"]);
    assert.equal(report.cards[0].hardChecksPassed, true);
    assert.match(report.cards[0].riskFlags.join("\n"), /notes do not visibly include the target kanji/);
    assert.match(report.cards[0].riskFlags.join("\n"), /MeaningJP has several glosses/);
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
    assert.match(formatted, /This report is read-only/);
    assert.match(formatted, /日 \[missing_platinum\]/);
});
