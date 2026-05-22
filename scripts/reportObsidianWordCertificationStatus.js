const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const {
    buildPlatinumWordRereviewStatusReport,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    buildObsidianWordCertificationStatusSummary,
    formatObsidianWordCertificationStatusReport,
} = require("../src/services/obsidianWordCertificationStatusService");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4],
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readReviewSet(level) {
    const reviewSetPath = path.join(process.cwd(), "templates", `platinum_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing platinum word review set at ${reviewSetPath}`);
    }

    return JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:obsidian:certify-status", options.unknownArgs);

    const config = loadConfig();
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = loadJlptOnlyJson(config.jlptJsonPath);
    const levelReports = [];
    for (const level of options.levels) {
        const entries = readReviewSet(level);
        const rows = await buildWordRowsForLevel({ level, config });
        levelReports.push(buildPlatinumWordRereviewStatusReport({
            rows,
            entries,
            level,
            wordPitchAccentData,
            kanjiLevelData,
        }));
    }
    const summary = buildObsidianWordCertificationStatusSummary(levelReports);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianWordCertificationStatusReport(summary));
    }

    if (!summary.passed) {
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
    readReviewSet,
};
