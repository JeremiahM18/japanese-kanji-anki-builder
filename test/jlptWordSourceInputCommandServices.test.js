const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildReports,
    formatJlptWordSourceInputsReport,
    parseArgs: parseReportArgs,
} = require("../src/services/jlptWordSourceInputReportService");
const {
    buildDefaultAssignmentFile,
    formatReport,
    parseArgs: parseImportArgs,
    resolveAtomicSourceAccessPacketPath,
    resolveAtomicSourceIds,
    resolveGovernedEvidenceDataPath,
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
        "--source-access-packet=packet.json",
        "--write",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options, {
        config: "custom-inputs.json",
        contract: "custom-contract.json",
        evidence: "custom-evidence.json",
        source: "tanos-n4-vocab",
        sources: [],
        sourceAccessPacket: "packet.json",
        sourceAccessPacketDir: "",
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

test("word source input import accepts an explicit atomic multi-source scope", () => {
    const options = parseImportArgs([
        "--sources=jmdict,jmdict-priority-commonness,tubelex-ja-frequency",
        "--source-access-packet-dir=downloads/word-source-access-packets",
        "--write",
    ]);

    assert.deepEqual(options.sources, [
        "jmdict",
        "jmdict-priority-commonness",
        "tubelex-ja-frequency",
    ]);
    assert.equal(options.source, null);
    assert.equal(options.sourceAccessPacket, "");
    assert.equal(options.sourceAccessPacketDir, "downloads/word-source-access-packets");
    assert.equal(options.write, true);
    assert.deepEqual(options.unknownArgs, []);
});

test("atomic word source import rejects ambiguous or duplicate scopes", () => {
    assert.throws(() => resolveAtomicSourceIds({
        source: "jmdict",
        sources: ["tubelex-ja-frequency"],
    }), /exactly one/);
    assert.throws(() => resolveAtomicSourceIds({
        sources: ["jmdict", "jmdict"],
    }), /duplicate source ids/);
    assert.throws(() => resolveAtomicSourceAccessPacketPath({}, "jmdict"), /source-access-packet-dir/);
    assert.equal(
        resolveAtomicSourceAccessPacketPath({ sourceAccessPacketDir: "downloads/word-source-access-packets" }, "jmdict"),
        path.join("downloads", "word-source-access-packets", "jmdict-word-source-access-packet.json")
    );
});

test("word source input imports use the governed multi-file transaction", () => {
    const servicePath = require.resolve("../src/services/jlptWordSourceInputImportCommandService");
    const source = fs.readFileSync(servicePath, "utf8");

    assert.match(source, /runGovernedFileTransactionSync/);
    assert.doesNotMatch(source, /fs\.writeFileSync\(assignmentPath/);
    assert.doesNotMatch(source, /fs\.writeFileSync\(evidencePath/);
});

test("word source input import preflight uses the exact selected contract", () => {
    const servicePath = require.resolve("../src/services/jlptWordSourceInputImportCommandService");
    const source = fs.readFileSync(servicePath, "utf8");

    assert.match(
        source,
        /const contract = loadJlptWordLevelContract[\s\S]+?buildReports\(\{[\s\S]+?contractData: contract,/u
    );
});

test("word source input imports confine canonical data files to their governed evidence directory", () => {
    const evidencePath = path.join(process.cwd(), "templates", "jlpt_word_source_evidence.json");
    const governed = resolveGovernedEvidenceDataPath({
        evidencePath,
        relativeDataFile: "jlpt_word_source_evidence/support/dictionary.json",
        evidenceMode: "support",
        sourceId: "dictionary",
    });

    assert.equal(
        governed,
        path.join(process.cwd(), "templates", "jlpt_word_source_evidence", "support", "dictionary.json")
    );
    assert.throws(() => resolveGovernedEvidenceDataPath({
        evidencePath,
        relativeDataFile: "../package.json",
        evidenceMode: "support",
        sourceId: "dictionary",
    }), /canonical relative path|noncanonical path segment|direct child/i);
    assert.throws(() => resolveGovernedEvidenceDataPath({
        evidencePath,
        relativeDataFile: "C:\\outside\\dictionary.json",
        evidenceMode: "support",
        sourceId: "dictionary",
    }), /canonical relative path|noncanonical path segment|direct child/i);

    for (const relativeDataFile of [
        "jlpt_word_source_evidence/support/nested/dictionary.json",
        "jlpt_word_source_evidence/support/other-source.json",
        "jlpt_word_source_evidence/support/dictionary.JSON",
        "C:outside\\dictionary.json",
        "\\\\server\\share\\dictionary.json",
        "\\\\?\\C:\\outside\\dictionary.json",
        "jlpt_word_source_evidence/support/dictionary.json:ads",
    ]) {
        assert.throws(() => resolveGovernedEvidenceDataPath({
            evidencePath,
            relativeDataFile,
            evidenceMode: "support",
            sourceId: "dictionary",
        }), /canonical relative path|noncanonical path segment|canonical data path|direct child|lowercase \.json extension/i, relativeDataFile);
    }
});
