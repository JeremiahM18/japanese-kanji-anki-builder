const SENTENCE_QUALITY_PREFIXES = Object.freeze([
    "actual example sentence quality review:",
    "example review:",
]);

function deriveSentenceQualityReview(provenance = {}, { cardReviewed } = {}) {
    if (provenance.sentenceQualityReview) {
        return sanitizeSentenceQualityReview(provenance.sentenceQualityReview, { cardReviewed });
    }

    const evidenceLine = (provenance.evidenceChecked || []).find((entry) => (
        SENTENCE_QUALITY_PREFIXES.some((prefix) => String(entry).startsWith(prefix))
    ));
    if (!evidenceLine) {
        throw new Error(`Missing sentenceQualityReview and parseable sentence quality evidence for ${cardReviewed}.`);
    }

    const prefix = SENTENCE_QUALITY_PREFIXES.find((candidate) => evidenceLine.startsWith(candidate));
    const sentenceQualityText = evidenceLine.slice(prefix.length).trim();
    const match = /^(.+?) \/ (.+?) \/ (.+?); (.+)$/.exec(sentenceQualityText);
    if (!match) {
        throw new Error(`Could not parse sentence quality evidence for ${cardReviewed}: ${evidenceLine}`);
    }

    return {
        example: match[1],
        reading: match[2],
        translation: match[3],
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        supportOnly: true,
        reviewerJudgment: match[4],
    };
}

function sanitizeSentenceQualityReview(review = {}, { cardReviewed } = {}) {
    const sanitized = {
        example: review.example,
        reading: review.reading,
        translation: review.translation,
        naturalJapanese: review.naturalJapanese,
        learnerUseful: review.learnerUseful,
        levelAppropriate: review.levelAppropriate,
        supportOnly: review.supportOnly,
        reviewerJudgment: review.reviewerJudgment,
    };
    for (const [key, value] of Object.entries(sanitized)) {
        if (value === undefined) {
            throw new Error(`sentenceQualityReview.${key} is missing for ${cardReviewed}.`);
        }
    }
    return sanitized;
}

function hasStrictSentenceQualityReviewShape(review = {}) {
    const expectedKeys = [
        "example",
        "learnerUseful",
        "levelAppropriate",
        "naturalJapanese",
        "reading",
        "reviewerJudgment",
        "supportOnly",
        "translation",
    ];
    const actualKeys = Object.keys(review || {}).sort();
    return expectedKeys.length === actualKeys.length
        && expectedKeys.every((key, index) => actualKeys[index] === key);
}

function normalizeInlineProvenance(provenance = {}, context = {}) {
    const normalized = {
        ...provenance,
        sentenceQualityReview: deriveSentenceQualityReview(provenance, context),
    };
    if (!normalized.batchId) {
        throw new Error(`Missing rereviewProvenance.batchId for ${context.cardReviewed}.`);
    }
    return normalized;
}

function getInlineProvenanceNormalizationStats(provenance = {}) {
    const hasSentenceQualityReview = Boolean(provenance.sentenceQualityReview);
    return {
        normalizedSentenceQualityReview: !hasSentenceQualityReview,
        sanitizedSentenceQualityReview: hasSentenceQualityReview
            && !hasStrictSentenceQualityReviewShape(provenance.sentenceQualityReview),
    };
}

module.exports = {
    SENTENCE_QUALITY_PREFIXES,
    deriveSentenceQualityReview,
    getInlineProvenanceNormalizationStats,
    hasStrictSentenceQualityReviewShape,
    normalizeInlineProvenance,
    sanitizeSentenceQualityReview,
};
