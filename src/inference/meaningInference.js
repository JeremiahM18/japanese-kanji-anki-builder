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

function buildMeaningJP(bestWord, englishMeaning) {
    const jpHint = bestWord ? `${bestWord.written} （${bestWord.pron}）` : "";
    const english = String(englishMeaning ?? "").trim();

    if (jpHint && english) {
        return `${jpHint} ／ ${english}`;
    }

    return jpHint || english;
}

function inferMeaning({ kanji, kanjiMeanings, rankedCandidates }) {
    const bestWord = rankedCandidates[0] || null;
    const englishMeaning = chooseEnglishMeaning({ kanji, kanjiMeanings, bestWord });

    return {
        bestWord,
        englishMeaning,
        meaningJP: buildMeaningJP(bestWord, englishMeaning),
    };
}

module.exports = {
    buildMeaningJP,
    chooseEnglishMeaning,
    inferMeaning,
    pickBestEnglishMeaning,
    scoreMeaningCandidate,
};

