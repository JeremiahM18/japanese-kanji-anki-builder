const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const { auditJlptKanjiSourceEvidence } = require("../src/services/jlptKanjiSourceEvidenceService");
const { formatEvidenceManifestJson } = require("../src/services/jlptKanjiSourceImportService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { buildReports } = require("./reportJlptKanjiSourceInputs");
const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    run: runSourceInputImport,
} = require("./importJlptKanjiSourceInput");

const MEMORY_FIELDS = Object.freeze([
    "rss",
    "heapTotal",
    "heapUsed",
    "external",
    "arrayBuffers",
]);

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        repeat: 1,
        limit: 25,
        fullRematerialize: false,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--full-rematerialize") {
            options.fullRematerialize = true;
        } else if (arg.startsWith("--config=")) {
            options.config = parseStringOption(arg, "config");
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--repeat=")) {
            options.repeat = parseNumericOption(arg, "repeat");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function normalizeRepeat(value) {
    const repeat = Number(value);
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) {
        throw new Error(`Invalid --repeat value: ${value}. Use an integer from 1 to 20.`);
    }
    return repeat;
}

function countPhysicalLines(text) {
    if (!text) {
        return 0;
    }
    return String(text).split(/\r?\n/).length;
}

function buildFileStats(filePath) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
        return {
            path: resolvedPath,
            exists: false,
            byteSize: 0,
            lineCount: 0,
        };
    }

    const buffer = fs.readFileSync(resolvedPath);
    return {
        path: resolvedPath,
        exists: true,
        byteSize: buffer.length,
        lineCount: countPhysicalLines(buffer.toString("utf8")),
    };
}

function buildAssignmentFileStats(evidencePath, assignmentFiles = {}) {
    const baseDir = path.dirname(path.resolve(process.cwd(), evidencePath));
    const filesBySource = Object.fromEntries(
        Object.entries(assignmentFiles || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([sourceId, relativePath]) => [
                sourceId,
                buildFileStats(path.resolve(baseDir, relativePath)),
            ])
    );
    const files = Object.values(filesBySource);

    return {
        count: files.length,
        byteSize: files.reduce((sum, file) => sum + Number(file.byteSize || 0), 0),
        lineCount: files.reduce((sum, file) => sum + Number(file.lineCount || 0), 0),
        filesBySource,
    };
}

function summarizeEvidenceManifest(evidenceManifest = {}) {
    const assignmentsBySource = Object.fromEntries(
        Object.entries(evidenceManifest.assignments || {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([sourceId, assignments]) => [sourceId, Object.keys(assignments || {}).length])
    );

    return {
        version: evidenceManifest.version,
        sourceCount: Object.keys(evidenceManifest.sources || {}).length,
        assignmentSourceCount: Object.keys(evidenceManifest.assignments || {}).length,
        assignmentCount: Object.values(assignmentsBySource).reduce((sum, count) => sum + count, 0),
        assignmentFileCount: Object.keys(evidenceManifest.assignmentFiles || {}).length,
        kanjiRollupCount: Object.keys(evidenceManifest.kanji || {}).length,
        assignmentsBySource,
    };
}

function summarizeSourceAssignments(evidenceManifest = {}, sourceId) {
    const assignments = evidenceManifest.assignments?.[sourceId] || {};
    const rows = Object.values(assignments);
    const uniqueCitations = new Set(rows.map((row) => row.citation || "").filter(Boolean));
    const uniqueEvidenceRefs = new Set(rows.map((row) => row.evidenceRef || "").filter(Boolean));

    return {
        sourceId,
        assignmentCount: rows.length,
        uniqueCitationCount: uniqueCitations.size,
        uniqueEvidenceRefCount: uniqueEvidenceRefs.size,
        repeatedCitationCount: Math.max(0, rows.length - uniqueCitations.size),
    };
}

function roundMs(value) {
    return Number(Number(value || 0).toFixed(2));
}

function snapshotMemoryUsage() {
    const usage = process.memoryUsage();
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [field, Number(usage[field] || 0)])
    );
}

function diffMemoryUsage(after = {}, before = {}) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [field, Number(after[field] || 0) - Number(before[field] || 0)])
    );
}

function maxMemoryUsage(snapshots = []) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [
            field,
            Math.max(0, ...snapshots.map((snapshot) => Number(snapshot?.[field] || 0))),
        ])
    );
}

function maxMemoryDelta(samples = []) {
    return Object.fromEntries(
        MEMORY_FIELDS.map((field) => [
            field,
            Math.max(0, ...samples.map((sample) => Number(sample?.delta?.[field] || 0))),
        ])
    );
}

function summarizeMemorySamples(samples = []) {
    if (samples.length === 0) {
        return null;
    }

    const first = samples[0].before;
    const last = samples[samples.length - 1].after;
    return {
        unit: "bytes",
        samples: samples.length,
        before: first,
        after: last,
        delta: diffMemoryUsage(last, first),
        max: maxMemoryUsage(samples.flatMap((sample) => [sample.before, sample.after])),
        maxDelta: maxMemoryDelta(samples),
    };
}

function measureOperation(label, repeat, operation) {
    const durations = [];
    const memorySamples = [];
    let lastResult = null;

    for (let index = 0; index < repeat; index += 1) {
        const memoryBefore = snapshotMemoryUsage();
        const startedAt = performance.now();
        lastResult = operation();
        durations.push(performance.now() - startedAt);
        const memoryAfter = snapshotMemoryUsage();
        memorySamples.push({
            before: memoryBefore,
            after: memoryAfter,
            delta: diffMemoryUsage(memoryAfter, memoryBefore),
        });
    }

    const total = durations.reduce((sum, value) => sum + value, 0);
    return {
        label,
        repeat,
        averageMs: roundMs(total / durations.length),
        minMs: roundMs(Math.min(...durations)),
        maxMs: roundMs(Math.max(...durations)),
        memory: summarizeMemorySamples(memorySamples),
        lastResult,
    };
}

function summarizePreflightReport(preflight = {}) {
    const [sourceReport] = preflight.reports || [];
    return {
        valid: preflight.valid === true,
        rowCount: sourceReport?.rowCount || 0,
        resolvedRowCount: sourceReport?.resolvedRowCount || 0,
        reviewedAssignmentCount: sourceReport?.reviewedAssignmentCount || 0,
        pendingRowCount: sourceReport?.pendingRowCount || 0,
        blockedRowCount: sourceReport?.blockedRowCount || 0,
        sourceAccessGapRowCount: sourceReport?.sourceAccessGapRowCount || 0,
        rejectedRowCount: sourceReport?.rejectedRowCount || 0,
        blockerCount: sourceReport?.blockers?.length || 0,
    };
}

function summarizeImportResult(result = {}) {
    return {
        preflightValid: result.preflightValid === true,
        fullRematerialize: result.fullRematerialize === true,
        importedAssignmentCount: result.summary?.importedAssignmentCount || 0,
        previousAssignmentCount: result.summary?.previousAssignmentCount || 0,
        changedAssignmentCount: result.summary?.changedAssignmentCount || 0,
        changedKanjiCount: result.summary?.changedKanji?.length || 0,
    };
}

function summarizeAuditReport(report = {}) {
    return {
        valid: report.valid === true,
        governanceValid: report.governanceValid === true,
        evidenceDepthValid: report.evidenceDepthValid === true,
        checked: report.checked || 0,
        confidenceCounts: report.confidenceCounts || {},
        issueCounts: report.issueCounts || {},
    };
}

function buildJlptKanjiSourceEvidenceCostReport(options = {}) {
    const baselineMemory = snapshotMemoryUsage();
    const repeat = normalizeRepeat(options.repeat || 1);
    const configPath = options.config || DEFAULT_CONFIG;
    const contractPath = options.contract || DEFAULT_CONTRACT;
    const evidencePath = options.evidence || DEFAULT_EVIDENCE;
    const sourceId = options.source;
    if (!sourceId) {
        throw new Error("Missing required --source=<source-id>.");
    }

    const inputManifest = loadJlptKanjiSourceInputs(path.resolve(process.cwd(), configPath));
    const sourceConfig = inputManifest.inputs?.[sourceId];
    if (!sourceConfig) {
        throw new Error(`Unknown JLPT kanji source input: ${sourceId}`);
    }

    const evidenceStats = buildFileStats(evidencePath);
    const configStats = buildFileStats(configPath);
    const contractStats = buildFileStats(contractPath);
    const sourceWorksheetStats = buildFileStats(sourceConfig.sourcePath);
    let evidenceManifest = null;
    const evidenceLoad = measureOperation("evidence manifest load", repeat, () => {
        evidenceManifest = loadJlptKanjiSourceEvidence(evidenceStats.path);
        return summarizeEvidenceManifest(evidenceManifest);
    });
    const evidenceSummary = evidenceLoad.lastResult;
    const selectedSource = summarizeSourceAssignments(evidenceManifest, sourceId);
    const assignmentFileStats = buildAssignmentFileStats(evidenceStats.path, evidenceManifest.assignmentFiles || {});
    const preflight = measureOperation("source input preflight", repeat, () => summarizePreflightReport(buildReports({
        config: configPath,
        contract: contractPath,
        evidence: evidencePath,
        source: sourceId,
    })));
    const importDryRun = measureOperation("source input import dry-run", repeat, () => summarizeImportResult(runSourceInputImport({
        config: configPath,
        contract: contractPath,
        evidence: evidencePath,
        source: sourceId,
        write: false,
        fullRematerialize: options.fullRematerialize === true,
    })));
    const serializedEvidence = measureOperation("full manifest serialization", repeat, () => (
        Buffer.byteLength(formatEvidenceManifestJson(evidenceManifest), "utf8")
    ));
    const sourceAudit = measureOperation("source evidence audit", repeat, () => summarizeAuditReport(auditJlptKanjiSourceEvidence({
        contract: loadJlptLevelContract(contractPath),
        evidence: loadJlptKanjiSourceEvidence(evidenceStats.path),
        limit: options.limit || 25,
    })));
    const finalMemory = snapshotMemoryUsage();

    return {
        sourceId,
        repeat,
        limit: options.limit || 25,
        readOnly: true,
        noDeckMutation: true,
        paths: {
            config: path.resolve(process.cwd(), configPath),
            contract: path.resolve(process.cwd(), contractPath),
            evidence: evidenceStats.path,
            sourceWorksheet: sourceWorksheetStats.path,
        },
        files: {
            evidence: evidenceStats,
            assignmentFiles: assignmentFileStats,
            sourceInputs: configStats,
            contract: contractStats,
            sourceWorksheet: sourceWorksheetStats,
        },
        evidence: evidenceSummary,
        selectedSource,
        memory: {
            unit: "bytes",
            baseline: baselineMemory,
            final: finalMemory,
            delta: diffMemoryUsage(finalMemory, baselineMemory),
        },
        timings: {
            evidenceLoad,
            preflight,
            importDryRun,
            serializedEvidence,
            sourceAudit,
        },
    };
}

function formatDuration(entry = {}) {
    return `${entry.averageMs}ms avg; ${entry.minMs}ms min; ${entry.maxMs}ms max; repeat ${entry.repeat}`;
}

function formatBytesAsMiB(value) {
    return `${(Number(value || 0) / 1048576).toFixed(2)} MiB`;
}

function formatSignedBytesAsMiB(value) {
    const numeric = Number(value || 0);
    const sign = numeric > 0 ? "+" : "";
    return `${sign}${formatBytesAsMiB(numeric)}`;
}

function formatMemorySnapshot(snapshot = {}) {
    return [
        `rss ${formatBytesAsMiB(snapshot.rss)}`,
        `heapUsed ${formatBytesAsMiB(snapshot.heapUsed)}`,
        `heapTotal ${formatBytesAsMiB(snapshot.heapTotal)}`,
    ].join("; ");
}

function formatMemoryDelta(delta = {}) {
    return [
        `rss ${formatSignedBytesAsMiB(delta.rss)}`,
        `heapUsed ${formatSignedBytesAsMiB(delta.heapUsed)}`,
        `heapTotal ${formatSignedBytesAsMiB(delta.heapTotal)}`,
    ].join("; ");
}

function formatMemoryObservation(entry = {}) {
    if (!entry.memory) {
        return "memory unavailable";
    }
    return `after ${formatMemorySnapshot(entry.memory.after)}; delta ${formatMemoryDelta(entry.memory.delta)}; max delta ${formatMemoryDelta(entry.memory.maxDelta)}`;
}

function formatFileStats(label, stats = {}) {
    return `- ${label}: ${stats.byteSize} bytes; ${stats.lineCount} lines; ${stats.exists ? stats.path : "missing"}`;
}

function formatAssignmentFileStats(stats = {}) {
    return `- source assignment files: ${stats.count || 0} files; ${stats.byteSize || 0} bytes; ${stats.lineCount || 0} lines`;
}

function formatJlptKanjiSourceEvidenceCostReport(report = {}) {
    const preflight = report.timings?.preflight?.lastResult || {};
    const importResult = report.timings?.importDryRun?.lastResult || {};
    const audit = report.timings?.sourceAudit?.lastResult || {};

    return [
        "JLPT Kanji Source Evidence Cost Report",
        "",
        `Source: ${report.sourceId}`,
        `Repeat: ${report.repeat}`,
        "Mode: read-only",
        "",
        "This command measures source-evidence governance cost only. It does not import assignments, move kanji, move words, update decks, or change readiness.",
        "",
        "Files:",
        formatFileStats("evidence manifest", report.files?.evidence),
        formatAssignmentFileStats(report.files?.assignmentFiles),
        `- source-evidence tracked storage total: ${(report.files?.evidence?.byteSize || 0) + (report.files?.assignmentFiles?.byteSize || 0)} bytes`,
        formatFileStats("source-input manifest", report.files?.sourceInputs),
        formatFileStats("JLPT contract", report.files?.contract),
        formatFileStats("selected source worksheet", report.files?.sourceWorksheet),
        "",
        "Evidence shape:",
        `- sources: ${report.evidence?.sourceCount || 0}`,
        `- assignment sources: ${report.evidence?.assignmentSourceCount || 0}`,
        `- assignment rows: ${report.evidence?.assignmentCount || 0}`,
        `- assignment files: ${report.evidence?.assignmentFileCount || 0}`,
        `- materialized kanji rollups: ${report.evidence?.kanjiRollupCount || 0}`,
        "",
        "Selected source:",
        `- assignments in manifest: ${report.selectedSource?.assignmentCount || 0}`,
        `- unique citations: ${report.selectedSource?.uniqueCitationCount || 0}`,
        `- repeated citation rows: ${report.selectedSource?.repeatedCitationCount || 0}`,
        `- unique evidence refs: ${report.selectedSource?.uniqueEvidenceRefCount || 0}`,
        "",
        "Memory:",
        "- Observed process memory snapshots. Node garbage collection can make small deltas noisy; use repeated runs for trends.",
        `- baseline: ${formatMemorySnapshot(report.memory?.baseline)}`,
        `- final: ${formatMemorySnapshot(report.memory?.final)}`,
        `- delta: ${formatMemoryDelta(report.memory?.delta)}`,
        "",
        "Timing and memory:",
        `- evidence manifest load: ${formatDuration(report.timings?.evidenceLoad)}`,
        `  ${formatMemoryObservation(report.timings?.evidenceLoad)}`,
        `- source input preflight: ${formatDuration(report.timings?.preflight)}`,
        `  ${formatMemoryObservation(report.timings?.preflight)}`,
        `  rows ${preflight.rowCount || 0}; reviewed ${preflight.reviewedAssignmentCount || 0}; resolved ${preflight.resolvedRowCount || 0}; rejected ${preflight.rejectedRowCount || 0}; blockers ${preflight.blockerCount || 0}`,
        `- import dry-run (${importResult.fullRematerialize ? "full" : "incremental"} materialization): ${formatDuration(report.timings?.importDryRun)}`,
        `  ${formatMemoryObservation(report.timings?.importDryRun)}`,
        `  imported ${importResult.importedAssignmentCount || 0}; previous ${importResult.previousAssignmentCount || 0}; changed assignments ${importResult.changedAssignmentCount || 0}; changed kanji ${importResult.changedKanjiCount || 0}`,
        `- full manifest serialization: ${formatDuration(report.timings?.serializedEvidence)}`,
        `  ${formatMemoryObservation(report.timings?.serializedEvidence)}`,
        `  serialized bytes ${report.timings?.serializedEvidence?.lastResult || 0}`,
        `- source evidence audit: ${formatDuration(report.timings?.sourceAudit)}`,
        `  ${formatMemoryObservation(report.timings?.sourceAudit)}`,
        `  governance ${audit.governanceValid ? "passing" : "failing"}; evidence depth ${audit.evidenceDepthValid ? "passing" : "failing"}; checked ${audit.checked || 0}`,
        "",
        "Cost interpretation:",
        "- Use this report before choosing source-evidence performance refactors.",
        "- Keep source review batches small for human quality, then promote reviewed rows at milestones.",
        "- Prefer reducing repeated parse, materialization, serialization, or diff churn before changing governance policy.",
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:benchmark:jlpt:sources", options.unknownArgs);
    const report = buildJlptKanjiSourceEvidenceCostReport(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(`${formatJlptKanjiSourceEvidenceCostReport(report)}\n`);
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildAssignmentFileStats,
    buildFileStats,
    buildJlptKanjiSourceEvidenceCostReport,
    countPhysicalLines,
    formatDuration,
    formatAssignmentFileStats,
    formatFileStats,
    formatJlptKanjiSourceEvidenceCostReport,
    measureOperation,
    snapshotMemoryUsage,
    diffMemoryUsage,
    summarizeMemorySamples,
    formatBytesAsMiB,
    formatMemoryDelta,
    formatMemoryObservation,
    formatMemorySnapshot,
    normalizeRepeat,
    parseArgs,
    summarizeAuditReport,
    summarizeEvidenceManifest,
    summarizeImportResult,
    summarizePreflightReport,
    summarizeSourceAssignments,
};
