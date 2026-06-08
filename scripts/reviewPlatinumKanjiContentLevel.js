const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const {
    evaluatePlatinumKanjiContentReviewSet,
    formatPlatinumKanjiContentReviewReport,
} = require("../src/services/platinumKanjiContentReviewService");
const {
    parsePlatinumKanjiContentReviewSet,
} = require("../src/datasets/platinumKanjiContentReviewSet");

function parseArgs(argv) {
    const args = {
        allowEmpty: false,
        json: false,
        level: null,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--allow-empty") {
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

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadPlatinumEntries({ cwd = process.cwd(), level } = {}) {
    const filePath = path.join(cwd, "templates", `platinum_n${level}_content_review_set.json`);
    return parsePlatinumKanjiContentReviewSet(loadJson(filePath), filePath);
}

function loadSapphireEntries({ cwd = process.cwd(), level } = {}) {
    return loadJson(path.join(cwd, "templates", `sapphire_n${level}_review_set.json`));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:platinum:n<level>", options.unknownArgs);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Platinum kanji content review level must be 1-5.");
    }

    const config = loadConfig();
    const platinumEntries = loadPlatinumEntries({ level });
    const sapphireEntries = loadSapphireEntries({ level });
    const rows = await buildKanjiRowsForLevel({ level, config });
    const report = evaluatePlatinumKanjiContentReviewSet({
        rows,
        platinumEntries,
        sapphireEntries,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatPlatinumKanjiContentReviewReport(report, {
        title: "Japanese Kanji Builder Platinum N" + level + " Kanji Content Gate",
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
    loadPlatinumEntries,
    loadSapphireEntries,
    main,
    parseArgs,
};
