"use strict";

const { performance } = require("node:perf_hooks");

const { loadConfig } = require("../src/config");
const {
    buildCompactWordMultiLaneStatus,
    buildWordMultiLaneStatus,
} = require("../src/services/wordMultiLaneStatusService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseExplicitJlptLevels,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parsePositiveInteger(value, label) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${label} must be a positive integer.`);
    }
    return parsed;
}

function parseArgs(argv) {
    const options = {
        levels: [],
        repeat: 1,
        summary: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--summary") {
            options.summary = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = parseExplicitJlptLevels(parseStringOption(arg, "level"), "level");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseExplicitJlptLevels(parseStringOption(arg, "levels"), "levels");
        } else if (arg.startsWith("--repeat=")) {
            options.repeat = parsePositiveInteger(parseStringOption(arg, "repeat"), "repeat");
        } else {
            collectUnknownArg(options, arg);
        }
    }
    if (options.levels.length === 0) {
        throw new Error("Word multi-lane benchmark requires --level=<1-5> or --levels=<levels>.");
    }
    return options;
}

function summarizeDurations(samples = []) {
    const durations = samples.map((sample) => sample.durationMs).sort((left, right) => left - right);
    const midpoint = Math.floor(durations.length / 2);
    const median = durations.length % 2 === 0
        ? (durations[midpoint - 1] + durations[midpoint]) / 2
        : durations[midpoint];
    return {
        minimumMs: durations[0] || 0,
        medianMs: median || 0,
        maximumMs: durations.at(-1) || 0,
        meanMs: durations.length > 0
            ? durations.reduce((sum, value) => sum + value, 0) / durations.length
            : 0,
    };
}

async function runBenchmark({ levels, repeat, config = loadConfig() } = {}) {
    const repeatCount = parsePositiveInteger(repeat, "repeat");
    const samples = [];
    let finalStatus = null;
    for (let run = 1; run <= repeatCount; run += 1) {
        if (typeof global.gc === "function") {
            global.gc();
        }
        const memoryBefore = process.memoryUsage();
        const startedAt = performance.now();
        finalStatus = await buildWordMultiLaneStatus({ levels, config });
        const durationMs = performance.now() - startedAt;
        const memoryAfter = process.memoryUsage();
        samples.push({
            run,
            durationMs,
            memoryBefore,
            memoryAfter,
            rssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
            heapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
        });
    }
    return {
        benchmark: "word-multi-lane-status",
        timingBudget: null,
        timingBudgetPolicy: "diagnostic only; no timing budget or certification authority",
        inputBoundary: "same explicit levels, current runtime, current local data, and current cache state",
        repeat: repeatCount,
        levels,
        statusPassed: Boolean(finalStatus?.passed),
        status: buildCompactWordMultiLaneStatus(finalStatus),
        timing: summarizeDurations(samples),
        samples,
    };
}

function formatBenchmark(report = {}) {
    const lines = [
        "Japanese Kanji Builder Word Multi-Lane Status Benchmark",
        "",
        `Levels: ${(report.levels || []).map((level) => `N${level}`).join(", ")}`,
        `Repeat runs: ${report.repeat || 0}`,
        `Status result: ${report.statusPassed ? "passing" : "failing (lane status preserved)"}`,
        "Timing budget: none; diagnostic evidence only",
        `Minimum: ${(report.timing?.minimumMs || 0).toFixed(1)} ms`,
        `Median: ${(report.timing?.medianMs || 0).toFixed(1)} ms`,
        `Maximum: ${(report.timing?.maximumMs || 0).toFixed(1)} ms`,
        `Mean: ${(report.timing?.meanMs || 0).toFixed(1)} ms`,
        "",
        "The benchmark preserves the multi-lane command's fail-closed result and does not approve cards, share lane results, change a budget, or claim certification stability.",
    ];
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("bench:word-multi-lane-status", options.unknownArgs);
    const report = await runBenchmark(options);
    if (options.summary) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatBenchmark(report));
    }
    if (!report.statusPassed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatBenchmark,
    main,
    parseArgs,
    runBenchmark,
    summarizeDurations,
};
