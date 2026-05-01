const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReviewMeaningText, buildReviewReadingText, evaluateGoldenReviewSet, evaluateGoldenWordReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");

test("evaluateGoldenReviewSet passes when cards meet expectations", () => {
    const report = evaluateGoldenReviewSet({
        cards: [
            {
                kanji: "日",
                meaningJP: "day",
                kanjiMeanings: "day / sun",
                onReading: "ニチ",
                kunReading: "ひ",
                notes: "Used in 日本 and 日曜日.",
                exampleSentence: "日本です。 ／ にほんです。 ／ It is Japan.",
            },
        ],
        expectations: [
            {
                kanji: "日",
                readingIncludes: ["ニチ"],
                meaningIncludes: ["day"],
                exampleIncludes: ["日本"],
            },
        ],
    });

    assert.equal(report.passed, true);
    assert.equal(report.failedCount, 0);
});

test("buildReviewMeaningText reviews primary gloss and broader kanji meanings separately", () => {
    assert.equal(buildReviewMeaningText({
        meaningJP: "outside",
        kanjiMeanings: "outside / foreign",
    }), "outside ／ outside / foreign");
});

test("evaluateGoldenReviewSet reports targeted failures", () => {
    const report = evaluateGoldenReviewSet({
        cards: [
            {
                kanji: "学",
                meaningJP: "",
                reading: "",
                notes: "Offline preview built from local data only. Add curated meanings or cached API data for richer output.",
                exampleSentence: "",
            },
        ],
        expectations: [
            {
                kanji: "学",
                readingIncludes: ["ガク"],
                meaningIncludes: ["study"],
                exampleIncludes: ["学"],
            },
        ],
    });

    assert.equal(report.passed, false);
    assert.equal(report.results[0].failures.includes("meaning is empty"), true);
    assert.equal(report.results[0].failures.includes("reading is empty"), true);
    assert.equal(report.results[0].failures.includes("notes still use the generic offline fallback"), true);
});

test("evaluateGoldenReviewSet requires reading expectations to protect the primary reading", () => {
    const report = evaluateGoldenReviewSet({
        cards: [
            {
                kanji: "並",
                primaryReading: "ならぶ",
                meaningJP: "line up",
                kanjiMeanings: "line up / side by side",
                onReading: "ヘイ、 ホウ",
                kunReading: "な.み、 なら.ぶ",
                notes: "並ぶ （ならぶ） - line up",
                exampleSentence: "人が並んでいます。 ／ ひとがならんでいます。 ／ People are lined up.",
            },
        ],
        expectations: [
            {
                kanji: "並",
                readingIncludes: ["ヘイ"],
                meaningIncludes: ["line"],
                notesIncludes: ["並ぶ"],
                exampleIncludes: ["並んで"],
            },
        ],
    });

    assert.equal(report.passed, false);
    assert.equal(report.results[0].failures.includes("primary reading did not include: ヘイ"), true);
});

test("evaluateGoldenReviewSet compares ruby notes by visible surface text", () => {
    const report = evaluateGoldenReviewSet({
        cards: [
            {
                kanji: "走",
                primaryReading: "はしる",
                meaningJP: "run",
                kanjiMeanings: "run",
                onReading: "ソウ",
                kunReading: "はし.る",
                notes: "<ruby>走<rt>はし</rt></ruby>る - run ／ <ruby>競走<rt>きょうそう</rt></ruby> - race",
                exampleSentence: "道を走ります。 ／ みちをはしります。 ／ I run on the road.",
            },
        ],
        expectations: [
            {
                kanji: "走",
                readingIncludes: ["はしる"],
                meaningIncludes: ["run"],
                notesIncludes: ["走る", "競走"],
                exampleIncludes: ["走ります"],
            },
        ],
    });

    assert.equal(report.passed, true);
});

test("formatGoldenReviewReport renders a readable benchmark summary", () => {
    const text = formatGoldenReviewReport({
        totalCards: 2,
        passedCount: 1,
        failedCount: 1,
        passed: false,
        results: [
            { kanji: "日", passed: true, failures: [] },
            { kanji: "学", passed: false, failures: ["reading is empty"] },
        ],
    });

    assert.match(text, /Japanese Kanji Builder Golden Review/);
    assert.match(text, /Cards reviewed: 2/);
    assert.match(text, /Overall result: failing/);
    assert.match(text, /- 学: fail/);
    assert.match(text, /reading is empty/);
});

test("formatGoldenReviewReport accepts a custom title", () => {
    const text = formatGoldenReviewReport({
        totalCards: 1,
        passedCount: 1,
        failedCount: 0,
        passed: true,
        results: [
            { kanji: "日", passed: true, failures: [] },
        ],
    }, { title: "Japanese Kanji Builder Golden N4 Review" });

    assert.match(text, /Japanese Kanji Builder Golden N4 Review/);
});

test("buildReviewReadingText prefers split reading fields and falls back to legacy reading", () => {
    assert.equal(buildReviewReadingText({ onReading: "ニチ", kunReading: "ひ" }), "ニチ ／ ひ");
    assert.equal(
        buildReviewReadingText({ primaryReading: "ひ", onReading: "ニチ", kunReading: "ひ" }),
        "ひ ／ ニチ ／ ひ"
    );
    assert.equal(buildReviewReadingText({ reading: "オン: ガク ／ くん: まなぶ" }), "オン: ガク ／ くん: まなぶ");
    assert.equal(buildReviewReadingText({}), "");
});

test("evaluateGoldenWordReviewSet validates word cards and breakdown content", () => {
    const report = evaluateGoldenWordReviewSet({
        rows: [
            {
                word: "今日",
                reading: "きょう",
                meaning: "today",
                jlptLevel: "JLPT N5",
                coverageRole: "JLPT core + reading coverage",
                focusKanji: "今、日",
                coversReading: "今: いま ／ 日: ひ",
                kanjiBreakdown: "今 （いま） ／ now ... 日 （ひ） ／ day / sun",
                exampleSentence: "今日は図書館へ行きます。",
                notes: "",
            },
        ],
        expectations: [
            {
                word: "今日",
                readingIncludes: ["きょう"],
                meaningIncludes: ["today"],
                jlptLevelIncludes: ["JLPT N5"],
                coverageRoleIncludes: ["JLPT core"],
                focusIncludes: ["今", "日"],
                coversReadingIncludes: ["今: いま", "日: ひ"],
                breakdownIncludes: ["今 （いま）", "日 （ひ）"],
                exampleIncludes: ["図書館へ行きます"],
            },
        ],
    });

    assert.equal(report.passed, true);
    assert.equal(report.passedCount, 1);
});

test("evaluateGoldenWordReviewSet can require every generated word to have a golden expectation", () => {
    const report = evaluateGoldenWordReviewSet({
        rows: [
            {
                word: "今日",
                reading: "きょう",
                meaning: "today",
                jlptLevel: "JLPT N5",
                coverageRole: "JLPT core + reading coverage",
                focusKanji: "今、日",
                coversReading: "今: いま ／ 日: ひ",
                kanjiBreakdown: "今 （いま） ／ now ... 日 （ひ） ／ day / sun",
                exampleSentence: "今日は図書館へ行きます。",
                notes: "",
            },
            {
                word: "明日",
                reading: "あした",
                meaning: "tomorrow",
                jlptLevel: "JLPT N5",
                coverageRole: "JLPT core + reading coverage",
                focusKanji: "明、日",
                coversReading: "明: あ ／ 日: ひ",
                kanjiBreakdown: "明 （あ） ／ bright ... 日 （ひ） ／ day / sun",
                exampleSentence: "明日学校へ行きます。",
                notes: "",
            },
        ],
        expectations: [
            {
                word: "今日",
                readingIncludes: ["きょう"],
            },
        ],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.missingExpectationWords, ["明日 (あした)"]);
    assert.match(formatGoldenReviewReport(report), /missing expectations for generated words: 明日 \(あした\)/);
});

test("evaluateGoldenWordReviewSet reports duplicate and stale word expectations", () => {
    const report = evaluateGoldenWordReviewSet({
        rows: [
            {
                word: "今日",
                reading: "きょう",
                meaning: "today",
                jlptLevel: "JLPT N5",
                coverageRole: "JLPT core + reading coverage",
                focusKanji: "今、日",
                coversReading: "今: いま ／ 日: ひ",
                kanjiBreakdown: "今 （いま） ／ now ... 日 （ひ） ／ day / sun",
                exampleSentence: "今日は図書館へ行きます。",
                notes: "",
            },
        ],
        expectations: [
            { word: "今日", readingIncludes: ["きょう"] },
            { word: "今日", readingIncludes: ["きょう"] },
            { word: "昨日", readingIncludes: ["きのう"] },
        ],
        requireAllRows: true,
    });

    assert.equal(report.passed, false);
    assert.deepEqual(report.duplicateExpectationWords, ["今日 (きょう)"]);
    assert.deepEqual(report.extraExpectationWords, ["昨日 (きのう)"]);
});

test("evaluateGoldenWordReviewSet ignores spacing after reading labels in breakdown checks", () => {
    const report = evaluateGoldenWordReviewSet({
        rows: [
            {
                word: "休み",
                reading: "やすみ",
                meaning: "holiday / day off",
                jlptLevel: "JLPT N5",
                coverageRole: "JLPT core + reading coverage",
                focusKanji: "休",
                coversReading: "休: やすみ",
                kanjiBreakdown: "休み （やすみ） ／ holiday / day off ... <span class=\"kanji-reading-label\">On:</span> キュウ",
                exampleSentence: "日曜日は休みです。",
                notes: "",
            },
        ],
        expectations: [
            {
                word: "休み",
                breakdownIncludes: ["休み （やすみ）", "On:キュウ"],
            },
        ],
    });

    assert.equal(report.passed, true);
    assert.equal(report.passedCount, 1);
});

