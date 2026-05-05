const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptTextbookConsensusTemplateRows,
    formatJlptTextbookConsensusTemplateTsv,
    parseJlptLevelFilter,
    resolvePositiveLimit,
} = require("../src/services/jlptTextbookConsensusTemplateService");
const {
    formatTemplateReport,
    parseArgs,
} = require("../scripts/createJlptTextbookConsensusTemplate");

test("textbook consensus template rows stay deterministic and blank until reviewed", () => {
    const rows = buildJlptTextbookConsensusTemplateRows({
        contract: {
            kanjiLevels: {
                鬱: 1,
                日: 5,
                語: 4,
                橋: 2,
            },
        },
    });

    assert.deepEqual(rows.map((row) => `${row.kanji}:${row.currentContractLevel}`), [
        "日:N5",
        "語:N4",
        "橋:N2",
        "鬱:N1",
    ]);
    assert.equal(rows.every((row) => row.reviewStatus === "needs_review"), true);
    assert.equal(rows.every((row) => row.consensusLevel === ""), true);
    assert.equal(rows.every((row) => row.citation === ""), true);
    assert.equal(rows.every((row) => row.evidenceRef === ""), true);
});

test("textbook consensus template supports level and limit filters", () => {
    const rows = buildJlptTextbookConsensusTemplateRows({
        contract: {
            kanjiLevels: {
                日: 5,
                月: 5,
                語: 4,
            },
        },
        level: "N5",
        limit: 1,
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].currentContractLevel, "N5");
});

test("textbook consensus template TSV exposes only manual review fields", () => {
    const tsv = formatJlptTextbookConsensusTemplateTsv([
        {
            kanji: "日",
            currentContractLevel: "N5",
            consensusLevel: "",
            reviewStatus: "needs_review",
            citation: "",
            evidenceRef: "",
            notes: "",
        },
    ]);

    assert.equal(tsv, [
        "kanji\tcurrentContractLevel\tconsensusLevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\t\tneeds_review\t\t\t",
        "",
    ].join("\n"));
});

test("textbook consensus template rejects invalid CLI filters", () => {
    assert.equal(parseJlptLevelFilter("n4"), 4);
    assert.equal(resolvePositiveLimit(3), 3);
    assert.throws(() => parseJlptLevelFilter("N6"), /Invalid JLPT level/);
    assert.throws(() => resolvePositiveLimit(0), /Invalid positive limit/);
});

test("createJlptTextbookConsensusTemplate script parses args and reports no deck mutation", () => {
    const options = parseArgs([
        "--contract=templates/custom-contract.json",
        "--out=downloads/custom-textbook.tsv",
        "--level=5",
        "--limit=12",
        "--json",
    ]);

    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.out, "downloads/custom-textbook.tsv");
    assert.equal(options.level, "5");
    assert.equal(options.limit, 12);
    assert.equal(options.json, true);

    const text = formatTemplateReport({
        outPath: "downloads/custom-textbook.tsv",
        contractPath: "templates/custom-contract.json",
        level: "5",
        rows: [{ kanji: "日" }, { kanji: "月" }],
    });

    assert.match(text, /manual-review worksheet only/);
    assert.match(text, /does not import evidence, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /permitted, manually reviewed level judgments/);
});
