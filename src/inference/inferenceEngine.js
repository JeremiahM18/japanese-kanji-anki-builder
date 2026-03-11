const { extractWordCandidates } = require("./candidateExtractor");
const { inferMeaning } = require("./meaningInference");
const { inferNotes } = require("./notesInference");
const { rankWordCandidates } = require("./ranking");
const { inferSentenceCandidates } = require("./sentenceInference");

function getCuratedEntry(curatedStudyData, kanji) {
    if (!curatedStudyData || typeof curatedStudyData !== "object") {
        return null;
    }

    return curatedStudyData[kanji] || null;
}

function applyBlockedWords(rankedCandidates, curatedEntry) {
    const blockedWords = new Set(Array.isArray(curatedEntry?.blockedWords) ? curatedEntry.blockedWords : []);

    if (blockedWords.size === 0) {
        return rankedCandidates;
    }

    return rankedCandidates.filter((candidate) => !blockedWords.has(candidate.written));
}

function applyPreferredWords(rankedCandidates, curatedEntry) {
    const preferredWords = Array.isArray(curatedEntry?.preferredWords) ? curatedEntry.preferredWords : [];

    if (preferredWords.length === 0) {
        return rankedCandidates;
    }

    const preferredOrder = new Map(preferredWords.map((written, index) => [written, index]));
    const preferred = [];
    const remaining = [];

    for (const candidate of rankedCandidates) {
        if (preferredOrder.has(candidate.written)) {
            preferred.push(candidate);
        } else {
            remaining.push(candidate);
        }
    }

    preferred.sort((a, b) => preferredOrder.get(a.written) - preferredOrder.get(b.written));
    return [...preferred, ...remaining];
}

function buildCuratedSentence(curatedEntry, bestWord) {
    if (!curatedEntry?.exampleSentence) {
        return null;
    }

    return {
        type: "curated",
        japanese: curatedEntry.exampleSentence.japanese,
        reading: curatedEntry.exampleSentence.reading || bestWord?.pron || "",
        english: curatedEntry.exampleSentence.english,
        sourceWord: bestWord?.written || "",
        score: Number.MAX_SAFE_INTEGER,
        source: curatedEntry.exampleSentence.source || "curated-study-data",
        tags: Array.isArray(curatedEntry.exampleSentence.tags) ? curatedEntry.exampleSentence.tags : ["curated"],
    };
}

function prependCuratedSentence(sentenceCandidates, curatedEntry, bestWord, maxSentences) {
    const curatedSentence = buildCuratedSentence(curatedEntry, bestWord);

    if (!curatedSentence) {
        return sentenceCandidates;
    }

    const out = [curatedSentence];
    const seen = new Set([`${curatedSentence.japanese}|${curatedSentence.english}`]);

    for (const sentence of sentenceCandidates) {
        if (out.length >= maxSentences) {
            break;
        }

        const dedupeKey = `${sentence.japanese}|${sentence.english}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        out.push(sentence);
    }

    return out;
}

function applyCuratedMeaning(meaning, curatedEntry, rankedCandidates) {
    const bestWord = rankedCandidates[0] || null;
    const englishMeaning = curatedEntry?.englishMeaning || meaning.englishMeaning;
    const meaningJP = bestWord && englishMeaning
        ? `${bestWord.written} （${bestWord.pron}） ／ ${englishMeaning}`
        : meaning.meaningJP;

    return {
        bestWord,
        englishMeaning,
        meaningJP,
    };
}

function applyCuratedNotes(notes, curatedEntry) {
    if (curatedEntry?.notes) {
        return {
            notes: curatedEntry.notes,
        };
    }

    return notes;
}

function createInferenceEngine({ sentenceCorpus = [], curatedStudyData = {} } = {}) {
    function inferKanjiStudyData({ kanji, kanjiInfo, words, maxExamples = 3, maxSentences = 3 }) {
        const kanjiMeanings = Array.isArray(kanjiInfo?.meanings) ? kanjiInfo.meanings : [];
        const extractedCandidates = extractWordCandidates(words);
        const curatedEntry = getCuratedEntry(curatedStudyData, kanji);
        const rankedCandidates = applyPreferredWords(
            applyBlockedWords(
                rankWordCandidates(extractedCandidates, kanji, kanjiMeanings, sentenceCorpus),
                curatedEntry
            ),
            curatedEntry
        );
        const meaning = applyCuratedMeaning(inferMeaning({ kanjiMeanings, rankedCandidates }), curatedEntry, rankedCandidates);
        const notes = applyCuratedNotes(inferNotes({ rankedCandidates, maxExamples }), curatedEntry);
        const sentenceCandidates = prependCuratedSentence(
            inferSentenceCandidates({
                rankedCandidates,
                kanji,
                sentenceCorpus,
                maxSentences,
            }),
            curatedEntry,
            meaning.bestWord,
            maxSentences
        );

        return {
            kanji,
            kanjiMeanings,
            candidates: rankedCandidates,
            bestWord: meaning.bestWord,
            englishMeaning: meaning.englishMeaning,
            meaningJP: meaning.meaningJP,
            notes: notes.notes,
            sentenceCandidates,
            curated: curatedEntry ? {
                hasOverride: true,
                preferredWords: curatedEntry.preferredWords,
                blockedWords: curatedEntry.blockedWords,
                hasCustomNotes: Boolean(curatedEntry.notes),
                hasCustomExampleSentence: Boolean(curatedEntry.exampleSentence),
                hasCustomMeaning: Boolean(curatedEntry.englishMeaning),
            } : {
                hasOverride: false,
            },
        };
    }

    return {
        inferKanjiStudyData,
    };
}

module.exports = {
    applyBlockedWords,
    applyCuratedMeaning,
    applyCuratedNotes,
    applyPreferredWords,
    createInferenceEngine,
    getCuratedEntry,
    prependCuratedSentence,
};
