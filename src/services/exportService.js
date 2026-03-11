const path = require("node:path");

const { createInferenceEngine } = require("../inference/inferenceEngine");
const { labelReading, tsvEscape } = require("../utils/text");

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

function createExportService({ inferenceEngine = createInferenceEngine() } = {}) {
    async function mapWithConcurrency(items, concurrency, mapper) {
        const results = new Array(items.length);
        let nextIndex = 0;

        async function worker() {
            while (true) {
                const currentIndex = nextIndex++;

                if (currentIndex >= items.length) {
                    return;
                }

                results[currentIndex] = await mapper(items[currentIndex], currentIndex);
            }
        }

        const safeConcurrency = Math.max(1, Number(concurrency) || 1);
        const workerCount = Math.min(safeConcurrency, Math.max(1, items.length));

        await Promise.all(
            Array.from({ length: workerCount }, () => worker())
        );

        return results;
    }

    async function buildRowForKanji({
        kanji,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
    }) {
        try {
            const [kanjiInfo, words, strokeOrderPath, audioPath] = await Promise.all([
                kanjiApiClient.getKanji(kanji),
                kanjiApiClient.getWords(kanji),
                typeof strokeOrderService?.getBestStrokeOrderPath === "function"
                    ? strokeOrderService.getBestStrokeOrderPath(kanji)
                    : Promise.resolve(""),
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
            const reading = labelReading(kanjiInfo?.on_readings, kanjiInfo?.kun_readings);
            const components = kradMap.get(kanji) || [];
            const radical = pickMainComponent(components);
            const exampleSentence = formatExampleSentence(inferred.sentenceCandidates[0]);

            return [
                kanji,
                inferred.meaningJP,
                reading,
                formatAnkiStrokeOrderField(strokeOrderPath),
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
                `ERROR: ${error instanceof Error ? error.message : String(error)}`,
                "",
            ].map(tsvEscape).join("\t");
        }
    }

    async function buildInferenceForKanji({ kanji, kanjiApiClient, strokeOrderService, audioService }) {
        const [kanjiInfo, words, strokeOrderPath, audioPath] = await Promise.all([
            kanjiApiClient.getKanji(kanji),
            kanjiApiClient.getWords(kanji),
            typeof strokeOrderService?.getBestStrokeOrderPath === "function"
                ? strokeOrderService.getBestStrokeOrderPath(kanji)
                : Promise.resolve(""),
            typeof audioService?.getBestAudioPath === "function"
                ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
                : Promise.resolve(""),
        ]);

        return {
            ...inferenceEngine.inferKanjiStudyData({
                kanji,
                kanjiInfo,
                words,
                maxExamples: 3,
                maxSentences: 4,
            }),
            reading: labelReading(kanjiInfo?.on_readings, kanjiInfo?.kun_readings),
            strokeOrderPath,
            strokeOrderField: formatAnkiStrokeOrderField(strokeOrderPath),
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
        const header = [
            "Kanji",
            "MeaningJP",
            "Reading",
            "StrokeOrder",
            "Audio",
            "Radical",
            "Notes",
            "ExampleSentence",
        ].join("\t");

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
};
