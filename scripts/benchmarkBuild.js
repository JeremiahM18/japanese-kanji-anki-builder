const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { removeGeneratedPathSync } = require("../src/utils/fs");

const DEFAULT_BUILD_BUDGET = Object.freeze({
    totalMs: 5000,
    exportMs: 2500,
    mediaSyncMs: 1500,
    packagingMs: 600,
});

const COLD_APKG_BUILD_BUDGET = Object.freeze({
    // Cold APKG includes Python startup, source-backed media SHA-256 verification,
    // deterministic archive writing, and cache fill. The hot-cache gate remains stricter.
    totalMs: 7000,
    exportMs: 2500,
    mediaSyncMs: 1500,
    packagingMs: 2500,
});

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDirBase: null,
        warmup: true,
        coldApkgCache: false,
        json: false,
        budget: null,
        budgetTotalMs: null,
        budgetExportMs: null,
        budgetMediaSyncMs: null,
        budgetPackagingMs: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--no-warmup") {
            options.warmup = false;
        } else if (arg === "--cold-apkg-cache") {
            options.coldApkgCache = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--out-dir=")) {
            options.outDirBase = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--out-dir-base=")) {
            options.outDirBase = parseStringOption(arg, "out-dir-base");
        } else if (arg.startsWith("--budget=")) {
            options.budget = parseStringOption(arg, "budget");
        } else if (arg.startsWith("--budget-total-ms=")) {
            options.budgetTotalMs = parseNumericOption(arg, "budget-total-ms");
        } else if (arg.startsWith("--budget-export-ms=")) {
            options.budgetExportMs = parseNumericOption(arg, "budget-export-ms");
        } else if (arg.startsWith("--budget-media-sync-ms=")) {
            options.budgetMediaSyncMs = parseNumericOption(arg, "budget-media-sync-ms");
        } else if (arg.startsWith("--budget-packaging-ms=")) {
            options.budgetPackagingMs = parseNumericOption(arg, "budget-packaging-ms");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveBenchmarkOutDirBase(config, outDirBase) {
    if (outDirBase) {
        return path.resolve(outDirBase);
    }

    return path.join(path.dirname(path.resolve(config.buildOutDir)), "bench-build");
}

function resolveBudget(options) {
    const customBudget = {
        totalMs: Number.isFinite(options.budgetTotalMs) ? options.budgetTotalMs : null,
        exportMs: Number.isFinite(options.budgetExportMs) ? options.budgetExportMs : null,
        mediaSyncMs: Number.isFinite(options.budgetMediaSyncMs) ? options.budgetMediaSyncMs : null,
        packagingMs: Number.isFinite(options.budgetPackagingMs) ? options.budgetPackagingMs : null,
    };
    const hasCustomBudget = Object.values(customBudget).some((value) => Number.isFinite(value));

    if (!options.budget && !hasCustomBudget) {
        return null;
    }

    if (options.budget && !["default", "cold-apkg"].includes(options.budget)) {
        throw new Error(`Unsupported build benchmark budget '${options.budget}'. Use --budget=default, --budget=cold-apkg, or explicit --budget-*-ms flags.`);
    }

    let baseBudget = { totalMs: null, exportMs: null, mediaSyncMs: null, packagingMs: null };
    if (options.budget === "default") {
        baseBudget = { ...DEFAULT_BUILD_BUDGET };
    } else if (options.budget === "cold-apkg") {
        baseBudget = { ...COLD_APKG_BUILD_BUDGET };
    }

    return {
        totalMs: Number.isFinite(customBudget.totalMs) ? customBudget.totalMs : baseBudget.totalMs,
        exportMs: Number.isFinite(customBudget.exportMs) ? customBudget.exportMs : baseBudget.exportMs,
        mediaSyncMs: Number.isFinite(customBudget.mediaSyncMs) ? customBudget.mediaSyncMs : baseBudget.mediaSyncMs,
        packagingMs: Number.isFinite(customBudget.packagingMs) ? customBudget.packagingMs : baseBudget.packagingMs,
    };
}

function evaluateBudget(run, budget) {
    if (!budget) {
        return null;
    }

    const checks = [
        {
            key: "totalMs",
            label: "total build",
            actual: Number(run?.durationMs ?? NaN),
            limit: budget.totalMs,
        },
        {
            key: "exportMs",
            label: "export phase",
            actual: Number(run?.timingsMs?.export ?? NaN),
            limit: budget.exportMs,
        },
        {
            key: "mediaSyncMs",
            label: "media sync phase",
            actual: Number(run?.timingsMs?.mediaSync ?? NaN),
            limit: budget.mediaSyncMs,
        },
        {
            key: "packagingMs",
            label: "packaging phase",
            actual: Number(run?.timingsMs?.packaging ?? NaN),
            limit: budget.packagingMs,
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

function formatBudgetResult(budgetResult) {
    if (!budgetResult) {
        return "No build benchmark budget configured.";
    }

    const lines = [
        `Build budget: ${budgetResult.passed ? "pass" : "fail"}`,
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

function cleanOutDir(dirPath) {
    removeGeneratedPathSync(dirPath, {
        recursive: true,
        force: true,
        label: "benchmark output directory",
    });
}

function cleanApkgCacheDir() {
    removeGeneratedPathSync(path.join(process.cwd(), "out", ".apkg-cache"), {
        recursive: true,
        force: true,
        label: "APKG benchmark cache directory",
    });
}

async function runBuildBenchmarkPass({ config, levels, limit, concurrency, outDir, doctorReport, coldApkgCache = false }) {
    if (coldApkgCache) {
        cleanApkgCacheDir();
    }
    cleanOutDir(outDir);

    const startedAt = performance.now();
    const summary = await runBuildPipeline({
        config,
        outDir,
        levels,
        limit,
        concurrency,
        skipMediaSync: false,
    });
    const durationMs = performance.now() - startedAt;

    return {
        outDir,
        durationMs: Number(durationMs.toFixed(2)),
        doctorReady: doctorReport.ready,
        exports: summary.exports.map((entry) => ({
            level: entry.level,
            rows: entry.rows,
        })),
        package: {
            mediaAssetCount: summary.package.mediaAssetCount,
            exportCount: summary.package.exportCount,
            ankiPackageSkipped: Boolean(summary.package.ankiPackage?.skipped),
            timingsMs: summary.package.timingsMs || null,
            ankiPackageTimingsMs: summary.package.ankiPackage?.timingsMs || null,
            pythonTimingsMs: summary.package.ankiPackage?.pythonTimingsMs || null,
            pythonRuntime: summary.package.ankiPackage?.pythonRuntime || null,
            integrityChecks: summary.package.ankiPackage?.integrityChecks || null,
        },
        timingsMs: summary.timingsMs,
        coverage: summary.coverage,
    };
}

function formatRun(name, run) {
    return [
        `${name} run`,
        JSON.stringify(run, null, 2),
    ].join("\n");
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));

    assertNoUnknownArgs("benchmarkBuild", options.unknownArgs);

    const doctorStartedAt = performance.now();
    const doctorReport = await buildDoctorReport({ config });
    const doctorDurationMs = Number((performance.now() - doctorStartedAt).toFixed(2));

    if (!doctorReport.ready) {
        throw new Error(`Build benchmark requires a ready workspace.\n${formatDoctorReport(doctorReport)}`);
    }

    const levels = options.levels || [5, 4, 3, 2, 1];
    const concurrency = Number.isFinite(options.concurrency) ? options.concurrency : config.exportConcurrency;
    const outDirBase = resolveBenchmarkOutDirBase(config, options.outDirBase);
    const budget = resolveBudget(options);

    const configuration = {
        levels,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        concurrency,
        outDirBase,
        warmup: options.warmup,
        coldApkgCache: options.coldApkgCache,
        doctorDurationMs,
        buildOutDir: config.buildOutDir,
        budget,
    };

    const result = {
        configuration,
        warmup: null,
        measured: null,
        budget: null,
    };

    if (options.warmup) {
        result.warmup = await runBuildBenchmarkPass({
            config,
            levels,
            limit: configuration.limit,
            concurrency,
            outDir: path.join(outDirBase, "warmup"),
            doctorReport,
            coldApkgCache: options.coldApkgCache,
        });
    }

    result.measured = await runBuildBenchmarkPass({
        config,
        levels,
        limit: configuration.limit,
        concurrency,
        outDir: path.join(outDirBase, "measured"),
        doctorReport,
        coldApkgCache: options.coldApkgCache,
    });
    result.budget = evaluateBudget(result.measured, budget);

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        if (result.budget && !result.budget.passed) {
            process.exitCode = 1;
        }
        return;
    }

    console.log("Build benchmark configuration");
    console.log(JSON.stringify(configuration, null, 2));

    if (result.warmup) {
        console.log(formatRun("Warmup", result.warmup));
    }

    console.log(formatRun("Measured", result.measured));

    if (result.budget) {
        console.log(formatBudgetResult(result.budget));
        if (!result.budget.passed) {
            throw new Error("Build benchmark exceeded the configured budget.");
        }
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    COLD_APKG_BUILD_BUDGET,
    DEFAULT_BUILD_BUDGET,
    evaluateBudget,
    formatBudgetResult,
    cleanApkgCacheDir,
    cleanOutDir,
    main,
    parseArgs,
    resolveBenchmarkOutDirBase,
    resolveBudget,
    runBuildBenchmarkPass,
};
