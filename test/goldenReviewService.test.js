const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReviewReadingText, evaluateGoldenReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");

test("evaluateGoldenReviewSet passes when cards meet expectations", () => {
    const report = evaluateGoldenReviewSet({
        cards: [
            {
                kanji: "日",
                meaningJP: "日本 ／ day",
                onReading: "オン:ニチ",
                kunReading: "くん:ひ",
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
    assert.equal(buildReviewReadingText({ onReading: "オン:ニチ", kunReading: "くん:ひ" }), "オン:ニチ ／ くん:ひ");
    assert.equal(buildReviewReadingText({ reading: "オン:ガク ／ くん:まなぶ" }), "オン:ガク ／ くん:まなぶ");
    assert.equal(buildReviewReadingText({}), "");
});
