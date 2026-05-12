const fs = require("node:fs");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const {
    buildMediaGapReport,
    parseLevelsArgument,
    formatMediaGapReport,
} = require("../src/services/mediaGapService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: 25,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("media:plan", options.unknownArgs);

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const report = await buildMediaGapReport({
        jlptOnlyJson,
        mediaRootDir: config.mediaRootDir,
        strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
        strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
        audioSourceDir: config.audioSourceDir,
        audioEnabled: config.enableAudio !== false,
        levels: options.levels,
        limit: options.limit,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatMediaGapReport(report));
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
