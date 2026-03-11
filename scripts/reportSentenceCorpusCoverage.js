const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { buildCoverageSummary } = require("../src/datasets/sentenceCorpusCoverage");

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
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const summary = buildCoverageSummary({
        jlptOnlyJson,
        sentenceCorpus,
        curatedStudyData,
    });

    console.log(JSON.stringify({
        ...summary,
        missingByPriority: summary.missingByPriority.slice(0, Math.max(1, options.limit || 25)),
    }, null, 2));
}

try {
    main();
} catch (err) {
    console.error(err.stack || err);
    process.exit(1);
}
