const path = require("node:path");

const { createKanjiApiClient } = require("../clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadJlptOnlyJson } = require("../datasets/jlptOnlyJson");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadSentenceCorpus } = require("../datasets/sentenceCorpus");
const { loadWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const { loadWordStudyData } = require("../datasets/wordStudyData");
const { createMediaServices } = require("./mediaServiceFactory");
const { createWordExportService } = require("./wordExportService");

function parseWordTsvForPlatinum(tsv) {
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
            exampleAudio: mapped.ExampleAudio || "",
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
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
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

module.exports = {
    buildWordExportOptions,
    buildWordRowsForLevel,
    parseWordTsvForPlatinum,
};
