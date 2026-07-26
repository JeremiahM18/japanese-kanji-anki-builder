const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { evaluateGoldenWordReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");
const { createWordExportService } = require("../src/services/wordExportService");

function parseArgs(argv) {
    const args = {
        json: false,
        level: null,
        manifestScoped: false,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            args.json = true;
        } else if (arg === "--manifest-scoped") {
            args.manifestScoped = true;
        } else if (arg === "--require-all") {
            args.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            args.level = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(args, arg);
        }
    }

    return args;
}

function assertGoldenWordReviewScope(options = {}) {
    if (options.requireAllRows === options.manifestScoped) {
        throw new Error("Golden word review scope must use exactly one of --require-all or --manifest-scoped.");
    }
}

function parseWordTsv(tsv) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.split("	") || [];
    const rows = [];
    for (const line of lines.slice(1)) {
        const cols = line.split("	");
        const mapped = {};
        for (let index = 0; index < header.length; index += 1) {
            mapped[header[index]] = cols[index] || "";
        }
        rows.push({
            word: mapped.Word || "",
            reading: mapped.Reading || "",
            meaning: mapped.Meaning || "",
            jlptLevel: mapped.JLPTLevel || "",
            coverageRole: mapped.CoverageRole || "",
            focusKanji: mapped.FocusKanji || "",
            coversReading: mapped.CoversReading || "",
            kanjiBreakdown: mapped.KanjiBreakdown || "",
            exampleSentence: mapped.ExampleSentence || "",
            notes: mapped.Notes || "",
        });
    }
    return rows;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:review:n<level>", options.unknownArgs);
    assertGoldenWordReviewScope(options);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Golden word review level must be 1-5.");
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
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const jlptWordLevelContract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
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
        jlptWordLevelContract,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        includeInferred: false,
    });
    const rows = parseWordTsv(result.tsv);
    const report = evaluateGoldenWordReviewSet({ rows, expectations, requireAllRows: options.requireAllRows });

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
    assertGoldenWordReviewScope,
    main,
    parseArgs,
    parseWordTsv,
};
