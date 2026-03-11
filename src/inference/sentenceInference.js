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

function scoreSource(entry) {
    const source = String(entry.source || "").toLowerCase();

    if (source.includes("manual") || source.includes("curated")) {
        return 18;
    }
    if (source.includes("local-corpus")) {
        return 12;
    }
    if (source.includes("tatoeba") || source.includes("dictionary")) {
        return 8;
    }

    return 4;
}

function scoreTags(tags) {
    let score = 0;

    if (!Array.isArray(tags)) {
        return score;
    }

    if (tags.includes("core")) {
        score += 10;
    }
    if (tags.includes("common")) {
        score += 8;
    }
    if (tags.includes("beginner")) {
        score += 8;
    }
    if (tags.includes("archaic") || tags.includes("rare")) {
        score -= 10;
    }

    return score;
}

function scoreRegister(register) {
    switch (register) {
    case "neutral":
        return 8;
    case "spoken":
        return 6;
    case "formal":
        return 2;
    case "literary":
        return -8;
    default:
        return 0;
    }
}

function scoreFrequencyRank(frequencyRank) {
    if (!Number.isInteger(frequencyRank) || frequencyRank <= 0) {
        return 0;
    }

    return Math.max(0, 24 - Math.floor(frequencyRank / 250));
}

function scoreJlpt(entryJlpt, kanji) {
    if (!Number.isInteger(entryJlpt)) {
        return 0;
    }

    return kanji ? 4 : 0;
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

    score += scoreSource(entry);
    score += scoreTags(entry.tags);
    score += scoreRegister(entry.register);
    score += scoreFrequencyRank(entry.frequencyRank);
    score += scoreJlpt(entry.jlpt, kanji);

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
        register: entry.register || "neutral",
        frequencyRank: entry.frequencyRank ?? null,
        tags: Array.isArray(entry.tags) ? entry.tags : [],
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
    scoreCorpusSentence,
    scoreFrequencyRank,
    scoreJlpt,
    scoreRegister,
    scoreSource,
    scoreTags,
};
