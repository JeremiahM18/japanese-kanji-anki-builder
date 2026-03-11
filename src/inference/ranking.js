const { classifyGloss } = require("./candidateExtractor");
const {
    scoreFrequencyRank,
    scoreJlpt,
    scoreRegister,
    scoreSource,
    scoreTags,
} = require("./sentenceInference");
const { normalizeText } = require("../utils/text");

const INVALID_SCORE = -999;

const SCORE = {
    CONTAINS_TARGET_KANJI: 20,
    MISSING_TARGET_KANJI: -25,
    LENGTH_1: 8,
    LENGTH_2: 18,
    LENGTH_3: 12,
    LENGTH_4: 6,
    LENGTH_OVER_4_CAP: -12,
    PRIORITY_MARKER: 5,
    SHORT_GLOSS: 6,
    LONG_GLOSS: -6,
    NAME_PENALTY: -20,
    OBSCURE_PENALTY: -25,
    ASCII_WRITTEN_PENALTY: -20,
    PARENS_NOISE_PENALTY: -8,
    GOOD_KANJI_FOOTPRINT: 5,
    TOO_MANY_KANJI_PENALTY: -6,
    KANA_ONLY_PENALTY: -10,
    CORE_MEANING_BONUS: 12,
    SEXAGENARY_PENALTY: -40,
    SPECIES_PENALTY: -30,
    LONG_PRONUNCIATION_PENALTY: -4,
    EXACT_MATCH_BONUS: 10,
    EXACT_MATCH_CORE_MEANING_BONUS: 14,
    EXACT_MATCH_OBSCURE_PENALTY: -20,
    SINGLE_KANJI_KATAKANA_PENALTY: -25,
    CORPUS_EXACT_WRITTEN_BONUS: 16,
    CORPUS_TARGET_KANJI_BONUS: 8,
    CORPUS_JAPANESE_MATCH_BONUS: 6,
    CORPUS_SUPPORT_CAP: 45,
};

const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;
const KANA_ONLY_RE = /^[\p{Script=Hiragana}\p{Script=Katakana}ー]+$/u;
const HAN_CHAR_RE = /\p{Script=Han}/u;
const ASCII_ALNUM_RE = /^[A-Za-z0-9]+$/;
const JAPANESE_PARENS_NOISE_RE = /[(（].+[)）]/;

function countKanjiChars(text) {
    return Array.from(String(text ?? "")).filter((ch) => HAN_CHAR_RE.test(ch)).length;
}

function hasKanaOnly(text) {
    return KANA_ONLY_RE.test(String(text ?? ""));
}

function hasJapaneseParensNoise(text) {
    return JAPANESE_PARENS_NOISE_RE.test(String(text ?? ""));
}

function glossMatchesCoreMeaning(gloss, meanings) {
    const normalizedGloss = normalizeText(gloss);
    const normalizedMeanings = Array.isArray(meanings)
        ? meanings.map((meaning) => normalizeText(meaning)).filter(Boolean)
        : [];

    return normalizedMeanings.some(
        (meaning) => normalizedGloss.includes(meaning) || meaning.includes(normalizedGloss)
    );
}

function compareRankedCandidates(a, b) {
    if (b.score !== a.score) {
        return b.score - a.score;
    }
    if ((b.corpusSupportScore || 0) !== (a.corpusSupportScore || 0)) {
        return (b.corpusSupportScore || 0) - (a.corpusSupportScore || 0);
    }
    if (a.written.length !== b.written.length) {
        return a.written.length - b.written.length;
    }
    if (a.pron.length !== b.pron.length) {
        return a.pron.length - b.pron.length;
    }
    return a.text.localeCompare(b.text);
}

function scoreCorpusSupportEntry(entry, candidate, targetKanji) {
    let score = 0;

    if (entry.written === candidate.written) {
        score += SCORE.CORPUS_EXACT_WRITTEN_BONUS;
    }
    if (entry.kanji === targetKanji) {
        score += SCORE.CORPUS_TARGET_KANJI_BONUS;
    }
    if (String(entry.japanese || "").includes(candidate.written)) {
        score += SCORE.CORPUS_JAPANESE_MATCH_BONUS;
    }

    score += scoreSource(entry);
    score += scoreTags(entry.tags);
    score += scoreRegister(entry.register);
    score += scoreFrequencyRank(entry.frequencyRank);
    score += scoreJlpt(entry.jlpt, targetKanji);

    return score;
}

function scoreCorpusSupport(candidate, targetKanji, sentenceCorpus = []) {
    if (!Array.isArray(sentenceCorpus) || sentenceCorpus.length === 0) {
        return 0;
    }

    let bestScore = 0;

    for (const entry of sentenceCorpus) {
        const exactWrittenMatch = entry?.written === candidate.written;
        const sentenceContainsWord = String(entry?.japanese || "").includes(candidate.written);

        if (!exactWrittenMatch && !sentenceContainsWord) {
            continue;
        }

        bestScore = Math.max(bestScore, scoreCorpusSupportEntry(entry, candidate, targetKanji));
    }

    return Math.min(SCORE.CORPUS_SUPPORT_CAP, bestScore);
}

function scoreCandidate(candidate, targetKanji, kanjiMeanings, sentenceCorpus = []) {
    if (!candidate?.written || !candidate?.pron || !candidate?.gloss) {
        return {
            score: INVALID_SCORE,
            corpusSupportScore: 0,
        };
    }

    const { isName, isObscure } = classifyGloss(candidate.meaning?.glosses);
    const written = candidate.written;
    const pron = candidate.pron;
    const firstGloss = candidate.gloss;
    const allGlossText = candidate.allGlossText || "";

    let score = 0;

    if (written.includes(targetKanji)) {
        score += SCORE.CONTAINS_TARGET_KANJI;
    } else {
        score += SCORE.MISSING_TARGET_KANJI;
    }

    const len = written.length;
    if (len === 1) {
        score += SCORE.LENGTH_1;
    } else if (len === 2) {
        score += SCORE.LENGTH_2;
    } else if (len === 3) {
        score += SCORE.LENGTH_3;
    } else if (len === 4) {
        score += SCORE.LENGTH_4;
    } else {
        score += Math.max(SCORE.LENGTH_OVER_4_CAP, -(len - 4));
    }

    if (Array.isArray(candidate.variant?.priorities)) {
        score += candidate.variant.priorities.length * SCORE.PRIORITY_MARKER;
    }

    if (firstGloss.length <= 18) {
        score += SCORE.SHORT_GLOSS;
    } else if (firstGloss.length > 40) {
        score += SCORE.LONG_GLOSS;
    }

    if (isName) {
        score += SCORE.NAME_PENALTY;
    }

    if (isObscure) {
        score += SCORE.OBSCURE_PENALTY;
    }

    if (ASCII_ALNUM_RE.test(written)) {
        score += SCORE.ASCII_WRITTEN_PENALTY;
    }

    if (hasJapaneseParensNoise(firstGloss)) {
        score += SCORE.PARENS_NOISE_PENALTY;
    }

    const kanjiCount = countKanjiChars(written);
    if (kanjiCount >= 1 && kanjiCount <= 2) {
        score += SCORE.GOOD_KANJI_FOOTPRINT;
    } else if (kanjiCount >= 4) {
        score += SCORE.TOO_MANY_KANJI_PENALTY;
    }

    if (hasKanaOnly(written)) {
        score += SCORE.KANA_ONLY_PENALTY;
    }

    if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
        score += SCORE.CORE_MEANING_BONUS;
    }

    if (allGlossText.includes("term of the sexagenary cycle")) {
        score += SCORE.SEXAGENARY_PENALTY;
    }

    if (allGlossText.includes("species of")) {
        score += SCORE.SPECIES_PENALTY;
    }

    if (pron.length >= 8) {
        score += SCORE.LONG_PRONUNCIATION_PENALTY;
    }

    if (written === targetKanji) {
        score += SCORE.EXACT_MATCH_BONUS;

        if (glossMatchesCoreMeaning(firstGloss, kanjiMeanings)) {
            score += SCORE.EXACT_MATCH_CORE_MEANING_BONUS;
        }

        if (isObscure) {
            score += SCORE.EXACT_MATCH_OBSCURE_PENALTY;
        }
    }

    if (written === targetKanji && KATAKANA_ONLY_RE.test(pron)) {
        score += SCORE.SINGLE_KANJI_KATAKANA_PENALTY;
    }

    const corpusSupportScore = scoreCorpusSupport(candidate, targetKanji, sentenceCorpus);

    return {
        score: score + corpusSupportScore,
        corpusSupportScore,
    };
}

function rankWordCandidates(candidates, targetKanji, kanjiMeanings, sentenceCorpus = []) {
    return [...candidates]
        .map((candidate) => {
            const scored = scoreCandidate(candidate, targetKanji, kanjiMeanings, sentenceCorpus);

            return {
                ...candidate,
                score: scored.score,
                corpusSupportScore: scored.corpusSupportScore,
            };
        })
        .sort(compareRankedCandidates);
}

module.exports = {
    INVALID_SCORE,
    SCORE,
    compareRankedCandidates,
    countKanjiChars,
    glossMatchesCoreMeaning,
    rankWordCandidates,
    scoreCandidate,
    scoreCorpusSupport,
    scoreCorpusSupportEntry,
};
