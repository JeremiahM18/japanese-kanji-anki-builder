const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const {
    formatWordSourceAssignmentFileJson,
    formatWordSourceEvidenceJson,
    normalizeJlptWordSourceEvidence,
    readJlptWordSourceEvidenceManifest,
} = require("../src/datasets/jlptWordSourceEvidence");
const {
    buildJlptWordSourceEvidenceImport,
    buildStorageManifest,
    materializeWordEvidenceEntries,
    summarizeMaterializedWordEvidenceShifts,
} = require("../src/services/jlptWordSourceImportService");
const { buildReports } = require("./reportJlptWordSourceInputs");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_word_source_inputs.json";
const DEFAULT_CONTRACT = "templates/jlpt_word_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        write: false,
        json: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--config=")) {
            options.config = arg.slice("--config=".length);
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = arg.slice("--evidence=".length);
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const evidenceManifest = readJlptWordSourceEvidenceManifest(evidencePath);
    const normalizedEvidence = normalizeJlptWordSourceEvidence(evidenceManifest, { manifestPath: evidencePath });
    const contract = loadJlptWordLevelContract(options.contract || DEFAULT_CONTRACT);
    const preflight = buildReports({
        config: options.config || DEFAULT_CONFIG,
        evidence: options.evidence || DEFAULT_EVIDENCE,
        source: options.source,
        evidenceData: normalizedEvidence,
    });
    const [sourceReport] = preflight.reports || [];
    if (!preflight.valid || !sourceReport?.valid) {
        return {
            sourceId: options.source,
            write: options.write === true,
            evidencePath,
            preflightValid: false,
            blockers: sourceReport?.blockers || ["word source input preflight failed"],
            summary: {
                importedAssignmentCount: 0,
                previousAssignmentCount: 0,
                changedAssignmentCount: 0,
                changedWords: [],
                materializedShiftCount: 0,
                materializedShifts: [],
            },
        };
    }
    const imported = buildJlptWordSourceEvidenceImport({
        evidenceManifest: normalizedEvidence,
        sourceId: options.source,
        assignments: sourceReport.assignments,
    });
    const manifest = materializeWordEvidenceEntries({
        evidenceManifest: imported.manifest,
        contract,
    });
    const materializedShifts = summarizeMaterializedWordEvidenceShifts({
        previousManifest: normalizedEvidence,
        nextManifest: manifest,
        changedWords: imported.summary.changedWords,
    });
    const summary = {
        ...imported.summary,
        materializedShiftCount: materializedShifts.length,
        materializedShifts,
    };
    if (options.write) {
        const assignmentFile = manifest.assignmentFiles?.[options.source]
            || path.join("jlpt_word_source_evidence", "assignments", `${options.source}.json`);
        manifest.assignmentFiles = {
            ...(manifest.assignmentFiles || {}),
            [options.source]: assignmentFile,
        };
        const assignmentPath = path.resolve(path.dirname(evidencePath), assignmentFile);
        fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
        fs.writeFileSync(assignmentPath, formatWordSourceAssignmentFileJson({
            sourceId: options.source,
            assignments: manifest.assignments?.[options.source] || {},
        }), "utf8");
        fs.writeFileSync(evidencePath, formatWordSourceEvidenceJson(buildStorageManifest(manifest)), "utf8");
    }
    return {
        sourceId: options.source,
        write: options.write === true,
        evidencePath,
        preflightValid: true,
        summary,
    };
}

function formatReport(result = {}) {
    const lines = [
        "JLPT Word Source Evidence Import",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.write ? "write" : "dry-run"}`,
        `Evidence: ${result.evidencePath}`,
        `Preflight result: ${result.preflightValid ? "passing" : "blocked"}`,
        `Imported assignments: ${result.summary?.importedAssignmentCount || 0}`,
        `Previous assignments: ${result.summary?.previousAssignmentCount || 0}`,
        `Changed assignments: ${result.summary?.changedAssignmentCount || 0}`,
        `Materialized posture shifts: ${result.summary?.materializedShiftCount || 0}`,
        "",
        "This imports word source-origin evidence only. It does not add words, move words, update decks, certify queues, or touch kanji lanes.",
    ];
    if (result.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of result.blockers) {
            lines.push(`- ${blocker}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:import:jlpt:word-source-input", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatReport(result));
    }
    if (!result.preflightValid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatReport,
    main,
    parseArgs,
    run,
};
