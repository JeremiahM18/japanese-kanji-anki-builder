const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg, parseNumericOption } = require("../src/utils/cliArgs");
const { buildWordDeckCompletionReport, formatWordDeckCompletionReport } = require("../src/services/wordDeckCompletionService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        limit: 20,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveWordTsvPath(level) {
    return path.join(process.cwd(), "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
}

function resolveKanjiTsvPath(config, level) {
    return path.join(config.buildOutDir, "exports", `jlpt-n${level}.tsv`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:completion", options.unknownArgs);

    const level = Number(options.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Word deck completion audit level must be 1-5.");
    }

    const config = loadConfig();
    const kanjiTsvPath = resolveKanjiTsvPath(config, level);
    const wordTsvPath = resolveWordTsvPath(level);

    if (!fs.existsSync(kanjiTsvPath)) {
        throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${level} first.`);
    }
    if (!fs.existsSync(wordTsvPath)) {
        throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
    }

    const starterEntries = loadWordStudyData({
        starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
        localPath: null,
    });
    const jlptWordLevelContract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));

    const report = buildWordDeckCompletionReport({
        level,
        starterEntries,
        jlptWordLevelContract,
        kanjiTsv: fs.readFileSync(kanjiTsvPath, "utf8"),
        wordTsv: fs.readFileSync(wordTsvPath, "utf8"),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordDeckCompletionReport(report, {
        maxEntries: options.limit,
    }));
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
    resolveKanjiTsvPath,
    resolveWordTsvPath,
};
