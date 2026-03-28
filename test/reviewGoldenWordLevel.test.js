const test = require("node:test");
const assert = require("node:assert/strict");

const { parseWordTsv } = require("../scripts/reviewGoldenWordLevel");

test("parseWordTsv maps word deck TSV rows into reviewable objects", () => {
    const rows = parseWordTsv([
        "Word	Reading	Meaning	JLPTLevel	KanjiBreakdown	ExampleSentence	Notes",
        "今日	きょう	today	JLPT N5	<div>今</div>	今日は図書館へ行きます。	Irregular reading.",
    ].join("\n"));

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        word: "今日",
        reading: "きょう",
        meaning: "today",
        jlptLevel: "JLPT N5",
        kanjiBreakdown: "<div>今</div>",
        exampleSentence: "今日は図書館へ行きます。",
        notes: "Irregular reading.",
    });
});
