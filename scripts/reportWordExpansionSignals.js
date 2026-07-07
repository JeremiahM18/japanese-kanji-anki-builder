const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");
const {
    DEFAULT_SIGNAL_SOURCE_CONFIG,
    assertValidLevels,
    buildEnhancementSignalFromCandidateReport,
    buildLevelExpansionSignal,
    buildPlacementSignalFromAnchorAuditReport,
    buildReadingSignalFromCompletionReport,
    buildSourceFileIntegrity,
    buildWordExpansionSignalReport,
    countDecision,
    formatStatusWithCounts,
    formatWordExpansionSignalReport,
    loadExpansionSignalSources,
    resolveKanjiTsvPath,
    resolveWordTsvPath,
    validateExpansionSourceIntegrity,
} = require("../src/services/wordExpansionSignalService");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        signalSources: DEFAULT_SIGNAL_SOURCE_CONFIG,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels")
                .map((entry) => Number(entry))
                .filter((entry) => Number.isInteger(entry));
        } else if (arg.startsWith("--signal-sources=")) {
            options.signalSources = String(arg.slice("--signal-sources=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    options.levels = [...new Set(options.levels)];
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:expansion-signals", options.unknownArgs);
    assertValidLevels(options.levels);

    const report = buildWordExpansionSignalReport({
        levels: options.levels,
        signalSources: options.signalSources,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordExpansionSignalReport(report));
    }

    if (options.strict && report.signals.some((signal) => !signal.fullyExpanded)) {
        throw new Error("One or more selected word deck levels are not fully expanded.");
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_SIGNAL_SOURCE_CONFIG,
    assertValidLevels,
    buildEnhancementSignalFromCandidateReport,
    buildLevelExpansionSignal,
    buildPlacementSignalFromAnchorAuditReport,
    buildReadingSignalFromCompletionReport,
    buildSourceFileIntegrity,
    buildWordExpansionSignalReport,
    countDecision,
    formatStatusWithCounts,
    formatWordExpansionSignalReport,
    loadExpansionSignalSources,
    main,
    parseArgs,
    resolveKanjiTsvPath,
    resolveWordTsvPath,
    validateExpansionSourceIntegrity,
};
