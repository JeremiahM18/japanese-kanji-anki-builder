const path = require("node:path");
const { performance } = require("node:perf_hooks");

const {
    buildObsidianProofCompatibilityViewReport,
} = require("../src/services/obsidianProofCompatibilityViewService");
const {
    buildObsidianProofLedgerReport,
} = require("../src/services/obsidianProofLedgerService");
const {
    buildObsidianProofSqliteMirrorReport,
} = require("../src/services/obsidianProofSqliteMirrorService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    getDefaultGeneratedPathRoots,
    removeGeneratedPathSync,
} = require("../src/utils/fs");

const DEFAULT_OBSIDIAN_PROOF_ETL_BENCHMARK_DIR = path.join(
    "out",
    "obsidian-proof",
    "benchmark"
);
const MEMORY_FIELDS = Object.freeze([
    "rss",
    "heapTotal",
    "heapUsed",
    "external",
    "arrayBuffers",
]);
const DEFAULT_OBSIDIAN_PROOF_ETL_BUDGET = Object.freeze({
    totalMs: 15000,
    validationMs: 1500,
    compatibilityViewMs: 3000,
    sqliteMirrorMs: 10000,
});

function parseArgs(argv) {
    const options = {
        json: false,
        repeat: 1,
        ledgerDir: undefined,
        outputDirBase: undefined,
        pythonCommand: undefined,
        budget: null,
        budgetTotalMs: null,
        budgetValidationMs: null,
        budgetCompatibilityViewMs: null,
        budgetSqliteMirrorMs: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--repeat=")) {
            options.repeat = parseNumericOption(arg, "repeat");
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else if (arg.startsWith("--out-dir=")) {
            options.outputDirBase = parseStringOption(arg, "out-dir").trim();
        } else if (arg.startsWith("--out-dir-base=")) {
            options.outputDirBase = parseStringOption(arg, "out-dir-base").trim();
        } else if (arg.startsWith("--python=")) {
            options.pythonCommand = parseStringOption(arg, "python").trim();
        } else if (arg.startsWith("--budget=")) {
            options.budget = parseStringOption(arg, "budget").trim();
        } else if (arg.startsWith("--budget-total-ms=")) {
            options.budgetTotalMs = parseNumericOption(arg, "budget-total-ms");
        } else if (arg.startsWith("--budget-validation-ms=")) {
            options.budgetValidationMs = parseNumericOption(arg, "budget-validation-ms");
        } else if (arg.startsWith("--budget-compatibility-view-ms=")) {
            options.budgetCompatibilityViewMs = parseNumericOption(arg, "budget-compatibility-view-ms");
        } else if (arg.startsWith("--budget-sqlite-mirror-ms=")) {
            options.budgetSqliteMirrorMs = parseNumericOption(arg, "budget-sqlite-mirror-ms");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function toPosixPath(value) {
    return String(value).replace(/\\/g, "/");
}

function roundMs(value) {
    return Number(Number(value || 0).toFixed(2));
}

function normalizeRepeat(value) {
    const repeat = Number(value);
    if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) {
        throw new Error(`Invalid --repeat value: ${value}. Use an integer from 1 to 20.`);
    }
    return repeat;
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

function resolveBenchmarkOutputRoot({ cwd = process.cwd(), outputDirBase } = {}) {
    return path.resolve(cwd, outputDirBase || DEFAULT_OBSIDIAN_PROOF_ETL_BENCHMARK_DIR);
}

function cleanBenchmarkOutputRoot(outputRoot, cwd = process.cwd()) {
    removeGeneratedPathSync(outputRoot, {
        recursive: true,
        force: true,
        label: "Obsidian proof ETL benchmark output directory",
        allowedRoots: getDefaultGeneratedPathRoots({ cwd }),
    });
}

function resolveBudget(options = {}) {
    const customBudget = {
        totalMs: Number.isFinite(options.budgetTotalMs) ? options.budgetTotalMs : null,
        validationMs: Number.isFinite(options.budgetValidationMs) ? options.budgetValidationMs : null,
        compatibilityViewMs: Number.isFinite(options.budgetCompatibilityViewMs) ? options.budgetCompatibilityViewMs : null,
        sqliteMirrorMs: Number.isFinite(options.budgetSqliteMirrorMs) ? options.budgetSqliteMirrorMs : null,
    };
    const hasCustomBudget = Object.values(customBudget).some((value) => Number.isFinite(value));

    if (!options.budget && !hasCustomBudget) {
        return null;
    }

    if (options.budget && options.budget !== "default") {
        throw new Error(`Unsupported Obsidian proof ETL benchmark budget '${options.budget}'. Use --budget=default or explicit --budget-*-ms flags.`);
    }

    const baseBudget = options.budget === "default"
        ? { ...DEFAULT_OBSIDIAN_PROOF_ETL_BUDGET }
        : {
            totalMs: null,
            validationMs: null,
            compatibilityViewMs: null,
            sqliteMirrorMs: null,
        };

    return {
        totalMs: Number.isFinite(customBudget.totalMs) ? customBudget.totalMs : baseBudget.totalMs,
        validationMs: Number.isFinite(customBudget.validationMs) ? customBudget.validationMs : baseBudget.validationMs,
        compatibilityViewMs: Number.isFinite(customBudget.compatibilityViewMs) ? customBudget.compatibilityViewMs : baseBudget.compatibilityViewMs,
        sqliteMirrorMs: Number.isFinite(customBudget.sqliteMirrorMs) ? customBudget.sqliteMirrorMs : baseBudget.sqliteMirrorMs,
    };
}

function evaluateBudget(report = {}, budget = null) {
    if (!budget) {
        return null;
    }

    const checks = [
        {
            key: "totalMs",
            label: "total Obsidian proof ETL",
            actual: Number(report.timings?.total?.averageMs ?? NaN),
            limit: budget.totalMs,
        },
        {
            key: "validationMs",
            label: "ledger validation",
            actual: Number(report.timings?.validation?.averageMs ?? NaN),
            limit: budget.validationMs,
        },
        {
            key: "compatibilityViewMs",
            label: "compatibility view generation",
            actual: Number(report.timings?.compatibilityView?.averageMs ?? NaN),
            limit: budget.compatibilityViewMs,
        },
        {
            key: "sqliteMirrorMs",
            label: "SQLite mirror generation",
            actual: Number(report.timings?.sqliteMirror?.averageMs ?? NaN),
            limit: budget.sqliteMirrorMs,
        },
    ].filter((entry) => Number.isFinite(entry.limit));

    const failures = checks
        .filter((entry) => Number.isFinite(entry.actual) && entry.actual > entry.limit)
        .map((entry) => ({
            key: entry.key,
            label: entry.label,
            actual: entry.actual,
            limit: entry.limit,
            overByMs: Number((entry.actual - entry.limit).toFixed(2)),
        }));

    return {
        budget,
        passed: failures.length === 0,
        failures,
    };
}

function summarizeLedgerValidation(report = {}, cwd = process.cwd()) {
    return {
        passed: report.passed === true,
        ledgerDir: report.ledgerDir ? toPosixPath(path.relative(cwd, report.ledgerDir)) : null,
        files: Array.isArray(report.files) ? report.files.map((file) => toPosixPath(path.relative(cwd, file))) : [],
        proofEvents: report.counts?.totalEvents || 0,
        levels: report.counts?.levels || {},
        batches: report.counts?.batches || {},
        failures: report.failures || [],
    };
}

function summarizeCompatibilityView(report = {}) {
    const manifest = report.manifest || {};
    return {
        passed: report.passed === true,
        manifestPath: report.manifestPath || null,
        outputDir: manifest.outputDir || null,
        ledgerProofEvents: manifest.ledgerProofEvents || 0,
        manifestSha256: manifest.manifestHash?.sha256 || null,
        reviewSets: (manifest.reviewSets || []).map((reviewSet) => ({
            deckKind: reviewSet.deckKind,
            level: reviewSet.level,
            sourceEntries: reviewSet.sourceEntries,
            ledgerProofsApplied: reviewSet.ledgerProofsApplied,
            inlineProofsOmitted: reviewSet.inlineProofsOmitted,
            entriesWithoutLedgerProof: reviewSet.entriesWithoutLedgerProof,
            outputReviewSetPath: reviewSet.outputReviewSetPath,
            outputSha256: reviewSet.outputHash?.sha256 || null,
        })),
        failures: report.failures || [],
    };
}

function summarizeSqliteMirror(report = {}) {
    return {
        passed: report.passed === true,
        outputDbPath: report.outputDbPath || null,
        payloadPath: report.payloadPath || null,
        proofEvents: report.proofEvents || 0,
        sqliteVersion: report.sqlite?.sqliteVersion || null,
        evidenceChecks: report.sqlite?.evidenceChecks || 0,
        sqliteSha256: report.generatedArtifacts?.sqlite?.sha256 || null,
        payloadSha256: report.generatedArtifacts?.payload?.sha256 || null,
        failures: report.failures || [],
    };
}

function collectStageFailures(stageLabel, result = {}) {
    if (result.passed) {
        return [];
    }
    const failures = Array.isArray(result.failures) && result.failures.length > 0
        ? result.failures
        : [`${stageLabel} did not pass.`];
    return failures.map((failure) => `${stageLabel}: ${failure}`);
}

function buildObsidianProofEtlBenchmarkReport(options = {}) {
    const resolvedCwd = path.resolve(options.cwd || process.cwd());
    const repeat = normalizeRepeat(options.repeat || 1);
    const outputRoot = resolveBenchmarkOutputRoot({
        cwd: resolvedCwd,
        outputDirBase: options.outputDirBase,
    });
    const outputRootRelative = toPosixPath(path.relative(resolvedCwd, outputRoot));
    const compatibilityOutputDir = path.join(outputRootRelative, "compatibility");
    const sqliteOutputDir = path.join(outputRootRelative, "sqlite");
    const budget = resolveBudget(options);

    cleanBenchmarkOutputRoot(outputRoot, resolvedCwd);

    const baselineMemory = snapshotMemoryUsage();
    const totalStartedAt = performance.now();
    const validation = measureOperation("ledger validation", repeat, () => summarizeLedgerValidation(
        buildObsidianProofLedgerReport({
            cwd: resolvedCwd,
            ledgerDir: options.ledgerDir,
        }),
        resolvedCwd
    ));
    const compatibilityView = measureOperation("compatibility view generation", repeat, () => summarizeCompatibilityView(
        buildObsidianProofCompatibilityViewReport({
            cwd: resolvedCwd,
            ledgerDir: options.ledgerDir,
            outputDir: compatibilityOutputDir,
        })
    ));
    const sqliteMirror = measureOperation("SQLite mirror generation", repeat, () => summarizeSqliteMirror(
        buildObsidianProofSqliteMirrorReport({
            cwd: resolvedCwd,
            ledgerDir: options.ledgerDir,
            outputDir: sqliteOutputDir,
            pythonCommand: options.pythonCommand,
        })
    ));
    const totalWallMs = roundMs(performance.now() - totalStartedAt);
    const finalMemory = snapshotMemoryUsage();

    const report = {
        passed: true,
        configuration: {
            repeat,
            ledgerDir: options.ledgerDir || "templates/obsidian_proof_ledger",
            outputDirBase: outputRootRelative,
            compatibilityOutputDir: toPosixPath(compatibilityOutputDir),
            sqliteOutputDir: toPosixPath(sqliteOutputDir),
            budget,
        },
        readOnlyCanonicalInputs: true,
        generatedArtifactsOnly: true,
        memory: {
            unit: "bytes",
            baseline: baselineMemory,
            final: finalMemory,
            delta: diffMemoryUsage(finalMemory, baselineMemory),
        },
        timings: {
            total: {
                label: "total Obsidian proof ETL",
                repeat,
                averageMs: roundMs(
                    validation.averageMs
                    + compatibilityView.averageMs
                    + sqliteMirror.averageMs
                ),
                wallMs: totalWallMs,
            },
            validation,
            compatibilityView,
            sqliteMirror,
        },
        stages: {
            validation: validation.lastResult,
            compatibilityView: compatibilityView.lastResult,
            sqliteMirror: sqliteMirror.lastResult,
        },
        budget: null,
        failures: [],
    };

    report.budget = evaluateBudget(report, budget);
    report.failures = [
        ...collectStageFailures("ledger validation", report.stages.validation),
        ...collectStageFailures("compatibility view generation", report.stages.compatibilityView),
        ...collectStageFailures("SQLite mirror generation", report.stages.sqliteMirror),
        ...((report.budget && !report.budget.passed)
            ? report.budget.failures.map((failure) => `${failure.label}: ${failure.actual}ms exceeded ${failure.limit}ms by ${failure.overByMs}ms`)
            : []),
    ];
    report.passed = report.failures.length === 0;

    return report;
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

function formatOperationTiming(entry = {}) {
    return `${entry.averageMs}ms avg; ${entry.minMs}ms min; ${entry.maxMs}ms max; repeat ${entry.repeat}`;
}

function formatOperationMemory(entry = {}) {
    if (!entry.memory) {
        return "memory unavailable";
    }
    return `after ${formatMemorySnapshot(entry.memory.after)}; delta ${formatMemoryDelta(entry.memory.delta)}; max delta ${formatMemoryDelta(entry.memory.maxDelta)}`;
}

function formatBudgetResult(budgetResult) {
    if (!budgetResult) {
        return "No Obsidian proof ETL benchmark budget configured.";
    }

    const lines = [
        `Obsidian proof ETL benchmark budget: ${budgetResult.passed ? "pass" : "fail"}`,
    ];
    if (budgetResult.failures.length === 0) {
        lines.push("All configured budget thresholds were met.");
        return lines.join("\n");
    }

    for (const failure of budgetResult.failures) {
        lines.push(`- ${failure.label}: ${failure.actual}ms exceeded ${failure.limit}ms by ${failure.overByMs}ms`);
    }
    return lines.join("\n");
}

function formatStageSummary(report = {}) {
    const validation = report.stages?.validation || {};
    const compatibility = report.stages?.compatibilityView || {};
    const sqlite = report.stages?.sqliteMirror || {};
    const reviewSets = compatibility.reviewSets || [];
    return [
        "Stage summaries:",
        `- ledger validation: ${validation.passed ? "passing" : "failing"}; proof events ${validation.proofEvents || 0}; files ${(validation.files || []).length}`,
        `- compatibility views: ${compatibility.passed ? "passing" : "failing"}; ledger proof events ${compatibility.ledgerProofEvents || 0}; review sets ${reviewSets.length}; manifest sha256 ${compatibility.manifestSha256 || "(missing)"}`,
        `- SQLite mirror: ${sqlite.passed ? "passing" : "failing"}; proof events ${sqlite.proofEvents || 0}; evidence checks ${sqlite.evidenceChecks || 0}; SQLite sha256 ${sqlite.sqliteSha256 || "(missing)"}`,
    ].join("\n");
}

function formatObsidianProofEtlBenchmarkReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Obsidian Proof ETL Benchmark",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Repeat: ${report.configuration?.repeat || 1}`,
        `Output root: ${report.configuration?.outputDirBase || "(not configured)"}`,
        `Ledger directory: ${report.configuration?.ledgerDir || "(default)"}`,
        "",
        "Scope:",
        "- Measures tracked JSONL proof ledger validation, generated compatibility views, and generated SQLite mirror creation.",
        "- Canonical inputs are read-only. Outputs are generated artifacts under the benchmark output root.",
        "- This benchmark is not Obsidian certification, Japanese-source evidence, NLP certification, APKG QA, or release readiness.",
        "",
        "Memory:",
        `- baseline: ${formatMemorySnapshot(report.memory?.baseline)}`,
        `- final: ${formatMemorySnapshot(report.memory?.final)}`,
        `- delta: ${formatMemoryDelta(report.memory?.delta)}`,
        "",
        "Timing and memory:",
        `- total ETL average: ${report.timings?.total?.averageMs || 0}ms avg; wall ${report.timings?.total?.wallMs || 0}ms`,
        `- ledger validation: ${formatOperationTiming(report.timings?.validation)}`,
        `  ${formatOperationMemory(report.timings?.validation)}`,
        `- compatibility view generation: ${formatOperationTiming(report.timings?.compatibilityView)}`,
        `  ${formatOperationMemory(report.timings?.compatibilityView)}`,
        `- SQLite mirror generation: ${formatOperationTiming(report.timings?.sqliteMirror)}`,
        `  ${formatOperationMemory(report.timings?.sqliteMirror)}`,
        "",
        formatStageSummary(report),
        "",
        formatBudgetResult(report.budget),
    ];

    if (!report.passed) {
        lines.push("", "Failures:");
        for (const failure of report.failures || []) {
            lines.push(`- ${failure}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("bench:obsidian-proof-etl", options.unknownArgs);
    const report = buildObsidianProofEtlBenchmarkReport(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofEtlBenchmarkReport(report));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_OBSIDIAN_PROOF_ETL_BENCHMARK_DIR,
    DEFAULT_OBSIDIAN_PROOF_ETL_BUDGET,
    buildObsidianProofEtlBenchmarkReport,
    cleanBenchmarkOutputRoot,
    diffMemoryUsage,
    evaluateBudget,
    formatBudgetResult,
    formatObsidianProofEtlBenchmarkReport,
    measureOperation,
    normalizeRepeat,
    parseArgs,
    resolveBenchmarkOutputRoot,
    resolveBudget,
    snapshotMemoryUsage,
    summarizeMemorySamples,
};
