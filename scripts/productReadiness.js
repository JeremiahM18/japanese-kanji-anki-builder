const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require("../src/utils/cliArgs");
const {
    formatProductReadinessReport,
    runProductReadinessGate,
} = require("../src/services/productReadinessService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        trackedOnly: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--tracked-only") {
            options.trackedOnly = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("product:readiness", options.unknownArgs);
    const report = await runProductReadinessGate({
        level: options.level,
        trackedOnly: options.trackedOnly,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatProductReadinessReport(report));
    }

    process.exit(report.passed ? 0 : 1);
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
