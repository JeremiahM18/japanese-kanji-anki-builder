const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const {
    buildPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
const {
    buildPlatinumKanjiCertificationStatusSummary,
    formatPlatinumKanjiCertificationStatusReport,
} = require("../src/services/platinumKanjiCertificationStatusService");

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
    const reviewSetPath = path.join(process.cwd(), "templates", `platinum_n${level}_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing platinum kanji review set at ${reviewSetPath}`);
    }

    return JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:platinum:certify-status", options.unknownArgs);

    const config = loadConfig();
    const levelReports = [];
    for (const level of options.levels) {
        const entries = readReviewSet(level);
        const rows = await buildKanjiRowsForLevel({ level, config });
        levelReports.push(buildPlatinumKanjiRereviewStatusReport({
            rows,
            entries,
            level,
        }));
    }
    const summary = buildPlatinumKanjiCertificationStatusSummary(levelReports);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatPlatinumKanjiCertificationStatusReport(summary));
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
