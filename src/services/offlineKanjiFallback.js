const { pickMainComponent } = require("../datasets/kradfile");
const { buildMeaningJP } = require("../inference/meaningInference");
const { labelKunReading, labelOnReading } = require("../utils/text");
const { katakanaToHiragana } = require("../utils/japanese");

function normalizeOfflineReading(value) {
    return katakanaToHiragana(String(value || ""))
        .replace(/[.・]/g, "")
        .replace(/-/g, "")
        .replace(/\s+/g, "")
        .trim();
}

function hasOnlyTargetKanji(value, kanji) {
    const kanjiChars = String(value || "").match(/\p{Script=Han}/gu) || [];
    return kanjiChars.length > 0 && kanjiChars.every((char) => char === kanji);
}

function selectFallbackReadingFromJlptEntry(jlptEntry) {
    const readings = [
        ...(Array.isArray(jlptEntry?.kun_readings) ? jlptEntry.kun_readings : []),
        ...(Array.isArray(jlptEntry?.on_readings) ? jlptEntry.on_readings : []),
    ].map(normalizeOfflineReading).filter(Boolean);

    return readings[0] || "";
}

function selectOfflinePrimaryReading({ kanji, curatedEntry, jlptEntry }) {
    const breakdownWord = curatedEntry?.breakdownDisplayWord?.written;
    const breakdownPron = curatedEntry?.breakdownDisplayWord?.pron;
    if (breakdownPron && hasOnlyTargetKanji(breakdownWord, kanji)) {
        return String(breakdownPron).trim();
    }

    const displayWord = curatedEntry?.displayWord?.written;
    const displayPron = curatedEntry?.displayWord?.pron;
    if (displayPron && hasOnlyTargetKanji(displayWord, kanji)) {
        return String(displayPron).trim();
    }

    return selectFallbackReadingFromJlptEntry(jlptEntry);
}

function selectOfflineDisplayWord({ kanji, curatedEntry, jlptEntry }) {
    return {
        written: String(kanji || "").trim(),
        pron: selectOfflinePrimaryReading({ kanji, curatedEntry, jlptEntry }),
    };
}

function buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus) {
    if (curatedEntry?.exampleSentence) {
        return {
            type: "curated",
            japanese: curatedEntry.exampleSentence.japanese,
            reading: curatedEntry.exampleSentence.reading || "",
            english: curatedEntry.exampleSentence.english,
            written: curatedEntry.displayWord?.written || curatedEntry.preferredWords?.[0] || kanji,
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

function buildOfflineMeaning({ kanji, curatedEntry, jlptEntry }) {
    const displayWord = selectOfflineDisplayWord({ kanji, curatedEntry, jlptEntry });
    const englishMeaning = String(curatedEntry?.englishMeaning || "").trim();

    if (displayWord?.written && englishMeaning) {
        return buildMeaningJP(displayWord, englishMeaning);
    }

    if (englishMeaning) {
        return englishMeaning;
    }

    const jlptMeanings = Array.isArray(jlptEntry?.meanings) ? jlptEntry.meanings.filter(Boolean) : [];
    if (jlptMeanings.length > 0) {
        return jlptMeanings.join(", ");
    }

    return displayWord?.written || String(kanji || "").trim();
}

function buildOfflineNotes({ kanji, curatedEntry, sentenceCandidate, jlptEntry }) {
    const curatedNotes = String(curatedEntry?.notes || "").trim();
    if (curatedNotes) {
        return curatedNotes;
    }

    if (Array.isArray(curatedEntry?.alternativeNotes) && curatedEntry.alternativeNotes.length > 0) {
        return curatedEntry.alternativeNotes.join(" ／ ");
    }

    if (sentenceCandidate?.written && sentenceCandidate?.english) {
        return `Local example uses ${sentenceCandidate.written} to illustrate ${kanji}.`;
    }

    const meanings = Array.isArray(jlptEntry?.meanings) ? jlptEntry.meanings.filter(Boolean) : [];
    if (meanings.length > 0) {
        return `Local fallback meaning: ${meanings.join(", ")}`;
    }

    return `Local fallback generated for ${kanji}. Add curated notes for richer output.`;
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

async function resolveOfflineMedia({ kanji, strokeOrderService, audioService, audioReading = "" }) {
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
            ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji, reading: audioReading })
            : Promise.resolve(""),
    ]);

    return {
        strokeOrderPath,
        strokeOrderImagePath,
        strokeOrderAnimationPath,
        audioPath,
    };
}

async function buildOfflineFallbackCard({
    kanji,
    levelLabel = "",
    jlptEntry,
    curatedStudyData,
    sentenceCorpus,
    kradMap,
    strokeOrderService,
    audioService,
}) {
    const curatedEntry = curatedStudyData?.[kanji] || null;
    const sentenceCandidate = buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus);
    const displayWord = selectOfflineDisplayWord({ kanji, curatedEntry, jlptEntry });
    const primaryReading = displayWord.pron;
    const readingFields = buildOfflineReadingFields(jlptEntry);
    const media = await resolveOfflineMedia({ kanji, strokeOrderService, audioService, audioReading: primaryReading });

    return {
        kanji,
        levelLabel,
        previewMode: "offline-local-fallback",
        displayWord: displayWord.written,
        primaryReading,
        meaningJP: buildOfflineMeaning({ kanji, curatedEntry, sentenceCandidate, jlptEntry }),
        onReading: readingFields.onReading,
        kunReading: readingFields.kunReading,
        radical: pickMainComponent(kradMap.get(kanji) || []),
        notes: buildOfflineNotes({ kanji, curatedEntry, sentenceCandidate, jlptEntry }),
        exampleSentence: sentenceCandidate
            ? [sentenceCandidate.japanese, sentenceCandidate.reading, sentenceCandidate.english]
                .map((value) => String(value || "").trim())
                .filter(Boolean)
                .join(" ／ ")
            : "",
        media,
    };
}

module.exports = {
    buildOfflineFallbackCard,
    buildOfflineMeaning,
    buildOfflineNotes,
    buildOfflineReadingFields,
    buildOfflineSentenceCandidate,
    resolveOfflineMedia,
    selectOfflineDisplayWord,
    selectOfflinePrimaryReading,
};

