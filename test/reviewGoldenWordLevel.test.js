const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs, parseWordTsv } = require("../scripts/reviewGoldenWordLevel");

test("parseArgs accepts level, json, and require-all review mode", () => {
    const options = parseArgs(["--level=4", "--json", "--require-all"]);

    assert.deepEqual(options, {
        json: true,
        level: 4,
        requireAllRows: true,
    });
});

test("parseWordTsv maps word deck TSV rows into reviewable objects", () => {
    const rows = parseWordTsv([
        "Word	Reading	Meaning	JLPTLevel	CoverageRole	FocusKanji	CoversReading	KanjiBreakdown	ExampleSentence	Notes",
        "今日	きょう	today	JLPT N5	JLPT core + reading coverage	今、日	今: いま ／ 日: ひ	<div>今</div>	今日は図書館へ行きます。	Irregular reading.",
    ].join("\n"));

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        word: "今日",
        reading: "きょう",
        meaning: "today",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "今、日",
        coversReading: "今: いま ／ 日: ひ",
        kanjiBreakdown: "<div>今</div>",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Irregular reading.",
    });
});
