const path = require("node:path");

const { createInferenceEngine } = require("../inference/inferenceEngine");
const { loadAnkiNoteSchema } = require("../config/ankiNoteSchema");
const { mapWithConcurrency } = require("../utils/concurrency");
const { labelKunReading, labelOnReading, labelReading, tsvEscape } = require("../utils/text");

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
            const [kanjiInfo, words, strokeOrderFields, audioPath] = await Promise.all([
                kanjiApiClient.getKanji(kanji),
                kanjiApiClient.getWords(kanji),
                resolveStrokeOrderFields(strokeOrderService, kanji),
                typeof audioService?.getBestAudioPath === "function"
                    ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
                    : Promise.resolve(""),
            ]);

            const inferred = inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 3,
            });
            const primaryReading = selectPrimaryReading(inferred);
            const onReading = labelOnReading(kanjiInfo?.on_readings);
            const kunReading = labelKunReading(kanjiInfo?.kun_readings);
            const components = kradMap.get(kanji) || [];
            const radical = pickMainComponent(components);
            const exampleSentence = formatExampleSentence(inferred.sentenceCandidates[0]);

            return [
                kanji,
                inferred.meaningJP,
                primaryReading,
                onReading,
                kunReading,
                formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderPath),
                formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderImagePath),
                formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderAnimationPath),
                formatAnkiAudioField(audioPath),
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
                `ERROR: ${error instanceof Error ? error.message : String(error)}`,
                "",
            ].map(tsvEscape).join("\t");
        }
    }

    async function buildInferenceForKanji({ kanji, kanjiApiClient, strokeOrderService, audioService }) {
        const [kanjiInfo, words, strokeOrderFields, audioPath] = await Promise.all([
            kanjiApiClient.getKanji(kanji),
            kanjiApiClient.getWords(kanji),
            resolveStrokeOrderFields(strokeOrderService, kanji),
            typeof audioService?.getBestAudioPath === "function"
                ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
                : Promise.resolve(""),
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
            primaryReading: selectPrimaryReading(inferred),
            onReading,
            kunReading,
            reading: labelReading(kanjiInfo?.on_readings, kanjiInfo?.kun_readings),
            strokeOrderPath: strokeOrderFields.strokeOrderPath,
            strokeOrderField: formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderPath),
            strokeOrderImagePath: strokeOrderFields.strokeOrderImagePath,
            strokeOrderImageField: formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderImagePath),
            strokeOrderAnimationPath: strokeOrderFields.strokeOrderAnimationPath,
            strokeOrderAnimationField: formatAnkiStrokeOrderField(strokeOrderFields.strokeOrderAnimationPath),
            audioPath,
            audioField: formatAnkiAudioField(audioPath),
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
        resolveStrokeOrderFields,
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
    resolveStrokeOrderFields: defaultExportService.resolveStrokeOrderFields,
    selectPrimaryReading: defaultExportService.selectPrimaryReading,
};
