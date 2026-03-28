const { buildMeaningJP, pickBestEnglishMeaning } = require("../inference/meaningInference");
const { labelReading } = require("../utils/text");

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

function buildOfflineReading(jlptEntry) {
    if (!jlptEntry || typeof jlptEntry !== "object") {
        return "";
    }

    return labelReading(jlptEntry.on_readings, jlptEntry.kun_readings);
}

function buildOfflineMeaning(jlptEntry, curatedEntry, sentenceCandidate, kanji) {
    const displayWord = curatedEntry?.displayWord?.written
        ? { written: curatedEntry.displayWord.written, pron: curatedEntry.displayWord.pron || "" }
        : { written: curatedEntry?.preferredWords?.[0] || sentenceCandidate?.written || "", pron: "" };
    const englishMeaning = curatedEntry?.englishMeaning || pickBestEnglishMeaning(jlptEntry?.meanings || []);

    if (displayWord?.written && englishMeaning) {
        return buildMeaningJP(displayWord, englishMeaning);
    }

    return englishMeaning || displayWord?.written || (kanji || "");
}

function summarizeLevel(level, levelKanji, jlptOnlyJson, sentenceCorpus, curatedStudyData) {
    let readingCovered = 0;
    let meaningCovered = 0;
    let exampleCovered = 0;
    let contextualNotesCovered = 0;
    let genericNotesFallback = 0;

    const sampleMissing = {
        reading: [],
        meaning: [],
        example: [],
        contextualNotes: [],
    };

    for (const kanji of levelKanji) {
        const jlptEntry = jlptOnlyJson[kanji] || {};
        const curatedEntry = curatedStudyData[kanji] || null;
        const sentenceCandidate = buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus);

        const hasReading = Boolean(buildOfflineReading(jlptEntry));
        const hasMeaning = Boolean(buildOfflineMeaning(jlptEntry, curatedEntry, sentenceCandidate, kanji));
        const hasExample = Boolean(sentenceCandidate?.japanese && sentenceCandidate?.english);
        const hasContextualNotes = Boolean(
            curatedEntry?.notes
            || (Array.isArray(curatedEntry?.alternativeNotes) && curatedEntry.alternativeNotes.length > 0)
            || hasExample
        );

        if (hasReading) {
            readingCovered += 1;
        } else if (sampleMissing.reading.length < 5) {
            sampleMissing.reading.push(kanji);
        }

        if (hasMeaning) {
            meaningCovered += 1;
        } else if (sampleMissing.meaning.length < 5) {
            sampleMissing.meaning.push(kanji);
        }

        if (hasExample) {
            exampleCovered += 1;
        } else if (sampleMissing.example.length < 5) {
            sampleMissing.example.push(kanji);
        }

        if (hasContextualNotes) {
            contextualNotesCovered += 1;
        } else {
            genericNotesFallback += 1;
            if (sampleMissing.contextualNotes.length < 5) {
                sampleMissing.contextualNotes.push(kanji);
            }
        }
    }

    const totalKanji = levelKanji.length;
    const ratio = (count) => totalKanji > 0 ? count / totalKanji : 0;

    return {
        level,
        totalKanji,
        readingCovered,
        meaningCovered,
        exampleCovered,
        contextualNotesCovered,
        genericNotesFallback,
        readingCoverageRatio: ratio(readingCovered),
        meaningCoverageRatio: ratio(meaningCovered),
        exampleCoverageRatio: ratio(exampleCovered),
        contextualNotesCoverageRatio: ratio(contextualNotesCovered),
        genericNotesFallbackRatio: ratio(genericNotesFallback),
        sampleMissing,
    };
}

function buildCardQualitySummary({ jlptOnlyJson = {}, sentenceCorpus = [], curatedStudyData = {}, levels = [5, 4, 3, 2, 1] } = {}) {
    const requestedLevels = [...new Set((Array.isArray(levels) ? levels : [5, 4, 3, 2, 1]).filter((level) => Number.isInteger(level)))];
    const jlptEntries = Object.entries(jlptOnlyJson || {});

    const rows = requestedLevels
        .map((level) => {
            const levelKanji = jlptEntries
                .filter(([, entry]) => entry?.jlpt === level)
                .map(([kanji]) => kanji);

            return summarizeLevel(level, levelKanji, jlptOnlyJson, sentenceCorpus, curatedStudyData);
        })
        .sort((a, b) => a.level - b.level);

    return {
        levels: rows,
    };
}

module.exports = {
    buildCardQualitySummary,
    buildOfflineMeaning,
    buildOfflineReading,
    buildOfflineSentenceCandidate,
};
