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
const {
    readFileState,
    runGovernedFileTransactionSync,
} = require("../utils/governedFileTransaction");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseCsvOption,
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

function resolveWordSourceImportLockPath() {
    return path.resolve(process.cwd(), "out", "file-transactions", "jlpt-word-source-import.lock");
}

function captureGovernedEvidenceDataBeforeStates({
    evidencePath,
    evidenceManifest,
    sourceIds,
    evidenceMode,
} = {}) {
    const beforeStates = new Map();
    for (const sourceId of sourceIds) {
        const relativeDataFile = evidenceMode === "support"
            ? (evidenceManifest.supportFiles?.[sourceId] || buildDefaultSupportFile(sourceId))
            : (evidenceManifest.assignmentFiles?.[sourceId] || buildDefaultAssignmentFile(sourceId));
        const dataPath = resolveGovernedEvidenceDataPath({
            evidencePath,
            relativeDataFile,
            evidenceMode,
            sourceId,
        });
        beforeStates.set(sourceId, {
            dataPath,
            relativeDataFile,
            state: readFileState(dataPath),
        });
    }
    return beforeStates;
}

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        sources: [],
        sourceAccessPacket: "",
        sourceAccessPacketDir: "",
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
        } else if (arg.startsWith("--sources=")) {
            options.sources = parseCsvOption(arg, "sources");
        } else if (arg.startsWith("--source-access-packet=")) {
            options.sourceAccessPacket = arg.slice("--source-access-packet=".length);
        } else if (arg.startsWith("--source-access-packet-dir=")) {
            options.sourceAccessPacketDir = arg.slice("--source-access-packet-dir=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function resolveAtomicSourceIds(options = {}) {
    const batchSources = [...new Set((options.sources || []).map((sourceId) => String(sourceId || "").trim()).filter(Boolean))];
    if (options.source && batchSources.length > 0) {
        throw new Error("Use exactly one of --source=<source-id> or --sources=<source-id,...>.");
    }
    if (batchSources.length > 0) {
        if (batchSources.length !== (options.sources || []).length) {
            throw new Error("Atomic word source import does not allow duplicate source ids.");
        }
        return batchSources;
    }
    if (!options.source) {
        throw new Error("Missing required --source=<source-id> or --sources=<source-id,...>.");
    }
    return [options.source];
}

function resolveAtomicSourceAccessPacketPath(options = {}, sourceId) {
    if (!options.sourceAccessPacketDir) {
        throw new Error("Atomic word source import requires --source-access-packet-dir=<directory>.");
    }
    return path.join(options.sourceAccessPacketDir, `${sourceId}-word-source-access-packet.json`);
}

class WordSourceImportPreflightError extends Error {
    constructor(result) {
        super("Word source import preflight failed while holding the governed import lock.");
        this.name = "WordSourceImportPreflightError";
        this.result = result;
    }
}

function buildAtomicSupportBatchPlan(options = {}, sourceIds = []) {
    if (options.sourceAccessPacket) {
        throw new Error("Atomic word source import uses --source-access-packet-dir, not --source-access-packet.");
    }
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const evidenceBeforeState = readFileState(evidencePath);
    const evidenceManifest = readJlptWordSourceEvidenceManifest(evidencePath);
    const dataBeforeStates = captureGovernedEvidenceDataBeforeStates({
        evidencePath,
        evidenceManifest,
        sourceIds,
        evidenceMode: "support",
    });
    const normalizedEvidence = normalizeJlptWordSourceEvidence(evidenceManifest, { manifestPath: evidencePath });
    const contract = loadJlptWordLevelContract(options.contract || DEFAULT_CONTRACT);
    const inputManifest = loadJlptWordSourceInputs(path.resolve(process.cwd(), options.config || DEFAULT_CONFIG));
    let nextManifest = normalizedEvidence;
    const sourceSummaries = [];
    const materializationCandidateWords = new Set();

    for (const sourceId of sourceIds) {
        const sourceConfig = inputManifest.inputs?.[sourceId];
        if (sourceConfig?.evidenceMode !== "support") {
            return {
                changes: [],
                result: {
                    sourceIds,
                    sourceId: sourceIds.join(","),
                    evidenceMode: "support",
                    write: options.write === true,
                    evidencePath,
                    preflightValid: false,
                    blockers: [`Atomic word source import currently requires support-only sources; ${sourceId} is not support-only.`],
                    summary: {},
                    sourceSummaries,
                },
            };
        }
        const preflight = buildReports({
            config: options.config || DEFAULT_CONFIG,
            evidence: options.evidence || DEFAULT_EVIDENCE,
            source: sourceId,
            evidenceData: nextManifest,
            contractData: contract,
        });
        const [sourceReport] = preflight.reports || [];
        const expectedSupportClaims = [sourceConfig.supportProfile === "jmdict-exact-identity"
            ? "dictionary-identity"
            : "commonness"];
        const accessPacketValidation = validateWordSourceAccessPacketFile({
            packetPath: resolveAtomicSourceAccessPacketPath(options, sourceId),
            expectedSourceId: sourceId,
            expectedEvidenceRole: "support-only",
            expectedSupportClaims,
        });
        if (!preflight.valid || !sourceReport?.valid || !accessPacketValidation.valid) {
            return {
                changes: [],
                result: {
                    sourceIds,
                    sourceId: sourceIds.join(","),
                    evidenceMode: "support",
                    write: options.write === true,
                    evidencePath,
                    preflightValid: false,
                    blockers: [
                        ...(sourceReport?.blockers || (!preflight.valid ? ["word source input preflight failed"] : [])),
                        ...(accessPacketValidation.blockers || []),
                    ].map((blocker) => `${sourceId}: ${blocker}`),
                    summary: {},
                    sourceSummaries,
                },
            };
        }
        const imported = buildJlptWordSupportEvidenceImport({
            evidenceManifest: nextManifest,
            sourceId,
            contract,
            levels: sourceConfig.contractLevels,
            supportRecords: sourceReport.supportRecords,
        });
        nextManifest = imported.manifest;
        sourceSummaries.push(imported.summary);
        for (const identity of imported.summary.materializationCandidateWords || []) {
            materializationCandidateWords.add(identity);
        }
    }

    nextManifest = materializeWordEvidenceEntries({
        evidenceManifest: nextManifest,
        contract,
    });
    const materializedShifts = summarizeMaterializedWordEvidenceShifts({
        previousManifest: normalizedEvidence,
        nextManifest,
        changedWords: [...materializationCandidateWords],
    });
    const summary = {
        importedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.importedSupportRecordCount || 0), 0),
        previousScopedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.previousScopedSupportRecordCount || 0), 0),
        addedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.addedSupportRecordCount || 0), 0),
        changedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.changedSupportRecordCount || 0), 0),
        removedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.removedSupportRecordCount || 0), 0),
        unchangedSupportRecordCount: sourceSummaries.reduce((total, item) => total + (item.unchangedSupportRecordCount || 0), 0),
        materializedShiftCount: materializedShifts.length,
        materializedShifts,
    };

    const changes = [];
    for (const sourceId of sourceIds) {
        const before = dataBeforeStates.get(sourceId);
        const relativeDataFile = before.relativeDataFile;
        nextManifest.supportFiles = {
            ...(nextManifest.supportFiles || {}),
            [sourceId]: relativeDataFile,
        };
        changes.push({
            filePath: before.dataPath,
            data: formatWordSourceSupportFileJson({
                sourceId,
                supportRecords: nextManifest.supportRecords?.[sourceId] || {},
            }),
            expectedBeforeSha256: before.state.sha256,
        });
    }
    changes.push({
        filePath: evidencePath,
        data: formatWordSourceEvidenceJson(buildStorageManifest(nextManifest)),
        expectedBeforeSha256: evidenceBeforeState.sha256,
    });

    return {
        changes,
        result: {
            sourceIds,
            sourceId: sourceIds.join(","),
            evidenceMode: "support",
            write: options.write === true,
            evidencePath,
            preflightValid: true,
            summary,
            sourceSummaries,
        },
        validateAfterWrite: () => {
            const reloadedManifest = readJlptWordSourceEvidenceManifest(evidencePath);
            const reloadedEvidence = normalizeJlptWordSourceEvidence(reloadedManifest, {
                manifestPath: evidencePath,
            });
            for (const sourceId of sourceIds) {
                const expectedRecords = nextManifest.supportRecords?.[sourceId] || {};
                const actualRecords = reloadedEvidence.supportRecords?.[sourceId] || {};
                if (JSON.stringify(actualRecords) !== JSON.stringify(expectedRecords)) {
                    throw new Error(`Post-write word source support reconciliation failed for ${sourceId}.`);
                }
            }
            const rematerialized = materializeWordEvidenceEntries({
                evidenceManifest: reloadedEvidence,
                contract,
            });
            if (JSON.stringify(rematerialized.words || {}) !== JSON.stringify(nextManifest.words || {})) {
                throw new Error("Post-write atomic word source materialization reconciliation failed.");
            }
            const governanceReport = auditJlptWordSourceEvidence({
                contract,
                evidence: reloadedEvidence,
                limit: 1,
                asOfDate: todayIsoDate(),
            });
            if (!governanceReport.governanceValid) {
                throw new Error(
                    "Post-write atomic word source governance validation failed: "
                    + `${JSON.stringify(governanceReport.issueCounts)}`
                );
            }
        },
    };
}

function runAtomicSupportBatch(options = {}, sourceIds = []) {
    if (!options.write) {
        return buildAtomicSupportBatchPlan(options, sourceIds).result;
    }
    try {
        const transaction = runGovernedFileTransactionSync({
            transactionName: "jlpt-word-source-import-atomic-support-batch",
            lockPath: resolveWordSourceImportLockPath(),
            workspaceRoot: process.cwd(),
            prepareChanges: () => {
                const plan = buildAtomicSupportBatchPlan(options, sourceIds);
                if (!plan.result.preflightValid) {
                    throw new WordSourceImportPreflightError(plan.result);
                }
                return {
                    changes: plan.changes,
                    metadata: plan,
                };
            },
            validateAfterWrite: ({ metadata }) => {
                metadata.validateAfterWrite();
            },
        });
        return transaction.metadata.result;
    } catch (error) {
        if (error instanceof WordSourceImportPreflightError) {
            return error.result;
        }
        throw error;
    }
}

function buildSingleSourceImportPlan(options = {}) {
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const contract = loadJlptWordLevelContract(options.contract || DEFAULT_CONTRACT);
    const inputManifest = loadJlptWordSourceInputs(path.resolve(process.cwd(), options.config || DEFAULT_CONFIG));
    const sourceConfig = inputManifest.inputs?.[options.source];
    const supportMode = sourceConfig?.evidenceMode === "support";
    const evidenceBeforeState = readFileState(evidencePath);
    const evidenceManifest = readJlptWordSourceEvidenceManifest(evidencePath);
    const dataBeforeStates = captureGovernedEvidenceDataBeforeStates({
        evidencePath,
        evidenceManifest,
        sourceIds: [options.source],
        evidenceMode: supportMode ? "support" : "placement",
    });
    const normalizedEvidence = normalizeJlptWordSourceEvidence(evidenceManifest, { manifestPath: evidencePath });
    const preflight = buildReports({
        config: options.config || DEFAULT_CONFIG,
        evidence: options.evidence || DEFAULT_EVIDENCE,
        source: options.source,
        evidenceData: normalizedEvidence,
        contractData: contract,
    });
    const [sourceReport] = preflight.reports || [];
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
            changes: [],
            result: {
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
    const before = dataBeforeStates.get(options.source);
    if (before.relativeDataFile !== relativeDataFile) {
        throw new Error(`Word source data path changed after validation for ${options.source}.`);
    }
    const sourceData = supportMode
        ? formatWordSourceSupportFileJson({
            sourceId: options.source,
            supportRecords: manifest.supportRecords?.[options.source] || {},
        })
        : formatWordSourceAssignmentFileJson({
            sourceId: options.source,
            assignments: manifest.assignments?.[options.source] || {},
        });
    const changes = [
        {
            filePath: before.dataPath,
            data: sourceData,
            expectedBeforeSha256: before.state.sha256,
        },
        {
            filePath: evidencePath,
            data: formatWordSourceEvidenceJson(buildStorageManifest(manifest)),
            expectedBeforeSha256: evidenceBeforeState.sha256,
        },
    ];

    return {
        changes,
        result: {
            sourceId: options.source,
            evidenceMode: supportMode ? "support" : "placement",
            write: options.write === true,
            evidencePath,
            preflightValid: true,
            summary,
        },
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
    };
}

function run(options = {}) {
    const sourceIds = resolveAtomicSourceIds(options);
    if ((options.sources || []).length > 0) {
        return runAtomicSupportBatch(options, sourceIds);
    }
    if (!options.write) {
        return buildSingleSourceImportPlan(options).result;
    }
    try {
        const transaction = runGovernedFileTransactionSync({
            transactionName: `jlpt-word-source-import-${options.source}`,
            lockPath: resolveWordSourceImportLockPath(),
            workspaceRoot: process.cwd(),
            prepareChanges: () => {
                const plan = buildSingleSourceImportPlan(options);
                if (!plan.result.preflightValid) {
                    throw new WordSourceImportPreflightError(plan.result);
                }
                return {
                    changes: plan.changes,
                    metadata: plan,
                };
            },
            validateAfterWrite: ({ metadata }) => {
                metadata.validateAfterWrite();
            },
        });
        return transaction.metadata.result;
    } catch (error) {
        if (error instanceof WordSourceImportPreflightError) {
            return error.result;
        }
        throw error;
    }
}

function formatReport(result = {}) {
    const supportMode = result.evidenceMode === "support"
        || (result.summary?.importedSupportRecordCount || 0) > 0;
    const sourceIds = result.sourceIds?.length > 0 ? result.sourceIds : [result.sourceId];
    const lines = [
        "JLPT Word Source Evidence Import",
        "",
        `${sourceIds.length > 1 ? "Sources" : "Source"}: ${sourceIds.join(", ")}`,
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
    if (result.sourceSummaries?.length > 0) {
        lines.push("", "Per-source imported support records:");
        for (const sourceSummary of result.sourceSummaries) {
            lines.push(`- ${sourceSummary.sourceId}: ${sourceSummary.importedSupportRecordCount || 0}`);
        }
    }
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
    resolveAtomicSourceAccessPacketPath,
    resolveAtomicSourceIds,
    run,
    runAtomicSupportBatch,
};
