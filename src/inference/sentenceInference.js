function buildDefinitionSentence(candidate) {
    return {
        type: "definition",
        japanese: `「${candidate.written}」は「${candidate.gloss}」です。`,
        reading: `「${candidate.pron}」は「${candidate.gloss}」です。`,
        english: `"${candidate.written}" means "${candidate.gloss}."`,
        sourceWord: candidate.written,
        score: candidate.score,
    };
}

function buildStudySentence(candidate) {
    return {
        type: "study",
        japanese: `「${candidate.written}」を覚えます。`,
        reading: `「${candidate.pron}」をおぼえます。`,
        english: `I memorize "${candidate.gloss}."`,
        sourceWord: candidate.written,
        score: candidate.score,
    };
}

function inferSentenceCandidates({ rankedCandidates, maxSentences = 3 }) {
    const sentences = [];
    const seen = new Set();

    for (const candidate of rankedCandidates) {
        if (sentences.length >= maxSentences) {
            break;
        }

        const definitionSentence = buildDefinitionSentence(candidate);
        const studySentence = buildStudySentence(candidate);

        for (const sentence of [definitionSentence, studySentence]) {
            if (sentences.length >= maxSentences) {
                break;
            }

            const dedupeKey = `${sentence.type}|${sentence.sourceWord}`;
            if (seen.has(dedupeKey)) {
                continue;
            }

            seen.add(dedupeKey);
            sentences.push(sentence);
        }
    }

    return sentences;
}

module.exports = {
    inferSentenceCandidates,
};
