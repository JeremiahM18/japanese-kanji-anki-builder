const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildAudioReviewReport, parseLevelsArgument, formatAudioReviewReport } = require("../src/services/audioReviewService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        levels: [5],
        kanji: [],
        limit: 25,
        json: argv.includes("--json"),
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            continue;
        }
        if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("reportAudioReview", options.unknownArgs);

    const config = loadConfig();
    const policy = loadAudioSourcePolicy();
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const report = await buildAudioReviewReport({
        jlptOnlyJson,
        curatedStudyData,
        mediaRootDir: config.mediaRootDir,
        audioSourcePolicy: policy,
        levels: options.levels,
        kanji: options.kanji,
        limit: options.limit,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatAudioReviewReport(report, policy));
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
