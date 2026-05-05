const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { createWordExportService } = require("../src/services/wordExportService");
const {
    evaluatePlatinumWordReviewSet,
    formatPlatinumWordReviewReport,
} = require("../src/services/platinumReviewService");

function parseArgs(argv) {
    const args = {
        allowEmpty: false,
        json: false,
        level: null,
        requireAllRows: false,
    };

    for (const arg of argv) {
        if (arg === "--allow-empty") {
            args.allowEmpty = true;
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--require-all") {
            args.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            args.level = Number(arg.split("=")[1]);
        }
    }

    return args;
}

function parseWordTsvForPlatinum(tsv) {
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
            readingBreakdown: mapped.ReadingBreakdown || "",
            audio: mapped.Audio || "",
            pitchAccent: mapped.PitchAccent || "",
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

function buildWordExportOptions({
    level,
    config,
    jlptOnlyJson,
    jlptWordLevelContract,
    kanjiApiClient,
    strokeOrderService,
    audioService,
} = {}) {
    return {
        levelNumber: level,
        jlptOnlyJson,
        jlptWordLevelContract,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        mediaRootDir: config?.mediaRootDir || "",
        includeInferred: false,
    };
}

async function buildWordRowsForLevel({ level, config }) {
    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const jlptWordLevelContract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const wordStudyData = loadWordStudyData({ localPath: config.wordStudyDataPath });
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const wordExportService = createWordExportService({
        sentenceCorpus,
        curatedStudyData,
        wordStudyData,
        wordPitchAccentData,
    });
    const result = await wordExportService.buildWordTsvForJlptLevel(buildWordExportOptions({
        level,
        config,
        jlptOnlyJson,
        jlptWordLevelContract,
        kanjiApiClient,
        strokeOrderService,
        audioService,
    }));

    return parseWordTsvForPlatinum(result.tsv);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Platinum word review level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "platinum_n" + level + "_word_review_set.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing platinum word review set at " + reviewSetPath);
    }

    const entries = JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const rows = await buildWordRowsForLevel({ level, config });
    const report = evaluatePlatinumWordReviewSet({
        rows,
        entries,
        wordPitchAccentData,
        kanjiLevelData,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatPlatinumWordReviewReport(report, {
        title: "Japanese Kanji Builder Platinum N" + level + " Word Review",
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
    buildWordExportOptions,
    buildWordRowsForLevel,
    main,
    parseArgs,
    parseWordTsvForPlatinum,
};
