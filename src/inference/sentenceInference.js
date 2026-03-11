function buildDefinitionSentence(candidate) {
    return {
        type: "definition",
        japanese: `「${candidate.written}」は「${candidate.gloss}」です。`,
        reading: `「${candidate.pron}」は「${candidate.gloss}」です。`,
        english: `"${candidate.written}" means "${candidate.gloss}."`,
        sourceWord: candidate.written,
        score: candidate.score,
        source: "template",
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
        source: "template",
    };
}

function scoreCorpusSentence(entry, candidate, kanji) {
    let score = candidate.score;

    if (entry.written === candidate.written) {
        score += 50;
    }
    if (entry.kanji === kanji) {
        score += 20;
    }
    if (entry.japanese.includes(candidate.written)) {
        score += 10;
    }
    if (Array.isArray(entry.tags) && entry.tags.includes("core")) {
        score += 10;
    }

    return score;
}

function buildCorpusSentence(entry, candidate, kanji) {
    return {
        type: "corpus",
        japanese: entry.japanese,
        reading: entry.reading || candidate.pron,
        english: entry.english,
        sourceWord: candidate.written,
        score: scoreCorpusSentence(entry, candidate, kanji),
        source: entry.source || "local-corpus",
    };
}

function selectCorpusSentences({ rankedCandidates, kanji, sentenceCorpus }) {
    if (!Array.isArray(sentenceCorpus) || sentenceCorpus.length === 0) {
        return [];
    }

    const sentences = [];

    for (const candidate of rankedCandidates) {
        const matches = sentenceCorpus
            .filter((entry) => entry.kanji === kanji || entry.written === candidate.written)
            .map((entry) => buildCorpusSentence(entry, candidate, kanji))
            .sort((a, b) => b.score - a.score || a.japanese.localeCompare(b.japanese));

        sentences.push(...matches);
    }

    return sentences;
}

function inferSentenceCandidates({ rankedCandidates, kanji, sentenceCorpus = [], maxSentences = 3 }) {
    const sentences = [];
    const seen = new Set();

    const corpusSentences = selectCorpusSentences({ rankedCandidates, kanji, sentenceCorpus });
    for (const sentence of corpusSentences) {
        if (sentences.length >= maxSentences) {
            break;
        }

        const dedupeKey = `${sentence.type}|${sentence.japanese}|${sentence.sourceWord}`;
        if (seen.has(dedupeKey)) {
            continue;
        }

        seen.add(dedupeKey);
        sentences.push(sentence);
    }

    for (const candidate of rankedCandidates) {
        if (sentences.length >= maxSentences) {
            break;
        }

        for (const sentence of [buildDefinitionSentence(candidate), buildStudySentence(candidate)]) {
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
