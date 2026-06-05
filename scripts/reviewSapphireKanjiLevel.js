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
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
    evaluateSapphireKanjiReviewSet,
    formatSapphireKanjiReviewReport,
    isCurrentStandardSapphireEntry,
} = require("../src/services/sapphireKanjiReviewService");

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

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertKanjiSapphirePreflight({ entries = [], level, options = {} } = {}) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const sapphireCount = reviewEntries.filter(isCurrentStandardSapphireEntry).length;
    const requiresSapphireCoverage = options.requireAllRows
        && options.requireCurrentReviewStandard
        && !options.allowEmpty;

    if (requiresSapphireCoverage && sapphireCount === 0) {
        throw new Error([
            `N${level} has 0 Sapphire entries for ${CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD}.`,
            "Generated-row build skipped because --require-all needs current-standard Sapphire coverage before export checks.",
            "Start the governed Sapphire manifest first, or use --allow-empty only for intentional empty diagnostic surfaces.",
        ].join(" "));
    }

    return { sapphireCount };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:sapphire:n<level>", options.unknownArgs);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Sapphire kanji review level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "sapphire_n" + level + "_review_set.json");

    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing sapphire kanji review set at " + reviewSetPath);
    }

    const entries = loadJson(reviewSetPath);
    assertKanjiSapphirePreflight({ entries, level, options });
    const rows = await buildKanjiRowsForLevel({ level, config });
    const report = evaluateSapphireKanjiReviewSet({
        rows,
        entries,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatSapphireKanjiReviewReport(report, {
        title: "Japanese Kanji Builder Sapphire N" + level + " Kanji Gate",
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
    assertKanjiSapphirePreflight,
    main,
    parseArgs,
};
