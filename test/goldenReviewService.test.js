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
                breakdownIncludes: ["今 （いま）", "日 （ひ）"],
                exampleIncludes: ["図書館へ行きます"],
            },
        ],
    });

    assert.equal(report.passed, true);
    assert.equal(report.passedCount, 1);
});

test("evaluateGoldenWordReviewSet ignores spacing after reading labels in breakdown checks", () => {
    const report = evaluateGoldenWordReviewSet({
        rows: [
            {
                word: "休み",
                reading: "やすみ",
                meaning: "holiday / day off",
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

