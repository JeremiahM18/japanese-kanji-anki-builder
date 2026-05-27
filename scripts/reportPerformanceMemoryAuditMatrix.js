const {
    buildPerformanceMemoryAuditMatrixReport,
    formatPerformanceMemoryAuditMatrixReport,
} = require("../src/services/performanceMemoryAuditMatrixService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        json: false,
        matrixPath: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--matrix=")) {
            options.matrixPath = parseStringOption(arg, "matrix");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("perf:memory:matrix", options.unknownArgs);
    const report = buildPerformanceMemoryAuditMatrixReport({
        matrixPath: options.matrixPath,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatPerformanceMemoryAuditMatrixReport(report));
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
