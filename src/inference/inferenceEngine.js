const { extractWordCandidates } = require("./candidateExtractor");
const { buildMeaningJP, inferMeaning } = require("./meaningInference");
const { inferNotes } = require("./notesInference");
const { rankWordCandidates } = require("./ranking");
const { inferSentenceCandidates } = require("./sentenceInference");

/** @typedef {import("../types/contracts").InferenceResult} InferenceResult */
/** @typedef {import("../types/contracts").RankedCandidate} RankedCandidate */
/** @typedef {import("../types/contracts").SentenceCandidate} SentenceCandidate */
/** @typedef {import("../types/contracts").CuratedInferenceInfo} CuratedInferenceInfo */

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

function formatMeaningDisplayWord(bestWord) {
    return buildMeaningJP(bestWord, "");
}

function buildCuratedDisplayWord(curatedEntry, rankedCandidates) {
    const written = String(curatedEntry?.displayWord?.written || "").trim();
    const pron = String(curatedEntry?.displayWord?.pron || "").trim();

    if (!written) {
        return null;
    }

    const candidates = Array.isArray(rankedCandidates) ? rankedCandidates.filter(Boolean) : [];
    const exactPronMatch = candidates.find((candidate) => candidate.written === written && candidate.pron === pron);
    if (exactPronMatch) {
        return exactPronMatch;
    }

    const exactWrittenMatch = candidates.find((candidate) => candidate.written === written);
    if (exactWrittenMatch) {
        return {
            ...exactWrittenMatch,
            pron,
        };
    }

    return {
        written,
        pron,
        gloss: "",
        text: "",
        score: Number.MAX_SAFE_INTEGER,
        corpusSupportScore: 0,
        scoreBreakdown: {
            heuristic: [],
            corpusSupport: [],
            totals: {
                heuristicScore: 0,
                corpusSupportScore: 0,
                finalScore: 0,
            },
        },
    };
}

function buildCuratedSentence(curatedEntry, bestWord, displayWord) {
    if (!curatedEntry?.exampleSentence) {
        return null;
    }

    return {
        type: "curated",
        japanese: curatedEntry.exampleSentence.japanese,
        reading: curatedEntry.exampleSentence.reading || bestWord?.pron || displayWord?.pron || "",
        english: curatedEntry.exampleSentence.english,
        sourceWord: bestWord?.written || "",
        score: Number.MAX_SAFE_INTEGER,
        source: curatedEntry.exampleSentence.source || "curated-study-data",
        tags: Array.isArray(curatedEntry.exampleSentence.tags) ? curatedEntry.exampleSentence.tags : ["curated"],
    };
}

function filterBlockedSentenceCandidates(sentenceCandidates, curatedEntry) {
    const blockedPhrases = Array.isArray(curatedEntry?.blockedSentencePhrases)
        ? curatedEntry.blockedSentencePhrases.filter(Boolean)
        : [];

    if (blockedPhrases.length === 0) {
        return sentenceCandidates;
    }

    return sentenceCandidates.filter((sentence) => {
        const haystack = `${sentence?.japanese || ""}\n${sentence?.english || ""}`;
        return !blockedPhrases.some((phrase) => haystack.includes(phrase));
    });
}

function prependCuratedSentence(sentenceCandidates, curatedEntry, bestWord, displayWord, maxSentences) {
    const curatedSentence = buildCuratedSentence(curatedEntry, bestWord, displayWord);

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
    const displayWord = buildCuratedDisplayWord(curatedEntry, rankedCandidates) || meaning.displayWord || bestWord;
    const meaningJP = displayWord && englishMeaning
        ? `${formatMeaningDisplayWord(displayWord)} ／ ${englishMeaning}`
        : meaning.meaningJP;

    return {
        bestWord,
        displayWord,
        englishMeaning,
        meaningJP,
    };
}

function hasFullyCuratedKanjiEntry(curatedEntry) {
    return Boolean(
        curatedEntry?.displayWord?.written
        && curatedEntry?.displayWord?.pron
        && curatedEntry?.englishMeaning
        && curatedEntry?.notes
        && curatedEntry?.exampleSentence?.japanese
        && (curatedEntry?.exampleSentence?.reading || curatedEntry?.displayWord?.pron)
        && curatedEntry?.exampleSentence?.english
    );
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
    return {
        hasFullyCuratedKanjiEntry(kanji) {
            return hasFullyCuratedKanjiEntry(getCuratedEntry(curatedStudyData, kanji));
        },

        inferKanjiStudyData({ kanji, kanjiInfo, words, maxExamples = 3, maxSentences = 3 }) {
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
            const meaning = applyCuratedMeaning(inferMeaning({ kanji, kanjiMeanings, rankedCandidates }), curatedEntry, rankedCandidates);
            const notes = applyCuratedNotes(inferNotes({ kanji, rankedCandidates, maxExamples }), curatedEntry);
            const sentenceCandidates = prependCuratedSentence(
                filterBlockedSentenceCandidates(
                    inferSentenceCandidates({
                        rankedCandidates,
                        kanji,
                        sentenceCorpus,
                        maxSentences,
                    }),
                    curatedEntry
                ),
                curatedEntry,
                meaning.bestWord,
                meaning.displayWord,
                maxSentences
            );

            const curated = curatedEntry ? {
                hasOverride: true,
                source: curatedEntry.source,
                tags: curatedEntry.tags,
                jlpt: curatedEntry.jlpt ?? null,
                preferredWords: curatedEntry.preferredWords,
                blockedWords: curatedEntry.blockedWords,
                blockedSentencePhrases: curatedEntry.blockedSentencePhrases,
                alternativeNotes: curatedEntry.alternativeNotes,
                hasCustomNotes: Boolean(curatedEntry.notes),
                hasCustomExampleSentence: Boolean(curatedEntry.exampleSentence),
                hasCustomMeaning: Boolean(curatedEntry.englishMeaning),
                hasCustomDisplayWord: Boolean(curatedEntry.displayWord?.written),
            } : {
                hasOverride: false,
            };

            return {
                kanji,
                kanjiMeanings,
                candidates: rankedCandidates,
                bestWord: meaning.bestWord,
                displayWord: meaning.displayWord,
                englishMeaning: meaning.englishMeaning,
                meaningJP: meaning.meaningJP,
                notes: notes.notes,
                sentenceCandidates,
                curated,
            };
        },
    };
}

module.exports = {
    applyBlockedWords,
    applyCuratedMeaning,
    applyCuratedNotes,
    applyPreferredWords,
    buildCuratedDisplayWord,
    createInferenceEngine,
    filterBlockedSentenceCandidates,
    formatMeaningDisplayWord,
    hasFullyCuratedKanjiEntry,
    getCuratedEntry,
    prependCuratedSentence,
};
