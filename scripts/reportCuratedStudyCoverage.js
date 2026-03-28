const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildCuratedStudySummary } = require("../src/datasets/curatedStudyCoverage");

function parseArgs(argv) {
    const options = {
        limit: 25,
    };

    for (const arg of argv) {
        if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        }
    }

    return options;
}

function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const summary = buildCuratedStudySummary({
        jlptOnlyJson,
        curatedStudyData,
    });

    console.log(JSON.stringify({
        ...summary,
        missingByPriority: summary.missingByPriority.slice(0, Math.max(1, options.limit || 25)),
    }, null, 2));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
