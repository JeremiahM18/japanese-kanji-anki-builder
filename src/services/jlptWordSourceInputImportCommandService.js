const path = require("node:path");

const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadJlptWordSourceInputs } = require("../datasets/jlptWordSourceInputs");
const {
    formatWordSourceAssignmentFileJson,
    formatWordSourceEvidenceJson,
    formatWordSourceSupportFileJson,
    normalizeJlptWordSourceEvidence,
    readJlptWordSourceEvidenceManifest,
    resolveGovernedWordSourceDataPath,
} = require("../datasets/jlptWordSourceEvidence");
const {
    buildJlptWordSourceEvidenceImport,
    buildJlptWordSupportEvidenceImport,
    buildStorageManifest,
    materializeWordEvidenceEntries,
    summarizeMaterializedWordEvidenceShifts,
} = require("./jlptWordSourceImportService");
const {
    validateWordSourceAccessPacketFile,
} = require("./jlptWordSourceAccessPacketService");
const { buildReports } = require("./jlptWordSourceInputReportService");
const { auditJlptWordSourceEvidence } = require("./jlptWordSourceEvidenceService");
const { runGovernedFileTransactionSync } = require("../utils/governedFileTransaction");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_word_source_inputs.json";
const DEFAULT_CONTRACT = "templates/jlpt_word_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function buildDefaultAssignmentFile(sourceId) {
    return ["jlpt_word_source_evidence", "assignments", `${sourceId}.json`].join("/");
}

function buildDefaultSupportFile(sourceId) {
    return ["jlpt_word_source_evidence", "support", `${sourceId}.json`].join("/");
}

function resolveManifestRelativePath(baseDir, relativePath) {
    return path.resolve(baseDir, ...String(relativePath || "").split(/[\\/]/u));
}

function resolveGovernedEvidenceDataPath({ evidencePath, relativeDataFile, evidenceMode, sourceId } = {}) {
    return resolveGovernedWordSourceDataPath({
        manifestPath: evidencePath,
        relativePath: relativeDataFile,
        evidenceMode,
        sourceId,
    });
}

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        sourceAccessPacket: "",
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
        } else if (arg.startsWith("--source-access-packet=")) {
            options.sourceAccessPacket = arg.slice("--source-access-packet=".length);
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
    const inputManifest = loadJlptWordSourceInputs(path.resolve(process.cwd(), options.config || DEFAULT_CONFIG));
    const sourceConfig = inputManifest.inputs?.[options.source];
    const preflight = buildReports({
        config: options.config || DEFAULT_CONFIG,
        evidence: options.evidence || DEFAULT_EVIDENCE,
        source: options.source,
        evidenceData: normalizedEvidence,
        contractData: contract,
    });
    const [sourceReport] = preflight.reports || [];
    const supportMode = sourceConfig?.evidenceMode === "support";
    const expectedSupportClaims = supportMode
        ? [sourceConfig.supportProfile === "jmdict-exact-identity" ? "dictionary-identity" : "commonness"]
        : [];
    const accessPacketValidation = supportMode
        ? validateWordSourceAccessPacketFile({
            packetPath: options.sourceAccessPacket,
            expectedSourceId: options.source,
            expectedEvidenceRole: "support-only",
            expectedSupportClaims,
        })
        : { valid: true, blockers: [] };
    if (!preflight.valid || !sourceReport?.valid || !accessPacketValidation.valid) {
        return {
            sourceId: options.source,
            write: options.write === true,
            evidencePath,
            preflightValid: false,
            blockers: [
                ...(sourceReport?.blockers || (!preflight.valid ? ["word source input preflight failed"] : [])),
                ...(accessPacketValidation.blockers || []),
            ],
            summary: {
                importedAssignmentCount: 0,
                importedSupportRecordCount: 0,
                previousAssignmentCount: 0,
                changedAssignmentCount: 0,
                changedWords: [],
                materializedShiftCount: 0,
                materializedShifts: [],
            },
        };
    }
    const imported = supportMode
        ? buildJlptWordSupportEvidenceImport({
            evidenceManifest: normalizedEvidence,
            sourceId: options.source,
            contract,
            levels: sourceConfig.contractLevels,
            supportRecords: sourceReport.supportRecords,
        })
        : buildJlptWordSourceEvidenceImport({
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
        changedWords: supportMode
            ? imported.summary.materializationCandidateWords
            : imported.summary.changedWords,
    });
    const summary = {
        ...imported.summary,
        materializedShiftCount: materializedShifts.length,
        materializedShifts,
    };
    if (options.write) {
        const relativeDataFile = supportMode
            ? (manifest.supportFiles?.[options.source] || buildDefaultSupportFile(options.source))
            : (manifest.assignmentFiles?.[options.source] || buildDefaultAssignmentFile(options.source));
        if (supportMode) {
            manifest.supportFiles = {
                ...(manifest.supportFiles || {}),
                [options.source]: relativeDataFile,
            };
        } else {
            manifest.assignmentFiles = {
                ...(manifest.assignmentFiles || {}),
                [options.source]: relativeDataFile,
            };
        }
        const dataPath = resolveGovernedEvidenceDataPath({
            evidencePath,
            relativeDataFile,
            evidenceMode: supportMode ? "support" : "placement",
            sourceId: options.source,
        });
        const sourceData = supportMode
            ? formatWordSourceSupportFileJson({
                sourceId: options.source,
                supportRecords: manifest.supportRecords?.[options.source] || {},
            })
            : formatWordSourceAssignmentFileJson({
                sourceId: options.source,
                assignments: manifest.assignments?.[options.source] || {},
            });
        const evidenceData = formatWordSourceEvidenceJson(buildStorageManifest(manifest));
        runGovernedFileTransactionSync({
            transactionName: `jlpt-word-source-import-${options.source}`,
            workspaceRoot: process.cwd(),
            changes: [
                { filePath: dataPath, data: sourceData },
                { filePath: evidencePath, data: evidenceData },
            ],
            validateAfterWrite: () => {
                const reloadedManifest = readJlptWordSourceEvidenceManifest(evidencePath);
                const reloadedEvidence = normalizeJlptWordSourceEvidence(reloadedManifest, {
                    manifestPath: evidencePath,
                });
                const expectedRecords = supportMode
                    ? (manifest.supportRecords?.[options.source] || {})
                    : (manifest.assignments?.[options.source] || {});
                const actualRecords = supportMode
                    ? (reloadedEvidence.supportRecords?.[options.source] || {})
                    : (reloadedEvidence.assignments?.[options.source] || {});
                if (JSON.stringify(actualRecords) !== JSON.stringify(expectedRecords)) {
                    throw new Error(`Post-write word source ${supportMode ? "support" : "assignment"} reconciliation failed for ${options.source}.`);
                }
                const rematerialized = materializeWordEvidenceEntries({
                    evidenceManifest: reloadedEvidence,
                    contract,
                });
                if (JSON.stringify(rematerialized.words || {}) !== JSON.stringify(manifest.words || {})) {
                    throw new Error(`Post-write word source materialization reconciliation failed for ${options.source}.`);
                }
                const governanceReport = auditJlptWordSourceEvidence({
                    contract,
                    evidence: reloadedEvidence,
                    limit: 1,
                    asOfDate: todayIsoDate(),
                });
                if (!governanceReport.governanceValid) {
                    throw new Error(
                        `Post-write word source governance validation failed for ${options.source}: `
                        + `${JSON.stringify(governanceReport.issueCounts)}`
                    );
                }
            },
        });
    }
    return {
        sourceId: options.source,
        evidenceMode: supportMode ? "support" : "placement",
        write: options.write === true,
        evidencePath,
        preflightValid: true,
        summary,
    };
}

function formatReport(result = {}) {
    const supportMode = result.evidenceMode === "support"
        || (result.summary?.importedSupportRecordCount || 0) > 0;
    const lines = [
        "JLPT Word Source Evidence Import",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.write ? "write" : "dry-run"}`,
        `Evidence: ${result.evidencePath}`,
        `Preflight result: ${result.preflightValid ? "passing" : "blocked"}`,
        ...(supportMode ? [
            `Imported typed support records: ${result.summary?.importedSupportRecordCount || 0}`,
            `Previous scoped support records: ${result.summary?.previousScopedSupportRecordCount || 0}`,
            `Added support records: ${result.summary?.addedSupportRecordCount || 0}`,
            `Changed support records: ${result.summary?.changedSupportRecordCount || 0}`,
            `Removed stale support records: ${result.summary?.removedSupportRecordCount || 0}`,
            `Unchanged support records: ${result.summary?.unchangedSupportRecordCount || 0}`,
        ] : [
            `Imported assignments: ${result.summary?.importedAssignmentCount || 0}`,
            `Previous assignments: ${result.summary?.previousAssignmentCount || 0}`,
            `Changed assignments: ${result.summary?.changedAssignmentCount || 0}`,
        ]),
        `Materialized posture shifts: ${result.summary?.materializedShiftCount || 0}`,
        "",
        supportMode
            ? "This imports typed support facts only. It does not grant JLPT placement authority, add words, move words, update decks, certify queues, or touch kanji lanes."
            : "This imports word source-origin evidence only. It does not add words, move words, update decks, certify queues, or touch kanji lanes.",
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

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildDefaultAssignmentFile,
    buildDefaultSupportFile,
    formatReport,
    main,
    parseArgs,
    resolveGovernedEvidenceDataPath,
    resolveManifestRelativePath,
    run,
};
