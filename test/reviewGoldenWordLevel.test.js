const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs, parseWordTsv } = require("../scripts/reviewGoldenWordLevel");
const { evaluateGoldenWordReviewSet } = require("../src/services/goldenReviewService");

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

test("golden word review matches duplicate written forms by reading expectation", () => {
    const rows = [
        {
            word: "魚",
            reading: "うお",
            meaning: "fish",
            jlptLevel: "JLPT N4",
            coverageRole: "JLPT core + reading coverage",
            focusKanji: "魚",
            coversReading: "魚: うお",
            kanjiBreakdown: "魚 （うお） ／ fish",
            exampleSentence: "魚市場へ行きました。",
            notes: "",
        },
        {
            word: "魚",
            reading: "さかな",
            meaning: "fish",
            jlptLevel: "JLPT N4",
            coverageRole: "JLPT core + reading coverage",
            focusKanji: "魚",
            coversReading: "魚: さかな",
            kanjiBreakdown: "魚 （さかな） ／ fish",
            exampleSentence: "晩ご飯に魚を食べます。",
            notes: "",
        },
    ];

    const report = evaluateGoldenWordReviewSet({
        rows,
        expectations: [
            {
                word: "魚",
                readingIncludes: ["さかな"],
                meaningIncludes: ["fish"],
                jlptLevelIncludes: ["JLPT N4"],
                coverageRoleIncludes: ["JLPT core + reading coverage"],
                focusIncludes: ["魚"],
                coversReadingIncludes: ["魚: さかな"],
                breakdownIncludes: ["魚 （さかな）", "fish"],
                exampleIncludes: ["晩ご飯に魚を食べます。"],
            },
        ],
    });

    assert.equal(report.passed, true);
    assert.equal(report.passedCount, 1);
});
