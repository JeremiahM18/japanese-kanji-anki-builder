const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildPlatinumWordBatchReport,
    exampleReadingContainsWordReading,
    exampleSentenceContainsWrittenWord,
    formatPlatinumWordBatchReport,
} = require("../src/services/platinumWordBatchReportService");

const kanjiumSource = "kanjium-cc-by-sa-4.0";
const generatedSource = "voicevox-nemo-accent-query";

const wordPitchAccentData = {
    sources: {
        [kanjiumSource]: {
            name: "Kanjium pitch accent database",
        },
        [generatedSource]: {
            name: "VOICEVOX generated pitch",
            notes: "Generated from VOICEVOX accent query.",
        },
    },
    entries: {
        "今日|きょう": {
            pattern: "0 [heiban]",
            sourceId: kanjiumSource,
            sourceWord: "今日",
            sourceReading: "きょう",
            sourceAccent: "0",
        },
        "八|はち": {
            pattern: "2 [odaka]",
            sourceId: generatedSource,
            sourceQuery: "八",
            generatedReading: "はち",
        },
    },
};

const rows = [
    {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:word-reading-今日-きょう.wav]",
        pitchAccent: "<div aria-label=\"Pitch 1: 0\"></div>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div class=\"kanji-level-badge\">JLPT N5 kanji</div>",
        exampleSentence: "今日は図書館へ行きます。 ／ きょうはとしょかんへいきます。 ／ I go to the library today.",
        notes: "",
    },
    {
        word: "八",
        reading: "はち",
        readingBreakdown: "<ruby>八<rt>はち</rt></ruby>",
        audio: "[sound:word-reading-八-はち.wav]",
        pitchAccent: "<div aria-label=\"Pitch 1: 2\"></div><div>Generated pitch (unverified)</div>",
        meaning: "eight",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "八",
        coversReading: "八: はち",
        kanjiBreakdown: "<div>八 （はち） ／ eight</div>",
        exampleSentence: "数字を八から十まで言います。 ／ すうじをはちからじゅうまでいいます。 ／ I say the numbers from eight to ten.",
        notes: "Common number.",
    },
];

test("word batch report selects missing rows and surfaces review risks", () => {
    const report = buildPlatinumWordBatchReport({
        rows,
        entries: [{ word: "今日", status: "platinum", readingIncludes: ["きょう"] }],
        wordPitchAccentData,
        level: 5,
        limit: 12,
    });

    assert.equal(report.summary.generatedRows, 2);
    assert.equal(report.summary.activePlatinum, 1);
    assert.equal(report.summary.remainingPlatinum, 1);
    assert.equal(report.cards.length, 1);
    assert.equal(report.cards[0].identity, "八|はち");
    assert.equal(report.cards[0].hardChecksPassed, true);
    assert.ok(report.cards[0].riskFlags.some((flag) => /generated pitch/.test(flag)));
    assert.ok(report.cards[0].riskFlags.some((flag) => /single-kanji word/.test(flag)));
    assert.match(report.cards[0].suggestedReviewStep, /source-check pitch/);
    assert.match(formatPlatinumWordBatchReport(report), /This report is read-only/);
});

test("word batch sentence evidence allows normal inflected readings", () => {
    assert.equal(exampleSentenceContainsWrittenWord("赤ちゃんが春に生まれます。", "生まれる"), true);
    assert.equal(exampleSentenceContainsWrittenWord("毎朝新聞を読みます。", "読む"), true);
    assert.equal(exampleReadingContainsWordReading("かいだんをあがります", "あがる"), true);
    assert.equal(exampleReadingContainsWordReading("ほんをよみます", "よむ"), true);
    assert.equal(exampleReadingContainsWordReading("へやがあかるくなります", "あかるい"), true);
    assert.equal(exampleReadingContainsWordReading("きょうはとしょかんへいきます", "あした"), false);
});
