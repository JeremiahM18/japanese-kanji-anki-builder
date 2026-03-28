const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { ensureMediaRoot } = require("../src/services/mediaStore");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { parseLevelArgument, selectKanjiForSync, syncMediaForKanjiList } = require("../src/services/mediaSync");
const { parseLevelsArgument } = require("../src/services/buildPipeline");

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
            options.level = parseLevelArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--levels=")) {
            const levels = parseLevelsArgument(arg.split("=")[1]);
            if (levels.length > 1) {
                throw new Error("syncMedia accepts one level at a time. Use --level=N or rerun per level.");
            }
            options.level = levels[0] || null;
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--audio-reading=")) {
            options.audioReading = arg.split("=")[1];
        } else if (arg.startsWith("--audio-voice=")) {
            options.audioVoice = arg.split("=")[1];
        } else if (arg.startsWith("--audio-locale=")) {
            options.audioLocale = arg.split("=")[1];
        } else {
            options.unknownArgs.push(arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (options.unknownArgs.length > 0) {
        throw new Error("Unsupported arguments for syncMedia: " + options.unknownArgs.join(", "));
    }

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
