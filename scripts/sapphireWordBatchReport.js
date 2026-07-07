const fs = require("node:fs");
const path = require("node:path");
const {
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
    parseStringOption,
    collectUnknownArg,
    assertNoUnknownArgs,
} = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { parseSapphireWordReviewSet } = require("../src/datasets/sapphireWordReviewSet");
const { buildWordRowsForLevel } = require("../src/services/wordGeneratedRowsService");
const {
    WORD_BATCH_QUEUE_MODES,
    buildSapphireWordBatchReport,
    formatSapphireWordBatchReport,
    normalizeQueueMode,
} = require("../src/services/sapphireWordBatchReportService");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseWordIdentity(value) {
    const text = String(value ?? "").trim();
    const separator = text.includes("|") ? "|" : ":";
    const [word = "", reading = ""] = text.split(separator);
    return {
        word: word.trim(),
        reading: reading.trim(),
    };
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
        queue: WORD_BATCH_QUEUE_MODES.MISSING_CURRENT_STANDARD,
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

function readReviewSet(level, { cwd = process.cwd() } = {}) {
    const reviewSetPath = path.join(cwd, "templates", `sapphire_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing Sapphire word review set at ${reviewSetPath}`);
    }

    return parseSapphireWordReviewSet(
        JSON.parse(fs.readFileSync(reviewSetPath, "utf8")),
        `templates/sapphire_n${level}_word_review_set.json`
    );
}

function readGoldenReviewSet(level, { cwd = process.cwd() } = {}) {
    const reviewSetPath = path.join(cwd, "templates", `golden_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing prior Gold word review set at ${reviewSetPath}`);
    }

    return JSON.parse(fs.readFileSync(reviewSetPath, "utf8"));
}

async function main({ commandName = "deck:words:sapphire:batch" } = {}) {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs(commandName, options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Sapphire word batch report level must be 1-5.");
    }

    const config = loadConfig();
    const entries = readReviewSet(options.level);
    const goldenExpectations = readGoldenReviewSet(options.level);
    const rows = await buildWordRowsForLevel({ level: options.level, config });
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const report = buildSapphireWordBatchReport({
        rows,
        entries,
        wordPitchAccentData,
        level: options.level,
        words: options.words,
        limit: options.limit,
        goldenExpectations,
        queue: options.queue,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatSapphireWordBatchReport(report));
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
    readGoldenReviewSet,
    parseWordIdentities,
    parseWordIdentity,
    readReviewSet,
};
