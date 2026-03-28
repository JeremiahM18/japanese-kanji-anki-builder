const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { ensureMediaRoot } = require("../src/services/mediaStore");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { parseLevelArgument, selectKanjiForSync, syncMediaForKanjiList } = require("../src/services/mediaSync");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, parseCsvOption, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        level: null,
        limit: null,
        concurrency: null,
        kanji: [],
        audioReading: null,
        audioVoice: null,
        audioLocale: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = parseLevelArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            const levels = parseLevelsArgument(parseStringOption(arg, "levels"));
            if (levels.length > 1) {
                throw new Error("syncMedia accepts one level at a time. Use --level=N or rerun per level.");
            }
            options.level = levels[0] || null;
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--audio-reading=")) {
            options.audioReading = parseStringOption(arg, "audio-reading");
        } else if (arg.startsWith("--audio-voice=")) {
            options.audioVoice = parseStringOption(arg, "audio-voice");
        } else if (arg.startsWith("--audio-locale=")) {
            options.audioLocale = parseStringOption(arg, "audio-locale");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    assertNoUnknownArgs("syncMedia", options.unknownArgs);

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kanjiList = selectKanjiForSync({
        jlptOnlyJson,
        level: options.level,
        limit: options.limit,
        kanji: options.kanji,
    });

    ensureMediaRoot(config.mediaRootDir);

    const { strokeOrderService, audioService } = createMediaServices(config);

    const concurrency = options.concurrency || config.exportConcurrency;
    const { results, summary } = await syncMediaForKanjiList({
        kanjiList,
        strokeOrderService,
        audioService,
        concurrency,
        audioMetadata: {
            reading: options.audioReading || undefined,
            voice: options.audioVoice || undefined,
            locale: options.audioLocale || undefined,
        },
    });

    console.log(JSON.stringify({
        scope: {
            level: options.level,
            limit: options.limit,
            kanji: options.kanji,
            concurrency,
            count: kanjiList.length,
        },
        summary,
        sample: results.slice(0, 10),
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
