const test = require("node:test");
const assert = require("node:assert/strict");

const {
    GOLD_WORD_TODO_SENTINELS,
    buildGoldWordExpectationScaffold,
    formatGoldWordExpectationScaffold,
} = require("../src/services/goldWordExpectationScaffoldService");
const { evaluateGoldenWordReviewSet } = require("../src/services/goldenReviewService");

const rows = [
    {
        word: "今日",
        reading: "きょう",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div>今 （いま） ／ now</div><div>日 （ひ） ／ day / sun</div>",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Common word.",
    },
    {
        word: "八",
        reading: "はち",
        meaning: "eight",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "八",
        coversReading: "八: はち",
        kanjiBreakdown: "<div>八 （はち） ／ eight</div>",
        exampleSentence: "数字を八から十まで言います。",
        notes: "Common number.",
    },
    {
        word: "水",
        reading: "みず",
        meaning: "water",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "水",
        coversReading: "水: みず",
        kanjiBreakdown: "<div>水 （みず） ／ water</div>",
        exampleSentence: "水を飲みます。",
        notes: "Common noun.",
    },
];

const reviewedExpectation = {
    word: "今日",
    readingIncludes: ["きょう"],
    meaningIncludes: ["today"],
    jlptLevelIncludes: ["JLPT N5"],
    coverageRoleIncludes: ["JLPT core + reading coverage"],
    focusIncludes: ["今", "日"],
    coversReadingIncludes: ["今: いま", "日: ひ"],
    breakdownIncludes: ["今 （いま）", "日 （ひ）"],
    exampleIncludes: ["今日は図書館へ行きます。"],
    notesIncludes: ["Common word."],
};

test("Gold word scaffold selects missing generated rows and fills only safe mechanical invariants", () => {
    const report = buildGoldWordExpectationScaffold({
        rows,
        expectations: [reviewedExpectation],
        level: 5,
        limit: 1,
    });
    const draft = report.draftExpectations[0];

    assert.equal(report.draftOnly, true);
    assert.match(report.boundary, /not Sapphire/);
    assert.match(report.boundary, /not Platinum/);
    assert.match(report.boundary, /not Obsidian proof/);
    assert.deepEqual(report.summary, {
        generatedRows: 3,
        existingGoldExpectations: 1,
        missingGoldRows: 2,
        selectedDrafts: 1,
        requestedMissing: 0,
        requestedAlreadyReviewed: 0,
    });
    assert.equal(report.cards[0].identity, "八|はち");
    assert.deepEqual(draft.readingIncludes, ["はち"]);
    assert.deepEqual(draft.jlptLevelIncludes, ["JLPT N5"]);
    assert.deepEqual(draft.coverageRoleIncludes, ["JLPT core + reading coverage"]);
    assert.deepEqual(draft.focusIncludes, ["八"]);
    assert.deepEqual(draft.coversReadingIncludes, ["八: はち"]);
    assert.deepEqual(draft.breakdownIncludes, ["八 （はち）"]);
    assert.deepEqual(draft.meaningIncludes, [GOLD_WORD_TODO_SENTINELS.meaning]);
    assert.deepEqual(draft.exampleIncludes, [GOLD_WORD_TODO_SENTINELS.example]);
    assert.deepEqual(draft.notesIncludes, [GOLD_WORD_TODO_SENTINELS.notes]);
    assert.deepEqual(report.nextMissingWords, ["八|はち", "水|みず"]);
});

test("Gold word scaffold TODO sentinels prevent accidental passing review entries", () => {
    const report = buildGoldWordExpectationScaffold({
        rows,
        expectations: [reviewedExpectation],
        level: 5,
        limit: 1,
    });
    const review = evaluateGoldenWordReviewSet({
        rows,
        expectations: report.draftExpectations,
    });

    assert.equal(review.passed, false);
    assert.match(review.results[0].failures.join("\n"), /TODO_GOLD_MEANING_REVIEW/);
    assert.match(review.results[0].failures.join("\n"), /TODO_GOLD_EXAMPLE_REVIEW/);
    assert.match(review.results[0].failures.join("\n"), /TODO_GOLD_PROVENANCE_REVIEW/);
});

test("Gold word scaffold scopes requested words without redrafting reviewed rows", () => {
    const report = buildGoldWordExpectationScaffold({
        rows,
        expectations: [reviewedExpectation],
        level: 5,
        words: [
            { word: "今日", reading: "きょう" },
            { word: "水", reading: "みず" },
            { word: "不存在", reading: "ふそんざい" },
        ],
    });

    assert.equal(report.scope, "words=今日|きょう,水|みず,不存在|ふそんざい");
    assert.deepEqual(report.draftExpectations.map((draft) => `${draft.word}|${draft.readingIncludes[0]}`), ["水|みず"]);
    assert.deepEqual(report.requestedAlreadyReviewed, ["今日|きょう"]);
    assert.deepEqual(report.requestedMissing, ["不存在|ふそんざい"]);
});

test("Gold word scaffold formatter states draft-only lane boundaries", () => {
    const report = buildGoldWordExpectationScaffold({
        rows,
        expectations: [reviewedExpectation],
        level: 5,
        limit: 1,
    });
    const formatted = formatGoldWordExpectationScaffold(report);

    assert.match(formatted, /Gold N5 Word Expectation Scaffold/);
    assert.match(formatted, /not Sapphire, Platinum, Obsidian proof, or release readiness/);
    assert.match(formatted, /never writes tracked Gold templates/);
    assert.match(formatted, /TODO_GOLD_MEANING_REVIEW/);
});
