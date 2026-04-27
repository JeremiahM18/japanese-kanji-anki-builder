const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildGoldenReviewCoverageSummary } = require("../src/datasets/goldenReviewCoverage");

function parseArgs(argv) {
    const options = {
        level: null,
        limit: 25,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("reportGoldenReviewCoverage", options.unknownArgs);

    const templatesDir = path.join(process.cwd(), "templates");
    const starterCuratedData = loadCuratedStudyData(path.join(process.cwd(), "data", "__tracked_starter_only__.json"), {
        starterPath: path.join(templatesDir, "starter_curated_study_data.json"),
    });
    const levels = Number.isInteger(options.level) ? [options.level] : [4, 5];
    const goldenReviewSets = Object.fromEntries(
        levels.map((level) => [
            level,
            loadJson(path.join(templatesDir, `golden_n${level}_review_set.json`)),
        ])
    );
    const summary = buildGoldenReviewCoverageSummary({
        starterCuratedData,
        goldenReviewSets,
        levels,
    });

    console.log(JSON.stringify({
        ...summary,
        levels: summary.levels.map((row) => ({
            ...row,
            sampleMissing: row.sampleMissing.slice(0, Math.max(1, options.limit || 25)),
        })),
    }, null, 2));
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
};
