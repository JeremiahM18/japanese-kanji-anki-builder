const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_CITATION,
    buildTanosJlptKanjiSource,
    extractTanosJlptRows,
    formatTanosJlptRowsAsTsv,
    parseTanosKanjiLine,
} = require("../src/services/tanosJlptKanjiSourceService");
const {
    formatNormalizeReport,
    parseArgs,
} = require("../scripts/normalizeTanosJlptKanjiSource");

test("parseTanosKanjiLine validates the five-field Tanos base format", () => {
    assert.deepEqual(parseTanosKanjiLine("日 , 4 , ニチ ジツ - , ひ -び , day/sun/Japan", {
        sourceLabel: "fixture",
        rowNumber: 1,
    }), {
        kanji: "日",
        japaneseSchoolGrade: "4",
        onyomi: "ニチ ジツ -",
        kunyomi: "ひ -び",
        meanings: "day/sun/Japan",
    });

    assert.throws(
        () => parseTanosKanjiLine("日本 , 4 , ニチ , ひ , day", { sourceLabel: "fixture", rowNumber: 2 }),
        /invalid kanji/
    );
});

test("extractTanosJlptRows normalizes reviewed N5 source evidence without deck mutation", () => {
    const result = extractTanosJlptRows([
        "日 , 4 , ニチ ジツ - , ひ -び , day/sun/Japan",
        "雨 , 8 , ウ , あめ あま- -さめ , rain",
    ].join("\n"), {
        tanosLevel: 5,
        contractKanjiSet: new Set(["日"]),
    });

    assert.equal(result.sourceRowCount, 2);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].kanji, "日");
    assert.equal(result.rows[0].tanosJlptLevel, "N5");
    assert.equal(result.rows[0].reviewStatus, "reviewed");
    assert.equal(result.rows[0].citation, DEFAULT_CITATION);
    assert.match(result.rows[0].notes, /old JLPT 4/);
    assert.deepEqual(result.skipped, [{
        kanji: "雨",
        tanosJlptLevel: "N5",
        reason: "outside the current JLPT kanji contract; excluded from source assignment import",
    }]);
});

test("buildTanosJlptKanjiSource combines only governed N1/N4/N5 source lanes", () => {
    const result = buildTanosJlptKanjiSource({
        levelSources: [
            { tanosLevel: 1, sourceText: "氏 , 4 , シ , うじ -うじ , family name/surname/clan" },
            { tanosLevel: 4, sourceText: "会 , 6 , カイ エ アツ.マ , あ.う あ.わせる , meeting/meet" },
            { tanosLevel: 5, sourceText: "日 , 4 , ニチ ジツ - , ひ -び , day/sun/Japan" },
        ],
        contract: { kanjiLevels: { 氏: 1, 会: 4, 日: 5 } },
    });

    assert.equal(result.rowCount, 3);
    assert.deepEqual(result.levelCounts, {
        N1: 1,
        N4: 1,
        N5: 1,
    });
    assert.equal(result.tsv, formatTanosJlptRowsAsTsv(result.rows));
    assert.match(result.tsv, /^kanji\ttanosJlptLevel\treviewStatus\tcitation\tevidenceRef\tnotes\n氏\tN1\t/m);
});

test("buildTanosJlptKanjiSource rejects cumulative or duplicated Tanos files", () => {
    assert.throws(
        () => buildTanosJlptKanjiSource({
            levelSources: [
                { tanosLevel: 4, sourceText: "日 , 4 , ニチ , ひ , day" },
                { tanosLevel: 5, sourceText: "日 , 4 , ニチ , ひ , day" },
            ],
        }),
        /Conflicting Tanos assignments/
    );
});

test("normalizeTanosJlptKanjiSource script parses args and reports read-only scope", () => {
    const options = parseArgs([
        "--n1=downloads/n1.txt",
        "--n4=downloads/n4.txt",
        "--n5=downloads/n5.txt",
        "--out=downloads/tanos.tsv",
        "--contract=templates/custom-contract.json",
        "--json",
    ]);

    assert.equal(options.inputs[1], "downloads/n1.txt");
    assert.equal(options.inputs[4], "downloads/n4.txt");
    assert.equal(options.inputs[5], "downloads/n5.txt");
    assert.equal(options.out, "downloads/tanos.tsv");
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.json, true);

    const text = formatNormalizeReport({
        inputPaths: {
            1: "downloads/n1.txt",
            4: "downloads/n4.txt",
            5: "downloads/n5.txt",
        },
        outPath: "downloads/tanos.tsv",
        contractPath: "templates/custom-contract.json",
        result: {
            sourceRowCounts: { N1: 1, N4: 1, N5: 1 },
            levelCounts: { N1: 1, N4: 1, N5: 1 },
            rowCount: 3,
            skippedCount: 0,
        },
    });

    assert.match(text, /N2 and N3 Tanos lanes are intentionally not normalized/);
    assert.match(text, /does not update tracked evidence, move kanji, move words, or change readiness/);
});
