const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { evaluateGoldenWordReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");
const { createWordExportService } = require("../src/services/wordExportService");

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

function parseWordTsv(tsv) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    const rows = [];
    for (const line of lines.slice(1)) {
        const cols = line.split("	");
        rows.push({
            word: cols[0] || "",
            reading: cols[1] || "",
            meaning: cols[2] || "",
            jlptLevel: cols[3] || "",
            kanjiBreakdown: cols[4] || "",
            exampleSentence: cols[5] || "",
            notes: cols[6] || "",
        });
    }
    return rows;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const level = options.level;

    if (![5].includes(level)) {
        throw new Error("Golden word review level must currently be N5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "golden_n" + level + "_word_review_set.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing golden word review set at " + reviewSetPath);
    }

    const expectations = JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const wordStudyData = loadWordStudyData({ localPath: config.wordStudyDataPath });
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const wordExportService = createWordExportService({ sentenceCorpus, curatedStudyData, wordStudyData });
    const result = await wordExportService.buildWordTsvForJlptLevel({
        levelNumber: level,
        jlptOnlyJson,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        includeInferred: false,
    });
    const rows = parseWordTsv(result.tsv);
    const report = evaluateGoldenWordReviewSet({ rows, expectations });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatGoldenReviewReport(report, {
        title: "Japanese Kanji Builder Golden N" + level + " Word Review",
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
    parseWordTsv,
};
