const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const {
    evaluatePlatinumWordContentReviewSet,
    formatPlatinumWordContentReviewReport,
} = require("../src/services/platinumWordContentReviewService");
const {
    parsePlatinumWordContentReviewSet,
} = require("../src/datasets/platinumWordContentReviewSet");

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
    const filePath = path.join(cwd, "templates", `platinum_n${level}_word_content_review_set.json`);
    return parsePlatinumWordContentReviewSet(loadJson(filePath), filePath);
}

function loadSapphireEntries({ cwd = process.cwd(), level } = {}) {
    return loadJson(path.join(cwd, "templates", `sapphire_n${level}_word_review_set.json`));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:platinum:n<level>", options.unknownArgs);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Platinum word content review level must be 1-5.");
    }

    const config = loadConfig();
    const platinumEntries = loadPlatinumEntries({ level });
    const sapphireEntries = loadSapphireEntries({ level });
    const rows = await buildWordRowsForLevel({ level, config });
    const report = evaluatePlatinumWordContentReviewSet({
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

    process.stdout.write(formatPlatinumWordContentReviewReport(report, {
        title: "Japanese Kanji Builder Platinum N" + level + " Word Content Gate",
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
