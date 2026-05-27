const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    formatObsidianProofSqliteQueryReport,
    queryObsidianProofSqliteMirrorReport,
} = require("../src/services/obsidianProofSqliteMirrorService");

function parseArgs(argv) {
    const options = {
        json: false,
        deckKind: undefined,
        level: undefined,
        batchId: undefined,
        target: undefined,
        limit: 20,
        ledgerDir: undefined,
        outputDir: undefined,
        dbFile: undefined,
        pythonCommand: undefined,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim();
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--batch=")) {
            options.batchId = parseStringOption(arg, "batch").trim();
        } else if (arg.startsWith("--target=")) {
            options.target = parseStringOption(arg, "target").trim();
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
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

function assertPositiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`--${name} must be a positive integer`);
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:obsidian:proof:sqlite:query", options.unknownArgs);
    if (options.level !== undefined) {
        assertPositiveInteger(options.level, "level");
    }
    assertPositiveInteger(options.limit, "limit");

    const report = queryObsidianProofSqliteMirrorReport(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofSqliteQueryReport(report));
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
    assertPositiveInteger,
    main,
    parseArgs,
};
