function pickBestEnglishMeaning(meanings) {
    if (!Array.isArray(meanings) || meanings.length === 0) {
        return "";
    }

    const filtered = meanings
        .map((meaning) => String(meaning ?? "").trim())
        .filter(Boolean)
        .filter((meaning) => !/[0-9]/.test(meaning))
        .filter((meaning) => meaning.length <= 30)
        .filter((meaning) => !/[()]/.test(meaning));

    return filtered[0] || String(meanings[0] ?? "").trim();
}

function buildMeaningJP(bestWord, englishMeaning) {
    const jpHint = bestWord ? `${bestWord.written} （${bestWord.pron}）` : "";
    const english = String(englishMeaning ?? "").trim();

    if (jpHint && english) {
        return `${jpHint} ／ ${english}`;
    }

    return jpHint || english;
}

function inferMeaning({ kanjiMeanings, rankedCandidates }) {
    const bestWord = rankedCandidates[0] || null;
    const englishMeaning = pickBestEnglishMeaning(kanjiMeanings);

    return {
        bestWord,
        englishMeaning,
        meaningJP: buildMeaningJP(bestWord, englishMeaning),
    };
}

module.exports = {
    buildMeaningJP,
    inferMeaning,
    pickBestEnglishMeaning,
};
