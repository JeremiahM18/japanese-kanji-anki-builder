const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
} = require("./platinumReviewService");
const { normalizeEvidenceEntries } = require("./platinumEvidenceService");

const SUBSTANTIVE_REREVIEW_PROOF_MARKER = "substantive post-v3 Obsidian rereview";
const NON_MECHANICAL_PROOF_MARKER = "not mechanically migrated";
const MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER = "missing_substantive_current_standard_word_rereview_proof";
const SENTENCE_QUALITY_REVIEW_PROOF_MARKER = "example sentence quality review";
const STRUCTURED_REREVIEW_PROVENANCE_TYPE = "substantive current standard rereview";
const WORD_SENTENCE_QUALITY_REVIEW_BOOLEAN_FIELDS = Object.freeze([
    "naturalJapanese",
    "learnerUseful",
    "levelAppropriate",
    "releaseQuality",
]);
const WORD_SENTENCE_REVIEW_TEXT_MARKERS = Object.freeze([
    "example review",
    "sentence quality review",
    normalizeProofText(SENTENCE_QUALITY_REVIEW_PROOF_MARKER),
]);
const REQUIRED_WORD_REREVIEW_CHECKS = Object.freeze([
    {
        label: "live generated word surface",
        snippets: ["live generated word surface", "generated word surface", "generated surface", "card surface"],
    },
    {
        label: "governed Japanese-source evidence",
        snippets: ["governed japanese source", "japanese source evidence", "japanese source word evidence", "japanese-source"],
    },
    {
        label: "learner-facing meaning",
        snippets: ["learner facing meaning", "meaning"],
    },
    {
        label: "example sentence with reading/translation fit",
        snippets: ["example sentence", "example review"],
    },
    {
        label: "notes/support surface",
        snippets: ["notes support surface", "notes", "support surface"],
    },
    {
        label: "reading and kanji breakdowns",
        snippets: ["reading breakdown"],
    },
    {
        label: "JLPT, coverage, focus, and covered-reading labels",
        snippets: ["jlpt", "coverage", "focus", "covers"],
    },
    {
        label: "exact word-reading audio identity",
        snippets: ["word reading audio", "word-reading"],
    },
    {
        label: "pitch source and rendered label",
        snippets: ["pitch accent", "pitch"],
    },
    {
        label: "managed media provenance",
        snippets: ["media provenance", "managed media provenance"],
    },
    {
        label: "golden regression treated as internal only",
        snippets: ["golden regression"],
    },
    {
        label: "word-deck product fit and learner usefulness",
        snippets: ["product fit", "word vocabulary deck placement", "learner friendly", "learner useful", "useful"],
    },
    {
        label: "verification limitations considered",
        snippets: ["verification limitations"],
    },
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeProofText(value) {
    return normalizeText(value)
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
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

function isPlainRecord(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeProofParts(parts = []) {
    return normalizeProofText((Array.isArray(parts) ? parts : [parts])
        .map(flattenProofValue)
        .join(" "));
}

function proofTextIncludesAny(proofText, snippets = []) {
    return snippets.some((snippet) => proofText.includes(snippet));
}

function proofTextIncludesEvery(proofText, snippets = []) {
    return snippets.every((snippet) => proofText.includes(snippet));
}

function getRereviewProvenance(entry = {}) {
    return isPlainRecord(entry.rereviewProvenance) ? entry.rereviewProvenance : null;
}

function buildRereviewProvenanceText(entry = {}) {
    const evidenceText = normalizeEvidenceEntries(entry.reviewEvidence)
        .filter((evidence) => ["manual-review", "current-standard-review"].includes(evidence.type))
        .map((evidence) => `${evidence.source} ${evidence.detail}`)
        .join(" ");
    const exampleReviewText = normalizeEvidenceEntries(entry.reviewEvidence)
        .filter((evidence) => evidence.type === "example-review")
        .map((evidence) => `${evidence.source} ${evidence.detail}`)
        .join(" ");
    const provenance = getRereviewProvenance(entry) || {};
    const provenanceText = Object.entries(provenance)
        .map(([key, value]) => `${key} ${flattenProofValue(value)}`)
        .join(" ");

    return normalizeProofText(`${evidenceText} ${exampleReviewText} ${provenanceText}`);
}

function hasBaseStructuredRereviewProvenance(entry = {}) {
    const provenance = getRereviewProvenance(entry);
    if (!provenance) {
        return false;
    }

    return normalizeProofText(provenance.type) === STRUCTURED_REREVIEW_PROVENANCE_TYPE
        && normalizeText(provenance.reviewStandard) === CURRENT_WORD_PLATINUM_REVIEW_STANDARD
        && provenance.reviewedAfterStandard === true
        && provenance.mechanicalMigration === false
        && Boolean(normalizeText(provenance.reviewer || entry.reviewer));
}

function hasWordCardIdentityProof(entry = {}) {
    const provenance = getRereviewProvenance(entry);
    if (!provenance) {
        return false;
    }

    const proofText = normalizeProofParts([
        provenance.cardReviewed,
        provenance.evidenceChecked,
        provenance.sentenceQualityReview,
    ]);
    const word = normalizeProofText(entry.word);
    const readings = normalizeStringArray(entry.readingIncludes).map(normalizeProofText);
    const hasWord = word && proofText.includes(word);
    const hasReading = readings.length === 0 || readings.some((reading) => proofText.includes(reading));

    return Boolean(hasWord && hasReading);
}

function wordRereviewEvidenceChecklistPasses(entry = {}) {
    const provenance = getRereviewProvenance(entry);
    if (!provenance || !Array.isArray(provenance.evidenceChecked) || provenance.evidenceChecked.length === 0) {
        return false;
    }

    const proofText = normalizeProofParts(provenance.evidenceChecked);
    const exactAudio = normalizeProofText(`word-reading-${normalizeText(entry.word)}-${normalizeStringArray(entry.readingIncludes)[0] || ""}`);
    const requiredChecklistPasses = REQUIRED_WORD_REREVIEW_CHECKS.every((check) => (
        proofTextIncludesAny(proofText, check.snippets)
    ));
    const exactAudioPasses = !exactAudio || proofText.includes(exactAudio);
    const goldenAsInternalOnly = !proofText.includes("golden regression")
        || proofText.includes("not source truth")
        || proofText.includes("internal regression");

    return requiredChecklistPasses && exactAudioPasses && goldenAsInternalOnly;
}

function structuredWordSentenceQualityReviewPasses(entry = {}) {
    const review = getRereviewProvenance(entry)?.sentenceQualityReview;
    if (!isPlainRecord(review)) {
        return false;
    }

    const reviewText = normalizeProofParts(review);
    const examples = normalizeStringArray(entry.exampleIncludes).map(normalizeProofText);
    const readings = normalizeStringArray(entry.readingIncludes).map(normalizeProofText);
    const hasExampleBinding = proofTextIncludesEvery(reviewText, examples);
    const hasReadingBinding = readings.length === 0 || readings.some((reading) => reviewText.includes(reading));
    const hasTranslationBinding = reviewText.includes("translation") || Boolean(normalizeText(review.translation));
    const requiredTruths = WORD_SENTENCE_QUALITY_REVIEW_BOOLEAN_FIELDS.map((field) => review[field]);

    return hasExampleBinding
        && hasReadingBinding
        && hasTranslationBinding
        && requiredTruths.every((value) => value === true);
}

function textualWordSentenceQualityReviewPasses(entry = {}) {
    const proofText = buildRereviewProvenanceText(entry);
    const examples = normalizeStringArray(entry.exampleIncludes).map(normalizeProofText);
    const readings = normalizeStringArray(entry.readingIncludes).map(normalizeProofText);
    const hasSentenceReviewMarker = proofTextIncludesAny(proofText, WORD_SENTENCE_REVIEW_TEXT_MARKERS);
    const hasExampleBinding = proofTextIncludesEvery(proofText, examples);
    const hasReadingBinding = readings.length === 0 || readings.some((reading) => proofText.includes(reading))
        || proofText.includes("exported reading");
    const hasTranslationBinding = proofText.includes("translation")
        || proofText.includes("reading translation")
        || proofText.includes("reading/translation")
        || proofText.includes("exported reading");
    const hasNaturalJudgment = /\bnatural(\s+japanese|\s+enough)?\b/.test(proofText);
    const hasLearnerUtilityJudgment = proofText.includes("learner useful")
        || proofText.includes("learner friendly")
        || /\buseful\b/.test(proofText);
    const hasLevelJudgment = proofText.includes("level appropriate");
    const hasReleaseQualityJudgment = proofText.includes("release quality")
        || proofText.includes("release judgment");
    const hasHumanMarker = /\b(human|manual)\b/.test(proofText);

    return hasSentenceReviewMarker
        && hasExampleBinding
        && hasReadingBinding
        && hasTranslationBinding
        && hasNaturalJudgment
        && hasLearnerUtilityJudgment
        && hasLevelJudgment
        && hasReleaseQualityJudgment
        && hasHumanMarker;
}

function hasWordSentenceQualityReviewProof(entry = {}) {
    return structuredWordSentenceQualityReviewPasses(entry) || textualWordSentenceQualityReviewPasses(entry);
}

function entryHasSubstantiveCurrentStandardRereviewProof(entry = {}) {
    return hasBaseStructuredRereviewProvenance(entry)
        && hasWordCardIdentityProof(entry)
        && wordRereviewEvidenceChecklistPasses(entry)
        && hasWordSentenceQualityReviewProof(entry);
}

module.exports = {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    NON_MECHANICAL_PROOF_MARKER,
    REQUIRED_WORD_REREVIEW_CHECKS,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    entryHasSubstantiveCurrentStandardRereviewProof,
    hasBaseStructuredRereviewProvenance,
    hasWordCardIdentityProof,
    hasWordSentenceQualityReviewProof,
    wordRereviewEvidenceChecklistPasses,
};
