const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadGovernedComponentMap, pickMainComponent } = require("../src/datasets/kradfile");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { createInferenceEngine } = require("../src/inference/inferenceEngine");
const { createExportService } = require("../src/services/exportService");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const {
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");

function parseArgs(argv) {
    const args = {
        allowEmpty: false,
        json: false,
        level: null,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
    };

    for (const arg of argv) {
        if (arg === "--allow-legacy-standard") {
            args.requireCurrentReviewStandard = false;
        } else if (arg === "--allow-empty") {
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

function parseKanjiTsvForPlatinum(tsv, { level } = {}) {
    const lines = String(tsv || "").trim().split(/\r?\n/).filter(Boolean);
    const header = lines[0]?.split("\t") || [];
    const rows = [];

    for (const line of lines.slice(1)) {
        const cols = line.split("\t");
        const mapped = {};
        for (let index = 0; index < header.length; index += 1) {
            mapped[header[index]] = cols[index] || "";
        }
        rows.push({
            kanji: mapped.Kanji || "",
            levelLabel: Number.isInteger(level) ? `N${level}` : "",
            displayWord: mapped.DisplayWord || "",
            meaningJP: mapped.MeaningJP || "",
            primaryReading: mapped.PrimaryReading || "",
            kanjiMeanings: mapped.KanjiMeanings || "",
            studyWordKanji: mapped.StudyWordKanji || "",
            onReading: mapped.OnReading || "",
            kunReading: mapped.KunReading || "",
            strokeOrder: mapped.StrokeOrder || "",
            audio: mapped.Audio || "",
            radical: mapped.Radical || "",
            notes: mapped.Notes || "",
            exampleSentence: mapped.ExampleSentence || "",
        });
    }

    return rows;
}

async function buildKanjiRowsForLevel({ level, config }) {
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const kradMap = loadGovernedComponentMap({
        kanjiComponentContractPath: config.kanjiComponentContractPath,
        kradfilePath: config.kradfilePath,
    });
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData });
    const exportService = createExportService({ inferenceEngine, curatedStudyData, sentenceCorpus });
    const tsv = await exportService.buildTsvForJlptLevel({
        levelNumber: level,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
    });

    return parseKanjiTsvForPlatinum(tsv, { level });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Platinum kanji review level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "platinum_n" + level + "_review_set.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }
    if (!fs.existsSync(config.kanjiComponentContractPath || "") && !fs.existsSync(config.kradfilePath || "")) {
        throw new Error(`Missing kanji component contract at ${config.kanjiComponentContractPath} and KRADFILE at ${config.kradfilePath}`);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing platinum kanji review set at " + reviewSetPath);
    }

    const entries = JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
    const rows = await buildKanjiRowsForLevel({ level, config });
    const report = evaluatePlatinumKanjiReviewSet({
        rows,
        entries,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatPlatinumKanjiReviewReport(report, {
        title: "Japanese Kanji Builder Platinum N" + level + " Kanji Review",
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
    buildKanjiRowsForLevel,
    main,
    parseArgs,
    parseKanjiTsvForPlatinum,
};
