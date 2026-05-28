const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    formatObsidianProofLedgerAppendReport,
    runObsidianProofLedgerAppend,
} = require("../src/services/obsidianProofLedgerAppendService");

function parseArgs(argv) {
    const options = {
        write: false,
        json: false,
        eventsPath: undefined,
        ledgerDir: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--events=")) {
            options.eventsPath = parseStringOption(arg, "events").trim();
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:obsidian:proof:append", options.unknownArgs);

    const report = runObsidianProofLedgerAppend(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofLedgerAppendReport(report));
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
