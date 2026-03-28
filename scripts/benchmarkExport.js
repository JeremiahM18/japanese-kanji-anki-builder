const fs = require("node:fs");
const { performance } = require("node:perf_hooks");

const { loadConfig } = require("../src/config");
const { loadKradMap, pickMainComponent } = require("../src/datasets/kradfile");
const { buildTsvForJlptLevel } = require("../src/services/exportService");
const { createKanjiApiClient, createEmptyClientMetrics } = require("../src/clients/kanjiApiClient");

function parseArgs(argv) {
    const options = {
        level: 5,
        limit: 25,
        concurrency: null,
        warmup: true,
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = Number(arg.split("=")[1]);
        } else if (arg === "--no-warmup") {
            options.warmup = false;
        }
    }

    return options;
}

function diffMetrics(before, after) {
    const baseline = before || createEmptyClientMetrics();

    return {
        cacheHits: after.cacheHits - baseline.cacheHits,
        cacheMisses: after.cacheMisses - baseline.cacheMisses,
        networkFetches: after.networkFetches - baseline.networkFetches,
        cacheWrites: after.cacheWrites - baseline.cacheWrites,
        payloadValidationFailures: after.payloadValidationFailures - baseline.payloadValidationFailures,
    };
}

async function runExportOnce({ jlptOnlyJson, kradMap, kanjiApiClient, level, limit, concurrency }) {
    const started = performance.now();
    const metricsBefore = kanjiApiClient.getMetrics();

    const tsv = await buildTsvForJlptLevel({
        levelNumber: level,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        limit,
        concurrency,
    });

    const durationMs = performance.now() - started;
    const metricsAfter = kanjiApiClient.getMetrics();
    const rows = tsv.trim().split("\n").length - 1;

    return {
        durationMs,
        rows,
        metrics: diffMetrics(metricsBefore, metricsAfter),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kradMap = loadKradMap(config.kradfilePath);
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    const concurrency = options.concurrency || config.exportConcurrency;

    console.log("Export benchmark configuration");
    console.log(JSON.stringify({
        level: options.level,
        limit: options.limit,
        concurrency,
        cacheDir: config.cacheDir,
        mediaRootDir: config.mediaRootDir,
        warmup: options.warmup,
    }, null, 2));

    if (options.warmup) {
        const warmup = await runExportOnce({
            jlptOnlyJson,
            kradMap,
            kanjiApiClient,
            level: options.level,
            limit: options.limit,
            concurrency,
        });

        console.log("Warmup run");
        console.log(JSON.stringify(warmup, null, 2));
    }

    const measured = await runExportOnce({
        jlptOnlyJson,
        kradMap,
        kanjiApiClient,
        level: options.level,
        limit: options.limit,
        concurrency,
    });

    const rowsPerSecond = measured.durationMs > 0
        ? Number(((measured.rows / measured.durationMs) * 1000).toFixed(2))
        : 0;
    const hitRatio = measured.metrics.cacheHits + measured.metrics.cacheMisses > 0
        ? Number((measured.metrics.cacheHits / (measured.metrics.cacheHits + measured.metrics.cacheMisses)).toFixed(4))
        : 0;

    console.log("Measured run");
    console.log(JSON.stringify({
        ...measured,
        rowsPerSecond,
        cacheHitRatio: hitRatio,
    }, null, 2));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
