const { createInferenceEngine } = require("../inference/inferenceEngine");
const { pickMainComponent } = require("../datasets/kradfile");
const { createExportService, formatExampleSentence } = require("./exportService");
const { buildOfflineFallbackCard, buildOfflineSentenceCandidate } = require("./offlineKanjiFallback");
const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");

function formatPreviewError(err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "fetch failed") {
        return "Preview used local fallback data because the kanji API could not be reached and no cached entry was available.";
    }

    return message;
}

function selectPreviewKanji({ jlptOnlyJson, level, limit, kanji }) {
    if (Array.isArray(kanji) && kanji.length > 0) {
        return [...new Set(kanji)];
    }

    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = level == null ? [5] : [level];
    const selected = levels.flatMap((entryLevel) => buckets.get(entryLevel) || []);

    if (Number.isFinite(limit) && limit > 0) {
        return selected.slice(0, limit);
    }

    return selected;
}

async function buildPreviewCards({
    kanjiList,
    jlptOnlyJson,
    curatedStudyData,
    sentenceCorpus,
    kradMap,
    kanjiApiClient,
    strokeOrderService,
    audioService,
    exportService = createExportService({
        inferenceEngine: createInferenceEngine({ sentenceCorpus, curatedStudyData }),
        curatedStudyData,
        sentenceCorpus,
    }),
}) {
    const cards = [];

    for (const kanji of kanjiList) {
        const jlptEntry = jlptOnlyJson[kanji] || null;
        const levelLabel = `N${jlptEntry?.jlpt || "?"}`;

        try {
            const inference = await exportService.buildInferenceForKanji({
                kanji,
                kanjiApiClient,
                strokeOrderService,
                audioService,
            });
            cards.push({
                kanji,
                levelLabel,
                previewMode: "full-inference",
                displayWord: inference.displayWordText,
                meaningJP: inference.meaningJP,
                primaryReading: inference.primaryReading,
                onReading: inference.onReading,
                kunReading: inference.kunReading,
                radical: pickMainComponent(kradMap.get(kanji) || []),
                notes: inference.notes,
                exampleSentence: formatExampleSentence(inference.sentenceCandidates?.[0]),
                media: {
                    strokeOrderPath: inference.strokeOrderPath,
                    strokeOrderImagePath: inference.strokeOrderImagePath,
                    strokeOrderAnimationPath: inference.strokeOrderAnimationPath,
                    audioPath: inference.audioPath,
                },
                fields: {
                    strokeOrderField: inference.strokeOrderField,
                    strokeOrderImageField: inference.strokeOrderImageField,
                    strokeOrderAnimationField: inference.strokeOrderAnimationField,
                    audioField: inference.audioField,
                },
            });
        } catch (err) {
            const fallbackCard = await buildOfflineFallbackCard({
                kanji,
                levelLabel,
                jlptEntry,
                curatedStudyData,
                sentenceCorpus,
                kradMap,
                strokeOrderService,
                audioService,
            });

            fallbackCard.warning = formatPreviewError(err);
            fallbackCard.fields = {
                strokeOrderField: "",
                strokeOrderImageField: "",
                strokeOrderAnimationField: "",
                audioField: "",
            };
            cards.push(fallbackCard);
        }
    }

    return cards;
}

module.exports = {
    buildOfflineFallbackCard,
    buildOfflineSentenceCandidate,
    buildPreviewCards,
    formatPreviewError,
    selectPreviewKanji,
};

