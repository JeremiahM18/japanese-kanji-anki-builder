const { invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption, collectUnknownArg, assertNoUnknownArgs } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const { parseWordIdentity } = require("./platinumWordBatchReport");
const {
    PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES,
    buildPlatinumWordContentBatchReport,
    formatPlatinumWordContentBatchReport,
    normalizeQueueMode,
} = require("../src/services/platinumWordContentBatchReportService");
const {
    loadPlatinumEntries,
    loadSapphireEntries,
} = require("./reviewPlatinumWordContentLevel");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseWordIdentities(arg, name) {
    return parseCsvOption(arg, name)
        .map(parseWordIdentity)
        .filter((entry) => entry.word);
}

function parseArgs(argv) {
    const options = {
        json: false,
        level: null,
        limit: 8,
        queue: PLATINUM_WORD_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
        unknownArgs: [],
        words: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--queue=")) {
            options.queue = normalizeQueueMode(parseStringOption(arg, "queue"));
        } else if (arg.startsWith("--words=")) {
            options.words = parseWordIdentities(arg, "words");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:platinum:batch", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Platinum word content batch report level must be 1-5.");
    }

    const config = loadConfig();
    const platinumEntries = loadPlatinumEntries({ level: options.level });
    const sapphireEntries = loadSapphireEntries({ level: options.level });
    const rows = await buildWordRowsForLevel({ level: options.level, config });
    const report = buildPlatinumWordContentBatchReport({
        rows,
        platinumEntries,
        sapphireEntries,
        level: options.level,
        words: options.words,
        limit: options.limit,
        queue: options.queue,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatPlatinumWordContentBatchReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
