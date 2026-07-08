const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildReports,
    formatJlptWordSourceInputsReport,
    parseArgs: parseReportArgs,
} = require("../src/services/jlptWordSourceInputReportService");
const {
    buildDefaultAssignmentFile,
    formatReport,
    parseArgs: parseImportArgs,
} = require("../src/services/jlptWordSourceInputImportCommandService");

test("word source input report parseArgs keeps audit controls explicit", () => {
    const options = parseReportArgs([
        "--config=custom-inputs.json",
        "--evidence=custom-evidence.json",
        "--source=tanos-n4-vocab",
        "--limit=7",
        "--strict",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options, {
        config: "custom-inputs.json",
        evidence: "custom-evidence.json",
        source: "tanos-n4-vocab",
        json: true,
        strict: true,
        limit: 7,
        unknownArgs: ["--oops"],
    });
});

test("word source input report service surfaces unknown inputs without deck mutation", () => {
    const result = buildReports({
        source: "missing-source",
        inputManifest: {
            policy: { noDeckMutation: true },
            inputs: {},
        },
        evidenceData: {
            sources: {},
        },
    });

    assert.equal(result.valid, false);
    assert.equal(result.reports[0].noDeckMutation, true);
    assert.match(result.reports[0].blockers.join("; "), /unknown word source input/);
    assert.match(formatJlptWordSourceInputsReport(result), /does not add words, move words, update decks/);
});

test("word source input import parseArgs and report keep write mode explicit", () => {
    const options = parseImportArgs([
        "--config=custom-inputs.json",
        "--contract=custom-contract.json",
        "--evidence=custom-evidence.json",
        "--source=tanos-n4-vocab",
        "--write",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options, {
        config: "custom-inputs.json",
        contract: "custom-contract.json",
        evidence: "custom-evidence.json",
        source: "tanos-n4-vocab",
        write: true,
        json: true,
        unknownArgs: ["--oops"],
    });
    assert.equal(
        buildDefaultAssignmentFile("tanos-n4-vocab"),
        "jlpt_word_source_evidence/assignments/tanos-n4-vocab.json"
    );
    assert.match(formatReport({
        sourceId: "tanos-n4-vocab",
        write: false,
        evidencePath: "templates/jlpt_word_source_evidence.json",
        preflightValid: false,
        blockers: ["fixture blocker"],
        summary: {},
    }), /Mode: dry-run/);
});
