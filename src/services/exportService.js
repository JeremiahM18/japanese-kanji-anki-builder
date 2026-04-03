const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { createInferenceEngine } = require("../inference/inferenceEngine");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { buildOfflineFallbackCard } = require("./offlineKanjiFallback");
const { selectBestAudioAsset } = require("./audioService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { labelKunReading, labelOnReading, tsvEscape } = require("../utils/text");

const ANKI_FIELD_NAMES = loadAnkiNoteSchema().fieldNames;

function createEmptyExportProfile() {
    return {
        rows: 0,
        fullyCuratedRows: 0,
        inferredRows: 0,
        timingsMs: {
            getKanji: 0,
            getWords: 0,
            media: 0,
            inference: 0,
            formatting: 0,
        },
    };
}

function recordProfileTiming(exportProfile, key, startedAt) {
    if (!exportProfile || !key || !Number.isFinite(startedAt)) {
        return;
    }

    exportProfile.timingsMs[key] += performance.now() - startedAt;
}

async function measureAsync(exportProfile, key, action) {
    if (!exportProfile) {
        return action();
    }

    const startedAt = performance.now();
    try {
        return await action();
    } finally {
        recordProfileTiming(exportProfile, key, startedAt);
    }
}

function formatExampleSentence(sentence) {
    if (!sentence) {
        return "";
    }

    return [sentence.japanese, sentence.reading, sentence.english]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(" ／ ");
}

function formatAnkiAudioField(audioPath) {
    if (!audioPath) {
        return "";
    }

    return `[sound:${path.posix.basename(audioPath)}]`;
}

function formatAnkiStrokeOrderField(strokeOrderPath) {
    if (!strokeOrderPath) {
        return "";
    }

    return `<img src="${path.posix.basename(strokeOrderPath)}" />`;
}

function selectPrimaryReading({ displayWord, bestWord }) {
    const displayPron = String(displayWord?.pron ?? "").trim();
    if (displayPron) {
        return displayPron;
    }

    const bestPron = String(bestWord?.pron ?? "").trim();
    if (bestPron) {
        return bestPron;
    }

    return "";
}

function selectDisplayWord({ kanji, displayWord, bestWord }) {
    const displayWritten = String(displayWord?.written ?? "").trim();
    if (displayWritten) {
        return displayWritten;
    }

    const bestWritten = String(bestWord?.written ?? "").trim();
    if (bestWritten) {
        return bestWritten;
    }

    return String(kanji ?? "").trim();
}

function formatTsvRow(fields) {
    return fields.map(tsvEscape).join("\t");
}

function appendExportIssue(exportIssues, issue) {
    if (!Array.isArray(exportIssues)) {
        return;
    }

    exportIssues.push(issue);
}

async function resolveStrokeOrderFields(strokeOrderService, kanji) {
    const imagePath = typeof strokeOrderService?.getStrokeOrderImagePath === "function"
        ? await strokeOrderService.getStrokeOrderImagePath(kanji)
        : "";
    const animationPath = typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
        ? await strokeOrderService.getStrokeOrderAnimationPath(kanji)
        : "";
    const bestPath = animationPath
        || imagePath
        || (typeof strokeOrderService?.getBestStrokeOrderPath === "function"
            ? await strokeOrderService.getBestStrokeOrderPath(kanji)
            : "");

    return {
        strokeOrderPath: bestPath,
        strokeOrderImagePath: imagePath,
        strokeOrderAnimationPath: animationPath,
    };
}

async function resolveManagedMediaFields({ kanji, strokeOrderService, audioService }) {
    const manifestProvider = typeof strokeOrderService?.getManifest === "function"
        ? strokeOrderService
        : (typeof audioService?.getManifest === "function" ? audioService : null);

    if (manifestProvider) {
        const manifest = await manifestProvider.getManifest(kanji);
        const imagePath = manifest?.assets?.strokeOrderImage?.path || "";
        const animationPath = manifest?.assets?.strokeOrderAnimation?.path || "";
        const bestPath = animationPath || imagePath || "";
        const audioPath = selectBestAudioAsset(manifest?.assets?.audio || [], {
            category: "kanji-reading",
            text: kanji,
        })?.path || "";

        return {
            strokeOrderPath: bestPath,
            strokeOrderImagePath: imagePath,
            strokeOrderAnimationPath: animationPath,
            audioPath,
        };
    }

    const [strokeOrderFields, audioPath] = await Promise.all([
        resolveStrokeOrderFields(strokeOrderService, kanji),
        typeof audioService?.getBestAudioPath === "function"
            ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
            : Promise.resolve(""),
    ]);

    return {
        ...strokeOrderFields,
        audioPath,
    };
}

function shouldSkipWordFetch(inferenceEngine, kanji) {
    return typeof inferenceEngine?.hasFullyCuratedKanjiEntry === "function"
        && inferenceEngine.hasFullyCuratedKanjiEntry(kanji);
}

function shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry }) {
    return Boolean(
        jlptEntry
        && typeof jlptEntry === "object"
        && shouldSkipWordFetch(inferenceEngine, kanji)
    );
}

function buildInferredRow({ kanji, inferred, kanjiInfo, kradMap, pickMainComponent, mediaFields }) {
    const displayWord = selectDisplayWord({ kanji, displayWord: inferred.displayWord, bestWord: inferred.bestWord });
    const primaryReading = selectPrimaryReading(inferred);
    const onReading = labelOnReading(kanjiInfo?.on_readings);
    const kunReading = labelKunReading(kanjiInfo?.kun_readings);
    const components = kradMap.get(kanji) || [];
    const radical = pickMainComponent(components);
    const exampleSentence = formatExampleSentence(inferred.sentenceCandidates[0]);

    return formatTsvRow([
        kanji,
        displayWord,
        inferred.meaningJP,
        primaryReading,
        onReading,
        kunReading,
        formatAnkiStrokeOrderField(mediaFields.strokeOrderPath),
        formatAnkiStrokeOrderField(mediaFields.strokeOrderImagePath),
        formatAnkiStrokeOrderField(mediaFields.strokeOrderAnimationPath),
        formatAnkiAudioField(mediaFields.audioPath),
        radical,
        inferred.notes,
        exampleSentence,
    ]);
}

function buildFallbackRow({ fallbackCard }) {
    return formatTsvRow([
        fallbackCard.kanji,
        fallbackCard.displayWord,
        fallbackCard.meaningJP,
        fallbackCard.primaryReading,
        fallbackCard.onReading,
        fallbackCard.kunReading,
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderPath),
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderImagePath),
        formatAnkiStrokeOrderField(fallbackCard.media.strokeOrderAnimationPath),
        formatAnkiAudioField(fallbackCard.media.audioPath),
        fallbackCard.radical,
        fallbackCard.notes,
        fallbackCard.exampleSentence,
    ]);
}

function createExportService({
    inferenceEngine = createInferenceEngine(),
    curatedStudyData = {},
    sentenceCorpus = [],
} = {}) {
    async function buildRowForKanji({
        kanji,
        jlptEntry = null,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        exportProfile = null,
        exportIssues = null,
    }) {
        try {
            const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
            const useLocalJlptEntry = shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry });
            const [kanjiInfo, words, mediaFields] = await Promise.all([
                useLocalJlptEntry
                    ? Promise.resolve(jlptEntry)
                    : measureAsync(exportProfile, "getKanji", () => kanjiApiClient.getKanji(kanji)),
                skipWordFetch
                    ? Promise.resolve([])
                    : measureAsync(exportProfile, "getWords", () => kanjiApiClient.getWords(kanji)),
                measureAsync(exportProfile, "media", () => resolveManagedMediaFields({ kanji, strokeOrderService, audioService })),
            ]);

            const inferenceStartedAt = exportProfile ? performance.now() : NaN;
            const inferred = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 3,
            });
            recordProfileTiming(exportProfile, "inference", inferenceStartedAt);

            if (exportProfile) {
                exportProfile.rows += 1;
                if (skipWordFetch) {
                    exportProfile.fullyCuratedRows += 1;
                } else {
                    exportProfile.inferredRows += 1;
                }
            }

            const formattingStartedAt = exportProfile ? performance.now() : NaN;
            const row = buildInferredRow({
                kanji,
                inferred,
                kanjiInfo,
                kradMap,
                pickMainComponent,
                mediaFields,
            });
            recordProfileTiming(exportProfile, "formatting", formattingStartedAt);
            return row;
        } catch (error) {
            try {
                const fallbackCard = await buildOfflineFallbackCard({
                    kanji,
                    levelLabel: `N${jlptEntry?.jlpt || "?"}`,
                    jlptEntry,
                    curatedStudyData,
                    sentenceCorpus,
                    kradMap,
                    strokeOrderService,
                    audioService,
                });

                appendExportIssue(exportIssues, {
                    kanji,
                    level: jlptEntry?.jlpt || null,
                    severity: "warning",
                    resolution: "offline-local-fallback",
                    error: error instanceof Error ? error.message : String(error),
                });

                return buildFallbackRow({ fallbackCard });
            } catch (fallbackError) {
                appendExportIssue(exportIssues, {
                    kanji,
                    level: jlptEntry?.jlpt || null,
                    severity: "error",
                    resolution: "build-failed",
                    error: error instanceof Error ? error.message : String(error),
                    fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
                });

                throw new Error(
                    `Failed to build export row for ${kanji}: ${error instanceof Error ? error.message : String(error)}; fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
                );
            }
        }
    }

    async function buildInferenceForKanji({ kanji, jlptEntry = null, kanjiApiClient, strokeOrderService, audioService }) {
        const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
        const useLocalJlptEntry = shouldUseLocalJlptEntry({ inferenceEngine, kanji, jlptEntry });
        const [kanjiInfo, words, mediaFields] = await Promise.all([
            useLocalJlptEntry ? Promise.resolve(jlptEntry) : kanjiApiClient.getKanji(kanji),
            skipWordFetch ? Promise.resolve([]) : kanjiApiClient.getWords(kanji),
            resolveManagedMediaFields({ kanji, strokeOrderService, audioService }),
        ]);

        const inferred = inferenceEngine.inferKanjiStudyData({
            kanji,
            kanjiInfo,
            words,
            maxExamples: 3,
            maxSentences: 4,
        });

        const onReading = labelOnReading(kanjiInfo?.on_readings);
        const kunReading = labelKunReading(kanjiInfo?.kun_readings);

        return {
            ...inferred,
            displayWordText: selectDisplayWord({ kanji, displayWord: inferred.displayWord, bestWord: inferred.bestWord }),
            primaryReading: selectPrimaryReading(inferred),
            onReading,
            kunReading,
            strokeOrderPath: mediaFields.strokeOrderPath,
            strokeOrderField: formatAnkiStrokeOrderField(mediaFields.strokeOrderPath),
            strokeOrderImagePath: mediaFields.strokeOrderImagePath,
            strokeOrderImageField: formatAnkiStrokeOrderField(mediaFields.strokeOrderImagePath),
            strokeOrderAnimationPath: mediaFields.strokeOrderAnimationPath,
            strokeOrderAnimationField: formatAnkiStrokeOrderField(mediaFields.strokeOrderAnimationPath),
            audioPath: mediaFields.audioPath,
            audioField: formatAnkiAudioField(mediaFields.audioPath),
        };
    }

    async function buildTsvForJlptLevel({
        levelNumber,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService = null,
        audioService = null,
        limit = null,
        concurrency = 8,
        exportProfile = null,
        exportIssues = null,
    }) {
        const header = ANKI_FIELD_NAMES.join("\t");

        const kanjiList = Object.entries(jlptOnlyJson)
            .filter(([, value]) => value?.jlpt === levelNumber)
            .map(([kanji]) => kanji);

        const list = Number.isFinite(limit)
            ? kanjiList.slice(0, limit)
            : kanjiList;

        const rows = await mapWithConcurrency(
            list,
            concurrency,
            async (kanji) => buildRowForKanji({
                kanji,
                jlptEntry: jlptOnlyJson[kanji] || null,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                exportProfile,
                exportIssues,
            })
        );

        return [header, ...rows].join("\n");
    }

    return {
        buildInferenceForKanji,
        buildRowForKanji,
        buildTsvForJlptLevel,
        createEmptyExportProfile,
        formatAnkiAudioField,
        formatAnkiStrokeOrderField,
        formatExampleSentence,
        mapWithConcurrency,
        resolveManagedMediaFields,
        shouldSkipWordFetch,
        shouldUseLocalJlptEntry,
        resolveStrokeOrderFields,
        selectDisplayWord,
        selectPrimaryReading,
    };
}

const defaultExportService = createExportService();

module.exports = {
    createEmptyExportProfile,
    createExportService,
    buildInferenceForKanji: defaultExportService.buildInferenceForKanji,
    buildRowForKanji: defaultExportService.buildRowForKanji,
    buildTsvForJlptLevel: defaultExportService.buildTsvForJlptLevel,
    formatAnkiAudioField: defaultExportService.formatAnkiAudioField,
    formatAnkiStrokeOrderField: defaultExportService.formatAnkiStrokeOrderField,
    formatExampleSentence: defaultExportService.formatExampleSentence,
    mapWithConcurrency: defaultExportService.mapWithConcurrency,
    resolveManagedMediaFields: defaultExportService.resolveManagedMediaFields,
    shouldSkipWordFetch: defaultExportService.shouldSkipWordFetch,
    shouldUseLocalJlptEntry: defaultExportService.shouldUseLocalJlptEntry,
    resolveStrokeOrderFields: defaultExportService.resolveStrokeOrderFields,
    selectDisplayWord: defaultExportService.selectDisplayWord,
    selectPrimaryReading: defaultExportService.selectPrimaryReading,
};

