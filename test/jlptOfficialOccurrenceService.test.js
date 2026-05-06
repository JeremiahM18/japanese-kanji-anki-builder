const assert = require("node:assert/strict");
const test = require("node:test");

const {
    normalizeJlptOfficialOccurrenceEvidence,
} = require("../src/datasets/jlptOfficialOccurrenceEvidence");
const {
    buildOccurrenceManifest,
    buildOfficialOccurrenceExtraction,
    buildOfficialOccurrenceReport,
    extractObservedKanjiFromText,
    formatOfficialOccurrenceTsv,
} = require("../src/services/jlptOfficialOccurrenceService");
const {
    formatJlptOfficialOccurrenceReport,
    parseArgs,
} = require("../scripts/reportJlptOfficialOccurrences");

test("extractObservedKanjiFromText returns unique observed kanji without copying source text", () => {
    assert.deepEqual(extractObservedKanjiFromText("日本で学校へ行きます。日本"), ["学", "校", "行", "日", "本"]);
});

test("official occurrence extraction stores only governed occurrence fields", () => {
    const extraction = buildOfficialOccurrenceExtraction({
        sourceRows: [{
            level: "N5",
            sourcePdf: "https://www.jlpt.jp/samples/sample2018/pdf/N5V.pdf",
            section: "Language Knowledge (Vocabulary)",
            page: "3",
            questionRef: "Q1",
            text: "日本で学校へ行きます。",
        }],
    });

    assert.equal(extraction.valid, true);
    assert.equal(extraction.rows.length, 5);
    for (const row of extraction.rows) {
        assert.deepEqual(Object.keys(row), [
            "level",
            "sourcePdf",
            "section",
            "page",
            "questionRef",
            "observedKanji",
        ]);
        assert.equal(Object.hasOwn(row, "text"), false);
    }
});

test("official occurrence extraction rejects question or answer fields", () => {
    const extraction = buildOfficialOccurrenceExtraction({
        sourceRows: [{
            level: "N4",
            sourcePdf: "https://www.jlpt.jp/samples/sample2018/pdf/N4R.pdf",
            section: "Reading",
            page: "7",
            questionRef: "Q3",
            questionText: "copied prompt must not be stored",
            text: "駅で待ちます。",
        }],
    });

    assert.equal(extraction.valid, false);
    assert.match(extraction.rejectedRows[0].issues[0], /copied question\/answer-like fields/);
    assert.equal(extraction.rows.length, 0);
});

test("official occurrence manifest schema rejects copied text fields", () => {
    assert.throws(
        () => normalizeJlptOfficialOccurrenceEvidence({
            occurrences: [{
                level: "N5",
                sourcePdf: "https://www.jlpt.jp/samples/sample2018/pdf/N5V.pdf",
                section: "Language Knowledge (Vocabulary)",
                page: 3,
                questionRef: "Q1",
                observedKanji: "日",
                text: "copied source text",
            }],
        }),
        /Unrecognized key/
    );
});

test("official occurrence report never creates assignment truth", () => {
    const manifest = buildOccurrenceManifest([{
        level: "N5",
        sourcePdf: "https://www.jlpt.jp/samples/sample2018/pdf/N5V.pdf",
        section: "Language Knowledge (Vocabulary)",
        page: 3,
        questionRef: "Q1",
        observedKanji: "日",
    }]);
    const report = buildOfficialOccurrenceReport({
        rows: manifest.occurrences,
        contract: { kanjiLevels: { 日: 5 } },
    });

    assert.equal(report.noAssignmentTruth, true);
    assert.equal(report.assignmentCount, 0);
    assert.deepEqual(report.storedFields, [
        "level",
        "sourcePdf",
        "section",
        "page",
        "questionRef",
        "observedKanji",
    ]);
});

test("official occurrence TSV output includes only minimal occurrence columns", () => {
    const tsv = formatOfficialOccurrenceTsv([{
        level: "N5",
        sourcePdf: "https://www.jlpt.jp/samples/sample2018/pdf/N5V.pdf",
        section: "Language Knowledge (Vocabulary)",
        page: 3,
        questionRef: "Q1",
        observedKanji: "日",
    }]);

    assert.match(tsv, /^level\tsourcePdf\tsection\tpage\tquestionRef\tobservedKanji\n/);
    assert.equal(tsv.includes("text"), false);
    assert.equal(tsv.includes("answer"), false);
});

test("official occurrence CLI parser and report are explicit about non-mutation", () => {
    const options = parseArgs([
        "--source=downloads/official.tsv",
        "--format=tsv",
        "--out=downloads/occurrences.json",
        "--write",
        "--strict",
    ]);
    assert.equal(options.source, "downloads/official.tsv");
    assert.equal(options.write, true);
    assert.equal(options.strict, true);

    const text = formatJlptOfficialOccurrenceReport({
        valid: true,
        mode: "extract-dry-run",
        contractPath: "templates/jlpt_level_contract.json",
        occurrencesPath: "templates/jlpt_official_kanji_occurrences.json",
        blockers: [],
        report: {
            storedFields: ["level", "sourcePdf", "section", "page", "questionRef", "observedKanji"],
            noAssignmentTruth: true,
            storeQuestionText: false,
            occurrenceRowCount: 1,
            uniqueKanjiCount: 1,
            sourcePdfCount: 1,
            byLevel: {
                N5: { occurrenceRows: 1, uniqueKanji: 1 },
            },
            outsideContractCount: 0,
            outsideContract: [],
        },
    });

    assert.match(text, /does not assign JLPT levels, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /Stored fields: level, sourcePdf, section, page, questionRef, observedKanji/);
});
