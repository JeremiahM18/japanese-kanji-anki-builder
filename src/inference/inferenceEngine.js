const { extractWordCandidates } = require("./candidateExtractor");
const { inferMeaning } = require("./meaningInference");
const { inferNotes } = require("./notesInference");
const { rankWordCandidates } = require("./ranking");
const { inferSentenceCandidates } = require("./sentenceInference");

function createInferenceEngine() {
    function inferKanjiStudyData({ kanji, kanjiInfo, words, maxExamples = 3, maxSentences = 3 }) {
        const kanjiMeanings = Array.isArray(kanjiInfo?.meanings) ? kanjiInfo.meanings : [];
        const extractedCandidates = extractWordCandidates(words);
        const rankedCandidates = rankWordCandidates(extractedCandidates, kanji, kanjiMeanings);
        const meaning = inferMeaning({ kanjiMeanings, rankedCandidates });
        const notes = inferNotes({ rankedCandidates, maxExamples });
        const sentenceCandidates = inferSentenceCandidates({ rankedCandidates, maxSentences });

        return {
            kanji,
            kanjiMeanings,
            candidates: rankedCandidates,
            bestWord: meaning.bestWord,
            englishMeaning: meaning.englishMeaning,
            meaningJP: meaning.meaningJP,
            notes: notes.notes,
            sentenceCandidates,
        };
    }

    return {
        inferKanjiStudyData,
    };
}

module.exports = {
    createInferenceEngine,
};
