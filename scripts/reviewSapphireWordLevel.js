const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const {
    parseSapphireWordReviewSet,
} = require("../src/datasets/sapphireWordReviewSet");
const {
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
} = require("../src/services/sapphireWordReviewService");
const {
    buildWordRowsForLevel,
} = require("./reviewPlatinumWordLevel");

function parseArgs(argv) {
    const args = {
        allowEmpty: false,
        json: false,
        level: null,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--allow-legacy-standard") {
            args.requireCurrentReviewStandard = false;
        } else if (arg === "--allow-empty") {
            args.allowEmpty = true;
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--require-all") {
            args.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            args.level = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(args, arg);
        }
    }

    return args;
}

function readSapphireReviewSet(level, { cwd = process.cwd() } = {}) {
    const reviewSetPath = path.join(cwd, "templates", `sapphire_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing Sapphire word review set at ${reviewSetPath}`);
    }

    return parseSapphireWordReviewSet(
        JSON.parse(fs.readFileSync(reviewSetPath, "utf8")),
        `templates/sapphire_n${level}_word_review_set.json`
    );
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:sapphire:n<level>", options.unknownArgs);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Sapphire word review level must be 1-5.");
    }

    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }

    const entries = readSapphireReviewSet(level);
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = loadJlptOnlyJson(config.jlptJsonPath);
    const rows = await buildWordRowsForLevel({ level, config });
    const report = evaluateSapphireWordReviewSet({
        rows,
        entries,
        wordPitchAccentData,
        kanjiLevelData,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatSapphireWordReviewReport(report, {
        title: "Japanese Kanji Builder Sapphire N" + level + " Word Gate",
    }));
    process.exit(report.passed ? 0 : 1);
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
    readSapphireReviewSet,
};
