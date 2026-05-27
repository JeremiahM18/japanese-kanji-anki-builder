const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildObsidianProofSqliteMirrorReport,
    formatObsidianProofSqliteMirrorReport,
} = require("../src/services/obsidianProofSqliteMirrorService");

function parseArgs(argv) {
    const options = {
        json: false,
        ledgerDir: undefined,
        outputDir: undefined,
        dbFile: undefined,
        pythonCommand: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else if (arg.startsWith("--out-dir=")) {
            options.outputDir = parseStringOption(arg, "out-dir").trim();
        } else if (arg.startsWith("--db-file=")) {
            options.dbFile = parseStringOption(arg, "db-file").trim();
        } else if (arg.startsWith("--python=")) {
            options.pythonCommand = parseStringOption(arg, "python").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:obsidian:proof:sqlite", options.unknownArgs);

    const report = buildObsidianProofSqliteMirrorReport({
        ledgerDir: options.ledgerDir,
        outputDir: options.outputDir,
        dbFile: options.dbFile,
        pythonCommand: options.pythonCommand,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofSqliteMirrorReport(report));
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
