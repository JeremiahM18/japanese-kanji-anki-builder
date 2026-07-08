const fs = require("node:fs");
const path = require("node:path");

const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildReports,
} = require("./jlptKanjiSourceInputReportService");
const {
    buildStorageManifest,
    buildJlptKanjiSourceEvidenceImport,
    formatEvidenceManifestJson,
    formatSourceAssignmentFileJson,
    materializeKanjiEvidenceEntries,
    summarizeMaterializedKanjiEvidenceShifts,
} = require("./jlptKanjiSourceImportService");
const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const {
    normalizeJlptKanjiSourceEvidence,
    readJlptKanjiSourceEvidenceManifest,
} = require("../datasets/jlptKanjiSourceEvidence");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../utils/cliArgs");

function formatShiftValue(value) {
    if (value === null || value === undefined) {
        return "none";
    }
    if (typeof value === "number" && !Number.isInteger(value)) {
        return String(Number(value.toFixed(4)));
    }
    return String(value);
}

function formatMaterializedShiftLine(shift = {}) {
    const parts = [];
    if (shift.consensusLevel) {
        parts.push(`consensus ${formatShiftValue(shift.consensusLevel.previous)} -> ${formatShiftValue(shift.consensusLevel.next)}`);
    }
    if (shift.confidence) {
        parts.push(`confidence ${formatShiftValue(shift.confidence.previous)} -> ${formatShiftValue(shift.confidence.next)}`);
    }
    if (shift.agreementScore) {
        parts.push(`agreement ${formatShiftValue(shift.agreementScore.previous)} -> ${formatShiftValue(shift.agreementScore.next)}`);
    }
    return `- ${shift.kanji}: ${parts.join("; ")}`;
}

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        write: false,
        fullRematerialize: false,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--full-rematerialize") {
            options.fullRematerialize = true;
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

function formatImportReport(result = {}) {
    const lines = [
        "JLPT Kanji Source Evidence Import",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.write ? "write" : "dry-run"}`,
        `Evidence: ${result.evidencePath}`,
        `Preflight result: ${result.preflightValid ? "passing" : "blocked"}`,
        `Materialization: ${result.fullRematerialize ? "full" : "incremental"}`,
        `Imported assignments: ${result.summary?.importedAssignmentCount || 0}`,
        `Previous assignments: ${result.summary?.previousAssignmentCount || 0}`,
        `Changed assignments: ${result.summary?.changedAssignmentCount || 0}`,
        `Materialized consensus/confidence shifts: ${result.summary?.materializedShiftCount || 0}`,
        "",
        "This command imports source evidence only. It does not move kanji, move words, update decks, or change readiness.",
    ];
    if (result.summary?.materializedShifts?.length > 0) {
        lines.push("", "Materialized shifts:");
        for (const shift of result.summary.materializedShifts) {
            lines.push(formatMaterializedShiftLine(shift));
        }
    }
    return lines.join("\n");
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }

    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const evidenceManifest = readJlptKanjiSourceEvidenceManifest(evidencePath);
    const normalizedEvidence = normalizeJlptKanjiSourceEvidence(evidenceManifest);
    const contract = loadJlptLevelContract(options.contract || DEFAULT_CONTRACT);
    const preflight = buildReports({
        config: options.config || DEFAULT_CONFIG,
        contract: options.contract || DEFAULT_CONTRACT,
        evidence: options.evidence || DEFAULT_EVIDENCE,
        source: options.source,
        contractData: contract,
        evidenceData: normalizedEvidence,
    });
    const [sourceReport] = preflight.reports || [];
    if (!preflight.valid || !sourceReport?.valid) {
        return {
            sourceId: options.source,
            write: options.write === true,
            evidencePath,
            preflightValid: false,
            fullRematerialize: options.fullRematerialize === true,
            blockers: sourceReport?.blockers || ["source input preflight failed"],
            summary: {
                importedAssignmentCount: 0,
                previousAssignmentCount: 0,
                changedAssignmentCount: 0,
                changedKanji: [],
                materializedShiftCount: 0,
                materializedShifts: [],
            },
        };
    }

    const imported = buildJlptKanjiSourceEvidenceImport({
        evidenceManifest,
        sourceId: options.source,
        assignments: sourceReport.assignments,
    });
    const manifest = materializeKanjiEvidenceEntries({
        evidenceManifest: imported.manifest,
        contract,
        changedKanji: options.fullRematerialize ? null : imported.summary.changedKanji,
    });
    const materializedShifts = summarizeMaterializedKanjiEvidenceShifts({
        previousManifest: evidenceManifest,
        nextManifest: manifest,
        changedKanji: options.fullRematerialize
            ? Object.keys(contract.kanjiLevels || {})
            : imported.summary.changedKanji,
    });
    const summary = {
        ...imported.summary,
        materializedShiftCount: materializedShifts.length,
        materializedShifts,
    };

    if (options.write) {
        const assignmentFile = manifest.assignmentFiles?.[options.source];
        if (assignmentFile) {
            const assignmentPath = path.resolve(path.dirname(evidencePath), assignmentFile);
            fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
            fs.writeFileSync(assignmentPath, formatSourceAssignmentFileJson({
                sourceId: options.source,
                assignments: manifest.assignments?.[options.source] || {},
            }), "utf8");
        }
        fs.writeFileSync(evidencePath, formatEvidenceManifestJson(buildStorageManifest(manifest)), "utf8");
    }

    return {
        sourceId: options.source,
        write: options.write === true,
        evidencePath,
        preflightValid: true,
        fullRematerialize: options.fullRematerialize === true,
        summary,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:import:jlpt:source-input", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatImportReport(result)}\n`);
        if (result.blockers?.length > 0) {
            process.stdout.write("Blockers:\n");
            for (const blocker of result.blockers) {
                process.stdout.write(`- ${blocker}\n`);
            }
        }
    }
    if (!result.preflightValid) {
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatImportReport,
    formatMaterializedShiftLine,
    main,
    parseArgs,
    run,
};
