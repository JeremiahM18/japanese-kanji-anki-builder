const path = require("node:path");

const { createInferenceEngine } = require("../inference/inferenceEngine");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { selectBestAudioAsset } = require("./audioService");
const { mapWithConcurrency } = require("../utils/concurrency");
const { labelKunReading, labelOnReading, tsvEscape } = require("../utils/text");

const ANKI_FIELD_NAMES = loadAnkiNoteSchema().fieldNames;

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

function createExportService({ inferenceEngine = createInferenceEngine() } = {}) {
    async function buildRowForKanji({
        kanji,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
    }) {
        try {
            const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
            const [kanjiInfo, words, mediaFields] = await Promise.all([
                kanjiApiClient.getKanji(kanji),
                skipWordFetch ? Promise.resolve([]) : kanjiApiClient.getWords(kanji),
                resolveManagedMediaFields({ kanji, strokeOrderService, audioService }),
            ]);

            const inferred = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 3,
            });
            const displayWord = selectDisplayWord({ kanji, displayWord: inferred.displayWord, bestWord: inferred.bestWord });
            const primaryReading = selectPrimaryReading(inferred);
            const onReading = labelOnReading(kanjiInfo?.on_readings);
            const kunReading = labelKunReading(kanjiInfo?.kun_readings);
            const components = kradMap.get(kanji) || [];
            const radical = pickMainComponent(components);
            const exampleSentence = formatExampleSentence(inferred.sentenceCandidates[0]);

            return [
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
            ].map(tsvEscape).join("\t");
        } catch (error) {
            return [
                kanji,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                `ERROR: ${error instanceof Error ? error.message : String(error)}`,
                "",
            ].map(tsvEscape).join("\t");
        }
    }

    async function buildInferenceForKanji({ kanji, kanjiApiClient, strokeOrderService, audioService }) {
        const skipWordFetch = shouldSkipWordFetch(inferenceEngine, kanji);
        const [kanjiInfo, words, mediaFields] = await Promise.all([
            kanjiApiClient.getKanji(kanji),
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
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
            })
        );

        return [header, ...rows].join("\n");
    }

    return {
        buildInferenceForKanji,
        buildRowForKanji,
        buildTsvForJlptLevel,
        formatAnkiAudioField,
        formatAnkiStrokeOrderField,
        formatExampleSentence,
        mapWithConcurrency,
        resolveManagedMediaFields,
        shouldSkipWordFetch,
        resolveStrokeOrderFields,
        selectDisplayWord,
        selectPrimaryReading,
    };
}

const defaultExportService = createExportService();

module.exports = {
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
    resolveStrokeOrderFields: defaultExportService.resolveStrokeOrderFields,
    selectDisplayWord: defaultExportService.selectDisplayWord,
    selectPrimaryReading: defaultExportService.selectPrimaryReading,
};
