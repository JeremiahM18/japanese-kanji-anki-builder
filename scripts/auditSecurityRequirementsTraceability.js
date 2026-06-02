#!/usr/bin/env node

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildSecurityRequirementsTraceabilityReport,
    formatSecurityRequirementsTraceabilityReport,
} = require("../src/services/securityRequirementsTraceabilityService");

function parseArgs(argv) {
    const options = {
        json: false,
        traceabilityPath: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--traceability=")) {
            options.traceabilityPath = parseStringOption(arg, "traceability");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("security:requirements", options.unknownArgs);
    const report = buildSecurityRequirementsTraceabilityReport({
        traceabilityPath: options.traceabilityPath,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatSecurityRequirementsTraceabilityReport(report));
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
    main,
    parseArgs,
};
