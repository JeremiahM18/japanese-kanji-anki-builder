const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs, parseWordTsvForPlatinum } = require("../scripts/reviewPlatinumWordLevel");

test("parseArgs accepts platinum word review options", () => {
    const options = parseArgs(["--level=5", "--json", "--require-all", "--allow-empty"]);

    assert.deepEqual(options, {
        allowEmpty: true,
        json: true,
        level: 5,
        requireAllRows: true,
    });
});

test("parseWordTsvForPlatinum preserves release-critical word card fields", () => {
    const rows = parseWordTsvForPlatinum([
        "Word	Reading	ReadingBreakdown	Audio	PitchAccent	Meaning	JLPTLevel	CoverageRole	FocusKanji	CoversReading	KanjiBreakdown	ExampleSentence	Notes",
        "今日	きょう	<ruby>今日<rt>きょう</rt></ruby>	[sound:word-今日-きょう.wav]	<span>きょう</span>	today	JLPT N5	JLPT core + reading coverage	今、日	今: いま ／ 日: ひ	<div>今</div>	今日は図書館へ行きます。	Common word.",
    ].join("\n"));

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        word: "今日",
        reading: "きょう",
        readingBreakdown: "<ruby>今日<rt>きょう</rt></ruby>",
        audio: "[sound:word-今日-きょう.wav]",
        pitchAccent: "<span>きょう</span>",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div>今</div>",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Common word.",
    });
});
