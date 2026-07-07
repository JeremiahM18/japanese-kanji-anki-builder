const { createKanjiApiClient } = require("../clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadJlptOnlyJson } = require("../datasets/jlptOnlyJson");
const { loadGovernedComponentMap, pickMainComponent } = require("../datasets/kradfile");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { createInferenceEngine } = require("../inference/inferenceEngine");
const { createExportService } = require("./exportService");
const { createMediaServices } = require("./mediaServiceFactory");
const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    isCurrentStandardPlatinumEntry,
} = require("./platinumKanjiReviewService");

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

function assertKanjiPlatinumPreflight({ entries = [], level, options = {} } = {}) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const platinumCount = reviewEntries.filter(isCurrentStandardPlatinumEntry).length;
    const requiresPlatinumCoverage = options.requireAllRows
        && options.requireCurrentReviewStandard
        && !options.allowEmpty;

    if (requiresPlatinumCoverage && platinumCount === 0) {
        throw new Error([
            `N${level} has 0 Platinum entries for ${CURRENT_KANJI_PLATINUM_REVIEW_STANDARD}.`,
            "Generated-row build skipped because --require-all needs current-standard Platinum coverage before export checks.",
            "Start the governed Platinum manifest first, or use --allow-empty only for intentional empty diagnostic surfaces.",
        ].join(" "));
    }

    return { platinumCount };
}

module.exports = {
    assertKanjiPlatinumPreflight,
    buildKanjiRowsForLevel,
    parseKanjiTsvForPlatinum,
};
