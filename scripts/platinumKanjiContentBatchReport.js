const { invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption, collectUnknownArg, assertNoUnknownArgs } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const {
    PLATINUM_CONTENT_BATCH_QUEUE_MODES,
    buildPlatinumKanjiContentBatchReport,
    formatPlatinumKanjiContentBatchReport,
    normalizeQueueMode,
} = require("../src/services/platinumKanjiContentBatchReportService");
const {
    loadPlatinumEntries,
    loadSapphireEntries,
} = require("./reviewPlatinumKanjiContentLevel");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv) {
    const options = {
        json: false,
        kanji: [],
        level: null,
        limit: 8,
        queue: PLATINUM_CONTENT_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--queue=")) {
            options.queue = normalizeQueueMode(parseStringOption(arg, "queue"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:platinum:batch", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Platinum kanji content batch report level must be 1-5.");
    }

    const config = loadConfig();
    const platinumEntries = loadPlatinumEntries({ level: options.level });
    const sapphireEntries = loadSapphireEntries({ level: options.level });
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const rows = await buildKanjiRowsForLevel({ level: options.level, config });
    const report = buildPlatinumKanjiContentBatchReport({
        rows,
        platinumEntries,
        sapphireEntries,
        level: options.level,
        kanji: options.kanji,
        limit: options.limit,
        queue: options.queue,
        curatedStudyData,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatPlatinumKanjiContentBatchReport(report));
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
