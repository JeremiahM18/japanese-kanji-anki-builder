const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_CITATION,
    ESTIMATED_SPLIT_CITATION,
    buildTanosJlptKanjiSource,
    extractTanosEstimatedSplitRows,
    extractTanosJlptRows,
    formatTanosJlptRowsAsTsv,
    parseTanosEstimatedKanjiLines,
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

test("extractTanosEstimatedSplitRows normalizes N2/N3 estimate evidence separately", () => {
    const result = extractTanosEstimatedSplitRows([
        "JLPT N3 Kanji List",
        "Kanji  Onyomi Kunyomi English",
        "政 セイ ショウ マ まつりごと politics, government",
        "議   ",
        "deliberation, consultation",
        "民 ミン タ  people, nation, subjects",
    ].join("\n"), {
        tanosLevel: 3,
        contractKanjiSet: new Set(["政", "民"]),
    });

    assert.equal(result.sourceRowCount, 3);
    assert.deepEqual(result.rows.map((row) => row.kanji), ["政", "民"]);
    assert.equal(result.rows[0].tanosJlptLevel, "N3");
    assert.equal(result.rows[0].reviewStatus, "reviewed");
    assert.equal(result.rows[0].citation, ESTIMATED_SPLIT_CITATION);
    assert.equal(result.rows[0].evidenceRef, "tanos_estimated_split:jlpt-kanji-list");
    assert.match(result.rows[0].notes, /post-2010 estimated split/);
    assert.deepEqual(result.skipped, [{
        kanji: "議",
        tanosJlptLevel: "N3",
        reason: "outside the current JLPT kanji contract; excluded from source assignment import",
    }]);
});

test("parseTanosEstimatedKanjiLines rejects duplicate estimated rows", () => {
    assert.throws(
        () => parseTanosEstimatedKanjiLines("政 セイ politics\n政 セイ politics", { sourceLabel: "fixture" }),
        /duplicate kanji row: 政/
    );
});

test("buildTanosJlptKanjiSource keeps estimated N2/N3 out of direct legacy mode", () => {
    assert.throws(
        () => buildTanosJlptKanjiSource({
            levelSources: [{ tanosLevel: 3, sourceText: "政 セイ politics" }],
        }),
        /Only N1, N4, and N5/
    );

    const result = buildTanosJlptKanjiSource({
        sourceMode: "estimated-split",
        levelSources: [
            { tanosLevel: 2, sourceText: "党 トウ party" },
            { tanosLevel: 3, sourceText: "政 セイ politics" },
        ],
        contract: { kanjiLevels: { 党: 2, 政: 3 } },
    });

    assert.equal(result.rowCount, 2);
    assert.deepEqual(result.levelCounts, {
        N2: 1,
        N3: 1,
    });
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
            sourceMode: "legacy-direct",
        },
    });

    assert.match(text, /Use --lane=estimated-split/);
    assert.match(text, /does not update tracked evidence, move kanji, move words, or change readiness/);
});

test("normalizeTanosJlptKanjiSource script supports the estimated split lane", () => {
    const options = parseArgs([
        "--lane=estimated-split",
        "--n2=downloads/n2.txt",
        "--n3=downloads/n3.txt",
        "--json",
    ]);

    assert.equal(options.lane, "estimated-split");
    assert.equal(options.inputs[2], "downloads/n2.txt");
    assert.equal(options.inputs[3], "downloads/n3.txt");
    assert.equal(options.json, true);

    const text = formatNormalizeReport({
        inputPaths: {
            2: "downloads/n2.txt",
            3: "downloads/n3.txt",
        },
        outPath: "downloads/tanos-estimated.tsv",
        contractPath: "templates/custom-contract.json",
        result: {
            sourceRowCounts: { N2: 1, N3: 1 },
            levelCounts: { N2: 1, N3: 1 },
            rowCount: 2,
            skippedCount: 0,
            sourceMode: "estimated-split",
        },
    });

    assert.match(text, /Lane: estimated-split/);
    assert.match(text, /lower-weight estimated split evidence/);
});
