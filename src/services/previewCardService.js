const { pickMainComponent } = require("../datasets/kradfile");
const { buildJlptBuckets } = require("../datasets/sentenceCorpusCoverage");
const { createInferenceEngine } = require("../inference/inferenceEngine");
const { buildMeaningJP } = require("../inference/meaningInference");
const { createExportService, formatExampleSentence, selectPrimaryReading } = require("./exportService");
const { labelKunReading, labelOnReading } = require("../utils/text");

function formatPreviewError(err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "fetch failed") {
        return "Preview used local fallback data because the kanji API could not be reached and no cached entry was available.";
    }

    return message;
}

function buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus) {
    if (curatedEntry?.exampleSentence) {
        return {
            type: "curated",
            japanese: curatedEntry.exampleSentence.japanese,
            reading: curatedEntry.exampleSentence.reading || "",
            english: curatedEntry.exampleSentence.english,
            written: curatedEntry.preferredWords?.[0] || kanji,
            source: curatedEntry.exampleSentence.source || "curated-study-data",
        };
    }

    const matches = (Array.isArray(sentenceCorpus) ? sentenceCorpus : [])
        .filter((entry) => entry.kanji === kanji)
        .sort((a, b) => {
            const aReading = a.reading ? 1 : 0;
            const bReading = b.reading ? 1 : 0;
            const readingDiff = bReading - aReading;
            if (readingDiff !== 0) {
                return readingDiff;
            }

            const aFreq = Number.isInteger(a.frequencyRank) ? a.frequencyRank : Number.MAX_SAFE_INTEGER;
            const bFreq = Number.isInteger(b.frequencyRank) ? b.frequencyRank : Number.MAX_SAFE_INTEGER;
            if (aFreq !== bFreq) {
                return aFreq - bFreq;
            }

            return String(a.japanese || "").length - String(b.japanese || "").length;
        });

    if (matches.length === 0) {
        return null;
    }

    const best = matches[0];
    return {
        type: "corpus",
        japanese: best.japanese,
        reading: best.reading || "",
        english: best.english,
        written: best.written || kanji,
        source: best.source || "local-corpus",
    };
}

function buildOfflineMeaning({ kanji, curatedEntry, sentenceCandidate }) {
    const displayWord = curatedEntry?.displayWord?.written
        ? { written: curatedEntry.displayWord.written, pron: curatedEntry.displayWord.pron || "" }
        : { written: curatedEntry?.preferredWords?.[0] || sentenceCandidate?.written || kanji, pron: "" };
    const englishMeaning = curatedEntry?.englishMeaning || "";

    if (displayWord?.written && englishMeaning) {
        return buildMeaningJP(displayWord, englishMeaning);
    }

    if (englishMeaning) {
        return englishMeaning;
    }

    return displayWord?.written || "";
}

function buildOfflineNotes({ curatedEntry, sentenceCandidate }) {
    if (curatedEntry?.notes) {
        return curatedEntry.notes;
    }

    if (Array.isArray(curatedEntry?.alternativeNotes) && curatedEntry.alternativeNotes.length > 0) {
        return curatedEntry.alternativeNotes.join(" ／ ");
    }

    if (sentenceCandidate?.written && sentenceCandidate?.english) {
        return `Local example uses ${sentenceCandidate.written} to illustrate this kanji.`;
    }

    return "Offline preview built from local data only. Add curated meanings or cached API data for richer output.";
}

function buildOfflineReadingFields(jlptEntry) {
    if (!jlptEntry || typeof jlptEntry !== "object") {
        return {
            onReading: "",
            kunReading: "",
        };
    }

    return {
        onReading: labelOnReading(jlptEntry.on_readings),
        kunReading: labelKunReading(jlptEntry.kun_readings),
    };
}

async function buildOfflineFallbackCard({
    kanji,
    levelLabel,
    jlptEntry,
    curatedStudyData,
    sentenceCorpus,
    kradMap,
    strokeOrderService,
    audioService,
}) {
    const curatedEntry = curatedStudyData[kanji] || null;
    const sentenceCandidate = buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus);
    const displayWord = curatedEntry?.displayWord?.written
        ? { written: curatedEntry.displayWord.written, pron: curatedEntry.displayWord.pron || "" }
        : { written: curatedEntry?.preferredWords?.[0] || sentenceCandidate?.written || kanji, pron: "" };
    const primaryReading = selectPrimaryReading({
        displayWord,
        bestWord: sentenceCandidate?.reading ? { pron: sentenceCandidate.reading } : null,
    });
    const readingFields = buildOfflineReadingFields(jlptEntry);
    const [strokeOrderImagePath, strokeOrderAnimationPath, strokeOrderPath, audioPath] = await Promise.all([
        typeof strokeOrderService?.getStrokeOrderImagePath === "function"
            ? strokeOrderService.getStrokeOrderImagePath(kanji)
            : Promise.resolve(""),
        typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
            ? strokeOrderService.getStrokeOrderAnimationPath(kanji)
            : Promise.resolve(""),
        typeof strokeOrderService?.getBestStrokeOrderPath === "function"
            ? strokeOrderService.getBestStrokeOrderPath(kanji)
            : Promise.resolve(""),
        typeof audioService?.getBestAudioPath === "function"
            ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
            : Promise.resolve(""),
    ]);

    return {
        kanji,
        levelLabel,
        previewMode: "offline-local-fallback",
        warning: "Preview rendered from local data because online kanji enrichment was unavailable.",
        meaningJP: buildOfflineMeaning({ kanji, curatedEntry, sentenceCandidate }),
        primaryReading,
        onReading: readingFields.onReading,
        kunReading: readingFields.kunReading,
        radical: pickMainComponent(kradMap.get(kanji) || []),
        notes: buildOfflineNotes({ curatedEntry, sentenceCandidate }),
        exampleSentence: formatExampleSentence(sentenceCandidate),
        media: {
            strokeOrderPath,
            strokeOrderImagePath,
            strokeOrderAnimationPath,
            audioPath,
        },
        fields: {
            strokeOrderField: "",
            strokeOrderImageField: "",
            strokeOrderAnimationField: "",
            audioField: "",
        },
    };
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
            const radical = pickMainComponent(kradMap.get(kanji) || []);
            cards.push({
                kanji,
                levelLabel,
                previewMode: "full-inference",
                meaningJP: inference.meaningJP,
                primaryReading: inference.primaryReading,
                onReading: inference.onReading,
                kunReading: inference.kunReading,
                radical,
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
            cards.push(fallbackCard);
        }
    }

    return cards;
}

module.exports = {
    buildOfflineFallbackCard,
    buildOfflineMeaning,
    buildOfflineNotes,
    buildOfflineReadingFields,
    buildOfflineSentenceCandidate,
    buildPreviewCards,
    formatPreviewError,
    selectPreviewKanji,
};
