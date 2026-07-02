const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { buildWordExampleAudioReviewReport, formatWordExampleAudioReviewReport } = require("../src/services/wordExampleAudioReviewService");

function parseArgs(argv) {
    const options = {
        level: 5,
        limit: 25,
        words: [],
        json: false,
        tsvPath: "",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--word=")) {
            options.words = parseCsvOption(arg, "word");
        } else if (arg.startsWith("--tsv-path=")) {
            options.tsvPath = parseStringOption(arg, "tsv-path").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("media:review:word-example-audio", options.unknownArgs);
    const config = loadConfig();
    const policy = loadAudioSourcePolicy();
    const { audioService } = createMediaServices(config);

    const wordTsvPath = options.tsvPath
        ? path.resolve(options.tsvPath)
        : path.join(path.dirname(config.buildOutDir), "word-build", "exports", `jlpt-n${options.level}-words.tsv`);
    if (!fs.existsSync(wordTsvPath)) {
        throw new Error(`Missing word TSV at ${wordTsvPath}. Build the word deck first.`);
    }

    const report = await buildWordExampleAudioReviewReport({
        wordTsv: fs.readFileSync(wordTsvPath, "utf-8"),
        audioSourcePolicy: policy,
        audioService,
        mediaRootDir: config.mediaRootDir,
        limit: options.limit,
        words: options.words,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordExampleAudioReviewReport(report, policy));
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
