const fs = require("node:fs");
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

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDirBase: null,
        warmup: true,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--no-warmup") {
            options.warmup = false;
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

function cleanOutDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

async function runBuildBenchmarkPass({ config, levels, limit, concurrency, outDir, doctorReport }) {
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

    const configuration = {
        levels,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        concurrency,
        outDirBase,
        warmup: options.warmup,
        doctorDurationMs,
        buildOutDir: config.buildOutDir,
    };

    const result = {
        configuration,
        warmup: null,
        measured: null,
    };

    if (options.warmup) {
        result.warmup = await runBuildBenchmarkPass({
            config,
            levels,
            limit: configuration.limit,
            concurrency,
            outDir: path.join(outDirBase, "warmup"),
            doctorReport,
        });
    }

    result.measured = await runBuildBenchmarkPass({
        config,
        levels,
        limit: configuration.limit,
        concurrency,
        outDir: path.join(outDirBase, "measured"),
        doctorReport,
    });

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    console.log("Build benchmark configuration");
    console.log(JSON.stringify(configuration, null, 2));

    if (result.warmup) {
        console.log(formatRun("Warmup", result.warmup));
    }

    console.log(formatRun("Measured", result.measured));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
    resolveBenchmarkOutDirBase,
    runBuildBenchmarkPass,
};
