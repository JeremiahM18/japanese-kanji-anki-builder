const fs = require("node:fs");
const path = require("node:path");

const { createKanjiApiClient } = require("../clients/kanjiApiClient");
const { buildCuratedStudySummary } = require("../datasets/curatedStudyCoverage");
const { loadCuratedStudyData, normalizeCuratedStudyData } = require("../datasets/curatedStudyData");
const { loadKradMap, pickMainComponent } = require("../datasets/kradfile");
const { buildMediaCoverageSummary } = require("../datasets/mediaCoverage");
const { buildCoverageSummary } = require("../datasets/sentenceCorpusCoverage");
const { loadSentenceCorpus, normalizeSentenceCorpus } = require("../datasets/sentenceCorpus");
const { createInferenceEngine } = require("../inference/inferenceEngine");
const { createExportService } = require("./exportService");
const { ensureMediaRoot } = require("./mediaStore");
const { createMediaServices } = require("./mediaServiceFactory");
const { selectKanjiForSync, syncMediaForKanjiList } = require("./mediaSync");

/** @typedef {import("../types/contracts").BuildSummary} BuildSummary */
/** @typedef {import("../types/contracts").DatasetNormalizationSummary} DatasetNormalizationSummary */

function parseLevelsArgument(value) {
    if (value == null || String(value).trim() === "") {
        return [5, 4, 3, 2, 1];
    }

    if (String(value).trim().toLowerCase() === "all") {
        return [5, 4, 3, 2, 1];
    }

    const levels = [...new Set(
        String(value)
            .split(",")
            .map((entry) => String(entry).trim().toUpperCase().replace(/^N/, ""))
            .map((entry) => Number(entry))
            .filter((entry) => [1, 2, 3, 4, 5].includes(entry))
    )].sort((a, b) => b - a);

    return levels.length > 0 ? levels : [5, 4, 3, 2, 1];
}

function buildBuildPaths(outDir) {
    const root = path.resolve(outDir);

    return {
        root,
        exportsDir: path.join(root, "exports"),
        reportsDir: path.join(root, "reports"),
    };
}

function writeJsonFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeTextFile(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value, "utf-8");
}

/**
 * @param {{name: string, inputPath: string, outputPath: string, rawValue: unknown, normalizedValue: unknown, mode: string, missingInput: boolean}} input
 * @returns {DatasetNormalizationSummary}
 */
function buildNormalizationSummary({ name, inputPath, outputPath, rawValue, normalizedValue, mode, missingInput }) {
    if (missingInput) {
        return {
            name,
            inputPath,
            outputPath,
            inputEntries: 0,
            outputEntries: 0,
            changed: false,
            mode,
            missingInput: true,
            normalizedText: null,
        };
    }

    const normalizedText = `${JSON.stringify(normalizedValue, null, 2)}\n`;
    const currentOutputText = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, "utf-8")
        : null;

    return {
        name,
        inputPath,
        outputPath,
        inputEntries: Array.isArray(rawValue) ? rawValue.length : Object.keys(rawValue || {}).length,
        outputEntries: Array.isArray(normalizedValue) ? normalizedValue.length : Object.keys(normalizedValue || {}).length,
        changed: currentOutputText !== normalizedText,
        mode,
        missingInput: false,
        normalizedText,
    };
}

/**
 * @param {{name: string, inputPath: string, outputPath: string, mode: string, normalizeValue: Function}} input
 * @returns {DatasetNormalizationSummary}
 */
function normalizeOptionalFile({ name, inputPath, outputPath, mode, normalizeValue }) {
    if (!fs.existsSync(inputPath)) {
        return buildNormalizationSummary({
            name,
            inputPath,
            outputPath,
            rawValue: null,
            normalizedValue: null,
            mode,
            missingInput: true,
        });
    }

    const rawValue = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    const normalizedValue = normalizeValue(rawValue);

    return buildNormalizationSummary({
        name,
        inputPath,
        outputPath,
        rawValue,
        normalizedValue,
        mode,
        missingInput: false,
    });
}

/**
 * @param {DatasetNormalizationSummary} summary
 */
function persistNormalization(summary) {
    if (summary.missingInput || summary.normalizedText == null || summary.mode === "check") {
        return;
    }

    writeTextFile(summary.outputPath, summary.normalizedText);
}

function selectBuildKanjiList({ jlptOnlyJson, levels, limit, selectKanjiForSyncFn }) {
    const selected = levels.flatMap((level) => selectKanjiForSyncFn({ jlptOnlyJson, level }));

    if (Number.isFinite(limit) && limit > 0) {
        return selected.slice(0, limit);
    }

    return selected;
}

/**
 * @param {object} input
 * @returns {Promise<BuildSummary>}
 */
async function runBuildPipeline({
    config,
    outDir,
    levels = [5, 4, 3, 2, 1],
    limit = null,
    concurrency = null,
    skipMediaSync = false,
    syncAudioMetadata = {},
    createKanjiApiClientFn = createKanjiApiClient,
    createMediaServicesFn = createMediaServices,
    createExportServiceFn = createExportService,
    createInferenceEngineFn = createInferenceEngine,
    ensureMediaRootFn = ensureMediaRoot,
    buildMediaCoverageSummaryFn = buildMediaCoverageSummary,
    buildCoverageSummaryFn = buildCoverageSummary,
    buildCuratedStudySummaryFn = buildCuratedStudySummary,
    loadSentenceCorpusFn = loadSentenceCorpus,
    loadCuratedStudyDataFn = loadCuratedStudyData,
    loadKradMapFn = loadKradMap,
    syncMediaForKanjiListFn = syncMediaForKanjiList,
    selectKanjiForSyncFn = selectKanjiForSync,
}) {
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const mode = "write";
    const buildPaths = buildBuildPaths(outDir || config.buildOutDir);
    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));

    const sentenceNormalization = normalizeOptionalFile({
        name: "sentenceCorpus",
        inputPath: config.sentenceCorpusPath,
        outputPath: config.sentenceCorpusPath,
        mode,
        normalizeValue: normalizeSentenceCorpus,
    });
    const curatedNormalization = normalizeOptionalFile({
        name: "curatedStudyData",
        inputPath: config.curatedStudyDataPath,
        outputPath: config.curatedStudyDataPath,
        mode,
        normalizeValue: normalizeCuratedStudyData,
    });

    persistNormalization(sentenceNormalization);
    persistNormalization(curatedNormalization);

    const sentenceCorpus = loadSentenceCorpusFn(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyDataFn(config.curatedStudyDataPath);
    const kradMap = loadKradMapFn(config.kradfilePath);

    ensureMediaRootFn(config.mediaRootDir);

    const kanjiApiClient = createKanjiApiClientFn({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServicesFn(config);
    const inferenceEngine = createInferenceEngineFn({ sentenceCorpus, curatedStudyData });
    const exportService = createExportServiceFn({ inferenceEngine });
    const effectiveConcurrency = concurrency || config.exportConcurrency;

    const sentenceCoverage = buildCoverageSummaryFn({
        jlptOnlyJson,
        sentenceCorpus,
        curatedStudyData,
    });
    const curatedCoverage = buildCuratedStudySummaryFn({
        jlptOnlyJson,
        curatedStudyData,
    });

    const syncKanjiList = selectBuildKanjiList({
        jlptOnlyJson,
        levels,
        limit,
        selectKanjiForSyncFn,
    });

    const mediaSync = skipMediaSync
        ? {
            skipped: true,
            scope: {
                levels,
                limit,
                concurrency: effectiveConcurrency,
                count: syncKanjiList.length,
            },
            summary: {
                totalKanji: 0,
                strokeOrder: { imageHits: 0, animationHits: 0, sourceCounts: {} },
                audio: { hits: 0, sourceCounts: {} },
                errors: [],
            },
            sample: [],
        }
        : await (async () => {
            const syncResult = await syncMediaForKanjiListFn({
                kanjiList: syncKanjiList,
                strokeOrderService,
                audioService,
                concurrency: effectiveConcurrency,
                audioMetadata: syncAudioMetadata,
            });

            return {
                skipped: false,
                scope: {
                    levels,
                    limit,
                    concurrency: effectiveConcurrency,
                    count: syncKanjiList.length,
                },
                summary: syncResult.summary,
                sample: syncResult.results.slice(0, 25),
            };
        })();

    const exports = [];
    for (const level of levels) {
        const tsv = await exportService.buildTsvForJlptLevel({
            levelNumber: level,
            jlptOnlyJson,
            kradMap,
            pickMainComponent,
            kanjiApiClient,
            strokeOrderService,
            audioService,
            limit,
            concurrency: effectiveConcurrency,
        });
        const filePath = path.join(buildPaths.exportsDir, `jlpt-n${level}.tsv`);
        writeTextFile(filePath, `${tsv}\n`);
        exports.push({
            level,
            filePath,
            rows: Math.max(0, tsv.trim().split("\n").length - 1),
        });
    }

    const mediaCoverage = await buildMediaCoverageSummaryFn({
        jlptOnlyJson,
        mediaRootDir: config.mediaRootDir,
    });

    const reportPaths = {
        sentenceCoveragePath: path.join(buildPaths.reportsDir, "sentence-corpus-coverage.json"),
        curatedCoveragePath: path.join(buildPaths.reportsDir, "curated-study-coverage.json"),
        mediaCoveragePath: path.join(buildPaths.reportsDir, "media-coverage.json"),
        sentenceNormalizationPath: path.join(buildPaths.reportsDir, "sentence-corpus-normalization.json"),
        curatedNormalizationPath: path.join(buildPaths.reportsDir, "curated-study-normalization.json"),
        mediaSyncPath: path.join(buildPaths.reportsDir, "media-sync.json"),
    };

    writeJsonFile(reportPaths.sentenceCoveragePath, sentenceCoverage);
    writeJsonFile(reportPaths.curatedCoveragePath, curatedCoverage);
    writeJsonFile(reportPaths.mediaCoveragePath, mediaCoverage);
    writeJsonFile(reportPaths.sentenceNormalizationPath, sentenceNormalization);
    writeJsonFile(reportPaths.curatedNormalizationPath, curatedNormalization);
    writeJsonFile(reportPaths.mediaSyncPath, mediaSync);

    /** @type {BuildSummary} */
    const summary = {
        generatedAt: new Date().toISOString(),
        outDir: buildPaths.root,
        levels,
        limit,
        concurrency: effectiveConcurrency,
        exports,
        normalization: {
            sentenceCorpus: {
                inputPath: sentenceNormalization.inputPath,
                outputPath: sentenceNormalization.outputPath,
                inputEntries: sentenceNormalization.inputEntries,
                outputEntries: sentenceNormalization.outputEntries,
                changed: sentenceNormalization.changed,
                missingInput: sentenceNormalization.missingInput,
            },
            curatedStudyData: {
                inputPath: curatedNormalization.inputPath,
                outputPath: curatedNormalization.outputPath,
                inputEntries: curatedNormalization.inputEntries,
                outputEntries: curatedNormalization.outputEntries,
                changed: curatedNormalization.changed,
                missingInput: curatedNormalization.missingInput,
            },
        },
        reports: reportPaths,
        coverage: {
            sentenceCorpus: sentenceCoverage.coverageRatio,
            curatedStudyData: curatedCoverage.coverageRatio,
            strokeOrder: mediaCoverage.strokeOrderCoverageRatio,
            audio: mediaCoverage.audioCoverageRatio,
            fullMedia: mediaCoverage.fullMediaCoverageRatio,
        },
        mediaSync: {
            skipped: mediaSync.skipped,
            totalKanji: mediaSync.summary.totalKanji,
            errors: mediaSync.summary.errors.length,
        },
    };

    writeJsonFile(path.join(buildPaths.root, "build-summary.json"), summary);
    return summary;
}

module.exports = {
    buildBuildPaths,
    parseLevelsArgument,
    runBuildPipeline,
    selectBuildKanjiList,
};
