const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadKradMap } = require("../src/datasets/kradfile");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { buildPreviewCards } = require("../src/services/previewCardService");
const { evaluateGoldenReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");

function parseArgs(argv) {
    const args = {
        json: false,
        level: null,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            args.json = true;
        } else if (arg.startsWith("--level=")) {
            args.level = Number(arg.split("=")[1]);
        }
    }

    return args;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const level = options.level;

    if (![3, 4, 5].includes(level)) {
        throw new Error("Golden review level must be N3, N4, or N5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "golden_n" + level + "_review_set.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error("Missing KRADFILE at " + config.kradfilePath);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing golden review set at " + reviewSetPath);
    }

    const expectations = JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
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
    const kanjiList = expectations.map((entry) => entry.kanji);
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
    const report = evaluateGoldenReviewSet({ cards, expectations });

    if (options.json) {
        console.log(JSON.stringify({ report, cards }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatGoldenReviewReport(report, {
        title: "Japanese Kanji Builder Golden N" + level + " Review",
    }));
    process.exit(report.passed ? 0 : 1);
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
