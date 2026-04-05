const fs = require("node:fs");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildCuratedStudySummary } = require("../src/datasets/curatedStudyCoverage");
const { assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        limit: 25,
        level: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("reportCuratedStudyCoverage", options.unknownArgs);

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const summary = buildCuratedStudySummary({
        jlptOnlyJson,
        curatedStudyData,
        cacheDir: config.cacheDir,
        level: Number.isInteger(options.level) ? options.level : null,
    });

    console.log(JSON.stringify({
        ...summary,
        missingByPriority: summary.missingByPriority.slice(0, Math.max(1, options.limit || 25)),
    }, null, 2));
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
