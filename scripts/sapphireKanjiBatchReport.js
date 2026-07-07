const { invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption, collectUnknownArg, assertNoUnknownArgs } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildKanjiRowsForLevel } = require("../src/services/kanjiGeneratedRowsService");
const {
    KANJI_BATCH_QUEUE_MODES,
    buildSapphireKanjiBatchReport,
    formatSapphireKanjiBatchReport,
    normalizeQueueMode,
} = require("../src/services/sapphireKanjiBatchReportService");

const fs = require("node:fs");
const path = require("node:path");

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
        limit: 12,
        queue: KANJI_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
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

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("sapphireKanjiBatchReport", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Sapphire kanji batch report level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", `sapphire_n${options.level}_review_set.json`);
    const goldenReviewSetPath = path.join(process.cwd(), "templates", `golden_n${options.level}_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing sapphire kanji review set at ${reviewSetPath}`);
    }
    if (!fs.existsSync(goldenReviewSetPath)) {
        throw new Error(`Missing prior Gold kanji review set at ${goldenReviewSetPath}`);
    }

    const entries = loadJson(reviewSetPath);
    const goldenExpectations = loadJson(goldenReviewSetPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const rows = await buildKanjiRowsForLevel({ level: options.level, config });
    const report = buildSapphireKanjiBatchReport({
        rows,
        entries,
        level: options.level,
        kanji: options.kanji,
        limit: options.limit,
        queue: options.queue,
        curatedStudyData,
        goldenExpectations,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatSapphireKanjiBatchReport(report));
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
