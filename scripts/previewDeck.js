const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadKradMap } = require("../src/datasets/kradfile");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { buildPreviewCards, selectPreviewKanji } = require("../src/services/previewCardService");
const { formatPreviewReport } = require("../src/services/previewService");
const { collectUnknownArg, parseCsvOption, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

function parseLevel(value) {
    if (value == null) {
        return null;
    }

    const normalized = String(value).trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv) {
    const options = {
        level: null,
        limit: 5,
        kanji: [],
        json: argv.includes("--json"),
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg !== "--json") {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (options.unknownArgs.length > 0) {
        throw new Error("Unsupported arguments for previewDeck: " + options.unknownArgs.join(", "));
    }

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const kradMap = loadKradMap(config.kradfilePath);
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const kanjiList = selectPreviewKanji({
        jlptOnlyJson,
        level: options.level,
        limit: options.limit,
        kanji: options.kanji,
    });

    const cards = await buildPreviewCards({
        kanjiList,
        jlptOnlyJson,
        curatedStudyData,
        sentenceCorpus,
        kradMap,
        kanjiApiClient,
        strokeOrderService,
        audioService,
    });

    const scope = options.kanji.length > 0
        ? `kanji=${options.kanji.join(",")}`
        : `level=${options.level == null ? "N5" : `N${options.level}`}, limit=${options.limit}`;

    if (options.json) {
        console.log(JSON.stringify({ scope, cards }, null, 2));
        return;
    }

    process.stdout.write(formatPreviewReport({ cards, scope }));
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
