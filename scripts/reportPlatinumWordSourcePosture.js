const fs = require("node:fs");
const path = require("node:path");

const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const {
    buildPlatinumWordSourcePostureReport,
    buildPlatinumWordSourcePostureSummary,
    formatPlatinumWordSourcePostureReport,
} = require("../src/services/platinumWordSourcePostureService");

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

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:legacy-platinum:source-posture", options.unknownArgs);

    const levelReports = options.levels.map((level) => buildPlatinumWordSourcePostureReport({
        entries: readReviewSet(level),
        level,
    }));
    const summary = buildPlatinumWordSourcePostureSummary(levelReports);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatPlatinumWordSourcePostureReport(summary));
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
