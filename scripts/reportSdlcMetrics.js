#!/usr/bin/env node
const {
    buildSdlcMetricsReport,
    formatAsOfDate,
    formatSdlcMetricsReport,
} = require("../src/services/sdlcMetricsService");

function parseArgs(argv = []) {
    const parsed = {
        json: false,
        metricsPath: undefined,
        asOfDate: undefined,
        releaseTrust: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            parsed.json = true;
        } else if (arg === "--release-trust") {
            parsed.releaseTrust = true;
        } else if (arg.startsWith("--metrics=")) {
            parsed.metricsPath = arg.slice("--metrics=".length);
        } else if (arg.startsWith("--as-of=")) {
            parsed.asOfDate = formatAsOfDate(arg.slice("--as-of=".length));
        } else {
            parsed.unknownArgs.push(arg);
        }
    }

    return parsed;
}

function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    if (args.unknownArgs.length > 0) {
        throw new Error(`Unsupported SDLC metrics argument(s): ${args.unknownArgs.join(", ")}`);
    }

    const report = buildSdlcMetricsReport({
        metricsPath: args.metricsPath,
        asOfDate: args.asOfDate || formatAsOfDate(new Date()),
        releaseTrust: args.releaseTrust,
    });

    if (args.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        const text = formatSdlcMetricsReport(report);
        if (report.passed) {
            process.stdout.write(text);
        } else {
            process.stderr.write(text);
        }
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message || error);
        process.exitCode = 1;
    }
}

module.exports = {
    parseArgs,
};
