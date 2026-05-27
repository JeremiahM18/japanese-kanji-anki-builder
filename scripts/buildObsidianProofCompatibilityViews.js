const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildObsidianProofCompatibilityViewReport,
    formatObsidianProofCompatibilityViewReport,
} = require("../src/services/obsidianProofCompatibilityViewService");

function parseArgs(argv) {
    const options = {
        json: false,
        ledgerDir: undefined,
        outputDir: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else if (arg.startsWith("--out-dir=")) {
            options.outputDir = parseStringOption(arg, "out-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:obsidian:proof:views", options.unknownArgs);

    const report = buildObsidianProofCompatibilityViewReport({
        ledgerDir: options.ledgerDir,
        outputDir: options.outputDir,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofCompatibilityViewReport(report));
    }

    if (!report.passed) {
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
    main,
    parseArgs,
};
