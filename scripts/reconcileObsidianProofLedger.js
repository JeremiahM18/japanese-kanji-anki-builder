const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    buildObsidianProofReconciliationReport,
    formatObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");

function parseDeckKinds(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "all") {
        return ["kanji", "word"];
    }
    const deckKinds = normalized.split(",").map((entry) => entry.trim()).filter(Boolean);
    const invalid = deckKinds.filter((entry) => !["kanji", "word"].includes(entry));
    if (invalid.length > 0 || deckKinds.length === 0) {
        throw new Error(`Invalid deck kind list: ${value}. Use kanji, word, or all.`);
    }
    return [...new Set(deckKinds)];
}

function parseArgs(argv) {
    const options = {
        json: false,
        allowIncomplete: false,
        ledgerDir: undefined,
        levels: [3],
        deckKinds: ["kanji"],
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--allow-incomplete") {
            options.allowIncomplete = true;
        } else if (arg.startsWith("--ledger-dir=")) {
            options.ledgerDir = parseStringOption(arg, "ledger-dir").trim();
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKinds = parseDeckKinds(parseStringOption(arg, "deck-kind"));
        } else if (arg.startsWith("--deck-kinds=")) {
            options.deckKinds = parseDeckKinds(parseStringOption(arg, "deck-kinds"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:obsidian:proof:reconcile", options.unknownArgs);

    const report = buildObsidianProofReconciliationReport({
        ledgerDir: options.ledgerDir,
        levels: options.levels,
        deckKinds: options.deckKinds,
        allowIncomplete: options.allowIncomplete,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianProofReconciliationReport(report));
    }

    if (!report.passed && !options.allowIncomplete) {
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
    parseDeckKinds,
};
