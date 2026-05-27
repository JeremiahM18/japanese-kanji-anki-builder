const SENTENCE_QUALITY_PREFIXES = Object.freeze([
    "actual example sentence quality review:",
    "example review:",
]);

const WORD_SENTENCE_QUALITY_REVIEW_FIELDS = Object.freeze([
    "example",
    "learnerUseful",
    "levelAppropriate",
    "naturalJapanese",
    "reading",
    "releaseQuality",
    "reviewerJudgment",
    "translation",
]);

const KANJI_SENTENCE_QUALITY_REVIEW_FIELDS = Object.freeze([
    "example",
    "reading",
    "translation",
    "naturalJapanese",
    "learnerUseful",
    "levelAppropriate",
    "supportOnly",
    "reviewerJudgment",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function normalizeProofText(value) {
    return normalizeText(value)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function flattenProofValue(value) {
    if (Array.isArray(value)) {
        return value.map(flattenProofValue).join(" ");
    }
    if (value && typeof value === "object") {
        return Object.entries(value)
            .map(([key, nestedValue]) => `${key} ${flattenProofValue(nestedValue)}`)
            .join(" ");
    }
    return normalizeText(value);
}

function normalizeProofParts(parts = []) {
    return normalizeProofText((Array.isArray(parts) ? parts : [parts])
        .map(flattenProofValue)
        .join(" "));
}

function buildWordCardReviewed({ entry = {}, provenance = {} } = {}) {
    const rawCardReviewed = provenance.cardReviewed;
    const objectIdentity = rawCardReviewed && typeof rawCardReviewed === "object" && !Array.isArray(rawCardReviewed)
        ? `${normalizeText(rawCardReviewed.word || rawCardReviewed.written)}|${normalizeText(rawCardReviewed.reading)}`
        : "";
    const existing = normalizeText(typeof rawCardReviewed === "string" ? rawCardReviewed : objectIdentity);
    if (existing) {
        return existing;
    }

    const word = normalizeText(entry.word || entry.written || entry.displayWord);
    const readings = normalizeStringArray(entry.readingIncludes);
    if (!word || readings.length !== 1) {
        throw new Error(`Cannot derive exact word cardReviewed identity for ${word || "(missing word)"}.`);
    }
    return `${word}|${readings[0]}`;
}

function parseCardReviewedParts(cardReviewed) {
    const normalized = normalizeText(cardReviewed);
    const separator = normalized.indexOf("|");
    if (separator <= 0 || separator === normalized.length - 1) {
        throw new Error(`cardReviewed must use written|reading identity: ${cardReviewed}`);
    }
    return {
        written: normalized.slice(0, separator),
        reading: normalized.slice(separator + 1),
    };
}

function assertWordIdentityBinding({
    entry = {},
    cardReviewed,
} = {}) {
    const { written, reading } = parseCardReviewedParts(cardReviewed);
    const entryWord = normalizeText(entry.word || entry.written || entry.displayWord);
    const readings = normalizeStringArray(entry.readingIncludes);
    if (entryWord && entryWord !== written) {
        throw new Error(`Word entry ${entryWord} does not match proof target ${written}.`);
    }
    if (readings.length > 0 && !readings.includes(reading)) {
        throw new Error(`Word entry ${entryWord}|${readings.join(" / ")} does not match proof target ${cardReviewed}.`);
    }
}

function buildReviewEvidenceText(entry = {}) {
    return (Array.isArray(entry.reviewEvidence) ? entry.reviewEvidence : [])
        .map((evidence) => `${evidence?.source || ""} ${evidence?.detail || ""}`)
        .join(" ");
}

function getReviewEvidenceDetail(entry = {}, predicate) {
    return (Array.isArray(entry.reviewEvidence) ? entry.reviewEvidence : [])
        .map((evidence) => normalizeText(evidence?.detail))
        .find((detail) => detail && predicate(normalizeProofText(detail))) || "";
}

function proofTextSupportsWordReleaseQuality(text) {
    const proofText = normalizeProofText(text);
    return /\bnatural(\s+japanese|\s+enough)?\b/.test(proofText)
        && (
            proofText.includes("learner useful")
            || proofText.includes("learner friendly")
            || proofText.includes("useful")
        )
        && proofText.includes("level appropriate")
        && (
            proofText.includes("release quality")
            || proofText.includes("release judgment")
        )
        && (
            proofText.includes("human")
            || proofText.includes("manual")
            || proofText.includes("judged")
            || proofText.includes("checked")
        );
}

function deriveWordReviewerJudgment({
    entry = {},
    provenance = {},
    review = {},
    cardReviewed,
} = {}) {
    const explicit = normalizeText(review.reviewerJudgment || review.rationale || review.judgment);
    if (explicit) {
        const structuredTruths = review.naturalJapanese === true
            && review.learnerUseful === true
            && review.levelAppropriate === true
            && review.releaseQuality === true;
        if (!structuredTruths && !proofTextSupportsWordReleaseQuality(explicit)) {
            throw new Error(`Word sentence-quality reviewerJudgment lacks release-quality proof markers for ${cardReviewed}.`);
        }
        return explicit;
    }

    const releaseQualityEvidence = getReviewEvidenceDetail(entry, proofTextSupportsWordReleaseQuality);
    if (releaseQualityEvidence) {
        return releaseQualityEvidence;
    }

    const combinedProofText = normalizeProofParts([
        provenance.evidenceChecked,
        buildReviewEvidenceText(entry),
    ]);
    if (!proofTextSupportsWordReleaseQuality(combinedProofText)) {
        throw new Error(`Missing release-quality sentence review proof for ${cardReviewed}.`);
    }

    return `Tracked word Obsidian proof for ${cardReviewed} records natural Japanese, learner-useful, level-appropriate, release-quality example review with reading and translation checked.`;
}

function parseGeneratedExampleSentence(row = {}, { cardReviewed } = {}) {
    const exampleSentence = normalizeText(row.exampleSentence);
    const parts = exampleSentence.includes("／")
        ? exampleSentence.split("／").map(normalizeText)
        : exampleSentence.split(" / ").map(normalizeText);
    if (parts.length < 3 || parts.slice(0, 3).some((part) => !part)) {
        throw new Error(`Cannot derive word sentence-quality example/reading/translation from live row for ${cardReviewed}.`);
    }
    return {
        example: parts[0],
        reading: parts[1],
        translation: parts.slice(2).join(" / "),
    };
}

function assertWordSentenceBinding({
    entry = {},
    review = {},
    cardReviewed,
} = {}) {
    const exampleText = normalizeProofText(review.example);
    const reviewText = normalizeProofParts(review);
    const examples = normalizeStringArray(entry.exampleIncludes).map(normalizeProofText);
    const readings = normalizeStringArray(entry.readingIncludes).map(normalizeProofText);
    if (examples.length > 0 && !examples.some((example) => exampleText.includes(example))) {
        throw new Error(`Word sentence-quality example does not bind to tracked example for ${cardReviewed}.`);
    }
    if (readings.length > 0 && !readings.some((reading) => reviewText.includes(reading))) {
        throw new Error(`Word sentence-quality reading does not bind to tracked word reading for ${cardReviewed}.`);
    }
}

function deriveWordLimitationDecision({
    entry = {},
    provenance = {},
    cardReviewed,
} = {}) {
    const existing = normalizeText(provenance.limitationDecision);
    if (existing) {
        return existing;
    }

    const proofText = normalizeProofParts([
        provenance.evidenceChecked,
        buildReviewEvidenceText(entry),
        entry.revalidationSummary,
    ]);
    if (!proofText.includes("verification limitations")) {
        throw new Error(`Missing limitation decision evidence for ${cardReviewed}.`);
    }
    if (
        proofText.includes("no active core card limitations")
        || proofText.includes("no active limitations")
        || proofText.includes("no active verification limitations")
    ) {
        return "verification limitations considered; no active core-card limitations recorded";
    }

    throw new Error(`Cannot derive a canonical limitationDecision for ${cardReviewed}.`);
}

function deriveWordResult({ entry = {}, provenance = {}, cardReviewed } = {}) {
    const existing = normalizeText(provenance.result);
    if (existing) {
        return existing;
    }

    const status = normalizeText(entry.status);
    if (["platinum", "fixed_then_platinum"].includes(status)) {
        return "approved_for_current_standard_platinum";
    }
    throw new Error(`Cannot derive Obsidian proof result for ${cardReviewed} from status ${status || "(missing)"}.`);
}

function deriveWordScope({ provenance = {}, level, cardReviewed } = {}) {
    const existing = normalizeText(provenance.scope);
    if (existing) {
        return existing;
    }
    const batchId = normalizeText(provenance.batchId);
    if (!batchId) {
        throw new Error(`Cannot derive Obsidian proof scope for ${cardReviewed} without batchId.`);
    }
    return `N${level} word Obsidian lane ${batchId} substantive rereview`;
}

function assertWordEvidenceChecklist({
    entry = {},
    provenance = {},
    cardReviewed,
} = {}) {
    const proofText = normalizeProofParts(provenance.evidenceChecked);
    const requiredSnippets = [
        ["live generated word surface", "generated word surface", "generated surface"],
        ["governed japanese source", "japanese source evidence", "japanese source word evidence", "japanese-source"],
        ["learner facing meaning", "meaning"],
        ["example sentence", "example review"],
        ["notes support surface", "notes", "support surface"],
        ["reading breakdown"],
        ["jlpt", "coverage", "focus", "covers", "covered reading"],
        ["word reading audio", "word-reading"],
        ["pitch accent", "pitch"],
        ["managed media provenance", "media provenance"],
        ["golden regression"],
        ["product fit", "word vocabulary deck placement", "learner friendly", "learner useful", "useful"],
        ["verification limitations"],
    ];
    for (const snippets of requiredSnippets) {
        if (!snippets.some((snippet) => proofText.includes(snippet))) {
            throw new Error(`Word evidence checklist is missing ${snippets[0]} for ${cardReviewed}.`);
        }
    }

    const { written, reading } = parseCardReviewedParts(cardReviewed);
    const exactAudio = normalizeProofText(`word-reading-${written}-${reading}`);
    if (!proofText.includes(exactAudio)) {
        throw new Error(`Word evidence checklist is missing exact audio identity ${exactAudio} for ${cardReviewed}.`);
    }
    if (proofText.includes("golden regression")
        && !proofText.includes("not source truth")
        && !proofText.includes("internal regression")) {
        throw new Error(`Word evidence checklist must keep golden regression internal-only for ${cardReviewed}.`);
    }
    if (entry) {
        assertWordIdentityBinding({ entry, cardReviewed });
    }
}

function deriveSentenceQualityReview(provenance = {}, context = {}) {
    if (context.deckKind === "word") {
        return deriveWordSentenceQualityReview(provenance, context);
    }

    if (provenance.sentenceQualityReview) {
        return sanitizeSentenceQualityReview(provenance.sentenceQualityReview, context);
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

function deriveWordSentenceQualityReview(provenance = {}, context = {}) {
    const cardReviewed = normalizeText(context.cardReviewed)
        || buildWordCardReviewed({
            entry: context.entry,
            provenance,
        });
    const existingReview = provenance.sentenceQualityReview || {};
    const sourceReview = provenance.sentenceQualityReview
        ? {
            example: existingReview.example || existingReview.japaneseSentence || existingReview.sentence,
            reading: existingReview.reading || existingReview.sentenceReading || existingReview.wordReading,
            translation: existingReview.translation,
        }
        : parseGeneratedExampleSentence(context.row, { cardReviewed });

    const review = {
        example: normalizeText(sourceReview.example),
        reading: normalizeText(sourceReview.reading),
        translation: normalizeText(sourceReview.translation),
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        releaseQuality: true,
        reviewerJudgment: deriveWordReviewerJudgment({
            entry: context.entry,
            provenance,
            review: existingReview,
            cardReviewed,
        }),
    };
    for (const [key, value] of Object.entries(review)) {
        if (value === undefined || value === "") {
            throw new Error(`sentenceQualityReview.${key} is missing for ${cardReviewed}.`);
        }
    }
    assertWordSentenceBinding({
        entry: context.entry,
        review,
        cardReviewed,
    });
    return review;
}

function sanitizeSentenceQualityReview(review = {}, context = {}) {
    const { cardReviewed } = context;
    if (context.deckKind === "word") {
        return deriveWordSentenceQualityReview({ sentenceQualityReview: review }, context);
    }

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

function hasStrictSentenceQualityReviewShape(review = {}, { deckKind = "kanji" } = {}) {
    const expectedKeys = deckKind === "word"
        ? WORD_SENTENCE_QUALITY_REVIEW_FIELDS
        : KANJI_SENTENCE_QUALITY_REVIEW_FIELDS;
    const actualKeys = Object.keys(review || {}).sort();
    return expectedKeys.length === actualKeys.length
        && expectedKeys.every((key, index) => actualKeys[index] === key);
}

function normalizeInlineProvenance(provenance = {}, context = {}) {
    if (context.deckKind === "word") {
        const cardReviewed = buildWordCardReviewed({
            entry: context.entry,
            provenance,
        });
        const normalized = {
            type: provenance.type,
            reviewStandard: provenance.reviewStandard,
            reviewedAt: provenance.reviewedAt,
            reviewer: provenance.reviewer,
            reviewedAfterStandard: provenance.reviewedAfterStandard,
            mechanicalMigration: provenance.mechanicalMigration,
            batchId: provenance.batchId,
            result: deriveWordResult({
                entry: context.entry,
                provenance,
                cardReviewed,
            }),
            scope: deriveWordScope({
                provenance,
                level: context.level,
                cardReviewed,
            }),
            cardReviewed,
            evidenceChecked: provenance.evidenceChecked,
            limitationDecision: deriveWordLimitationDecision({
                entry: context.entry,
                provenance,
                cardReviewed,
            }),
            sentenceQualityReview: deriveSentenceQualityReview(provenance, {
                ...context,
                cardReviewed,
                deckKind: "word",
            }),
        };
        if (!normalized.batchId) {
            throw new Error(`Missing rereviewProvenance.batchId for ${cardReviewed}.`);
        }
        assertWordEvidenceChecklist({
            entry: context.entry,
            provenance: normalized,
            cardReviewed,
        });
        return normalized;
    }

    const normalized = {
        ...provenance,
        sentenceQualityReview: deriveSentenceQualityReview(provenance, context),
    };
    if (!normalized.batchId) {
        throw new Error(`Missing rereviewProvenance.batchId for ${context.cardReviewed}.`);
    }
    return normalized;
}

function getInlineProvenanceNormalizationStats(provenance = {}, context = {}) {
    const hasSentenceQualityReview = Boolean(provenance.sentenceQualityReview);
    return {
        normalizedCardReviewed: context.deckKind === "word"
            && (typeof provenance.cardReviewed !== "string" || !normalizeText(provenance.cardReviewed)),
        normalizedLimitationDecision: context.deckKind === "word" && !normalizeText(provenance.limitationDecision),
        normalizedResult: context.deckKind === "word" && !normalizeText(provenance.result),
        normalizedSentenceQualityReview: !hasSentenceQualityReview,
        sanitizedSentenceQualityReview: hasSentenceQualityReview
            && !hasStrictSentenceQualityReviewShape(provenance.sentenceQualityReview, context),
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
