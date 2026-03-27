const { normalizeText } = require("../utils/text");

const LEARNER_NOISE_PATTERNS = [
    /radical/i,
    /no\./i,
    /counter/i,
    /suffix/i,
    /prefix/i,
    /classifier/i,
    /place name/i,
    /given name/i,
    /surname/i,
    /particle/i,
];

const EXACT_WORD_GLOSS_MARGIN = 0;
const KATAKANA_ONLY_RE = /^[\p{Script=Katakana}ー]+$/u;

function scoreMeaningCandidate(meaning) {
    const text = String(meaning ?? "").trim();

    if (!text) {
        return Number.NEGATIVE_INFINITY;
    }

    let score = 0;

    if (!/[0-9]/.test(text)) {
        score += 10;
    } else {
        score -= 8;
    }

    if (!/[()]/.test(text)) {
        score += 8;
    } else {
        score -= 6;
    }

    if (text.length >= 3 && text.length <= 22) {
        score += 8;
    } else if (text.length <= 30) {
        score += 2;
    } else {
        score -= 10;
    }

    if (!LEARNER_NOISE_PATTERNS.some((pattern) => pattern.test(text))) {
        score += 14;
    } else {
        score -= 18;
    }

    if (/[;/]/.test(text)) {
        score -= 2;
    }

    return score;
}

function pickBestEnglishMeaning(meanings) {
    if (!Array.isArray(meanings) || meanings.length === 0) {
        return "";
    }

    const ranked = meanings
        .map((meaning) => String(meaning ?? "").trim())
        .filter(Boolean)
        .map((meaning) => ({
            meaning,
            score: scoreMeaningCandidate(meaning),
        }))
        .sort((a, b) => b.score - a.score || a.meaning.length - b.meaning.length || a.meaning.localeCompare(b.meaning));

    return ranked[0]?.meaning || String(meanings[0] ?? "").trim();
}

function isKatakanaOnly(text) {
    return KATAKANA_ONLY_RE.test(String(text ?? "").trim());
}

function glossSemanticallyMatches(gloss, englishMeaning) {
    const normalizedGloss = normalizeText(gloss);
    const normalizedMeaning = normalizeText(englishMeaning);

    if (!normalizedGloss || !normalizedMeaning) {
        return false;
    }

    return normalizedGloss.includes(normalizedMeaning) || normalizedMeaning.includes(normalizedGloss);
}

function compareDisplayCandidates(a, b, englishMeaning) {
    const aMeaningMatch = glossSemanticallyMatches(a?.gloss, englishMeaning) ? 1 : 0;
    const bMeaningMatch = glossSemanticallyMatches(b?.gloss, englishMeaning) ? 1 : 0;
    if (bMeaningMatch !== aMeaningMatch) {
        return bMeaningMatch - aMeaningMatch;
    }

    const aReadablePron = isKatakanaOnly(a?.pron) ? 0 : 1;
    const bReadablePron = isKatakanaOnly(b?.pron) ? 0 : 1;
    if (bReadablePron !== aReadablePron) {
        return bReadablePron - aReadablePron;
    }

    const aGlossScore = scoreMeaningCandidate(a?.gloss);
    const bGlossScore = scoreMeaningCandidate(b?.gloss);
    if (bGlossScore !== aGlossScore) {
        return bGlossScore - aGlossScore;
    }

    return (b?.score || 0) - (a?.score || 0);
}

function chooseMeaningDisplayCandidate({ kanji, rankedCandidates, englishMeaning }) {
    const candidates = Array.isArray(rankedCandidates) ? rankedCandidates.filter(Boolean) : [];
    const exactMatches = candidates.filter((candidate) => candidate.written === kanji);

    if (exactMatches.length === 0) {
        return candidates[0] || null;
    }

    const bestExactMatch = [...exactMatches].sort((a, b) => compareDisplayCandidates(a, b, englishMeaning))[0] || null;
    if (bestExactMatch && glossSemanticallyMatches(bestExactMatch.gloss, englishMeaning)) {
        return bestExactMatch;
    }

    return candidates[0] || bestExactMatch;
}

function chooseEnglishMeaning({ kanjiMeanings, bestWord, kanji }) {
    const baseMeaning = pickBestEnglishMeaning(kanjiMeanings);
    const baseScore = scoreMeaningCandidate(baseMeaning);
    const wordGloss = String(bestWord?.gloss ?? "").trim();
    const wordScore = scoreMeaningCandidate(wordGloss);

    if (!baseMeaning && wordGloss) {
        return wordGloss;
    }

    if (bestWord?.written === kanji && wordGloss && wordScore >= baseScore + EXACT_WORD_GLOSS_MARGIN) {
        return wordGloss;
    }

    return baseMeaning || wordGloss;
}

function buildMeaningJP(displayWord, englishMeaning) {
    let jpHint = "";

    if (displayWord?.written) {
        const usePronunciation = displayWord.pron && !(displayWord.written.length === 1 && isKatakanaOnly(displayWord.pron));
        jpHint = usePronunciation
            ? `${displayWord.written} （${displayWord.pron}）`
            : `${displayWord.written}`;
    }
    const english = String(englishMeaning ?? "").trim();

    if (jpHint && english) {
        return `${jpHint} ／ ${english}`;
    }

    return jpHint || english;
}

function inferMeaning({ kanji, kanjiMeanings, rankedCandidates }) {
    const bestWord = rankedCandidates[0] || null;
    const englishMeaning = chooseEnglishMeaning({ kanji, kanjiMeanings, bestWord });
    const displayWord = chooseMeaningDisplayCandidate({ kanji, rankedCandidates, englishMeaning });

    return {
        bestWord,
        displayWord,
        englishMeaning,
        meaningJP: buildMeaningJP(displayWord, englishMeaning),
    };
}

module.exports = {
    buildMeaningJP,
    chooseMeaningDisplayCandidate,
    chooseEnglishMeaning,
    inferMeaning,
    isKatakanaOnly,
    pickBestEnglishMeaning,
    scoreMeaningCandidate,
};
