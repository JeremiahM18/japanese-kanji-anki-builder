const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    evaluatePlatinumKanjiReviewSet,
    isCurrentStandardPlatinumEntry,
} = require("./platinumKanjiReviewService");
const { normalizeEvidenceEntries } = require("./platinumEvidenceService");

const REREVIEW_STATUS_CATEGORIES = Object.freeze({
    CURRENT_V3_PLATINUM_PASS: "current_v3_platinum_pass",
    CURRENT_V3_STRUCTURAL_PASS: "current_v3_platinum_pass",
    SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN: "substantive_current_standard_review_proven",
    NEEDS_SUBSTANTIVE_REREVIEW: "needs_substantive_rereview",
    BLOCKED_OR_FAILING: "blocked_or_failing",
});

const SUBSTANTIVE_REREVIEW_PROOF_MARKER = "substantive post-v3 human rereview";
const NON_MECHANICAL_PROOF_MARKER = "not mechanically migrated";
const MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER = "missing_substantive_current_standard_rereview_proof";
const SENTENCE_QUALITY_REVIEW_PROOF_MARKER = "example sentence quality review";
const STRUCTURED_REREVIEW_PROVENANCE_TYPE = "substantive current standard rereview";
const SENTENCE_QUALITY_REVIEW_BOOLEAN_FIELDS = Object.freeze([
    "naturalJapanese",
    "learnerUseful",
    "levelAppropriate",
    "supportOnly",
]);
const SENTENCE_REVIEW_TEXT_MARKERS = Object.freeze([
    "example review",
    "sentence quality review",
    normalizeProofText(SENTENCE_QUALITY_REVIEW_PROOF_MARKER),
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

function normalizeKanji(value) {
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

function getRereviewProvenance(entry = {}) {
    return isPlainRecord(entry.rereviewProvenance) ? entry.rereviewProvenance : null;
}

function normalizeStringArray(value) {
    return Array.isArray(value) ? value.map(normalizeProofText).filter(Boolean) : [];
}

function proofTextIncludesEvery(proofText, snippets = []) {
    return snippets.every((snippet) => proofText.includes(snippet));
}

function proofTextIncludesAny(proofText, snippets = []) {
    return snippets.some((snippet) => proofText.includes(snippet));
}

function buildResultByKanji(results = []) {
    const byKanji = new Map();

    for (const result of Array.isArray(results) ? results : []) {
        const kanji = normalizeKanji(result.kanji || result.label);
        if (!kanji) {
            continue;
        }
        if (!byKanji.has(kanji)) {
            byKanji.set(kanji, []);
        }
        byKanji.get(kanji).push(result);
    }

    return byKanji;
}

function buildEntryByKanji(entries = []) {
    const byKanji = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        const kanji = normalizeKanji(entry.kanji);
        if (!kanji) {
            continue;
        }
        if (!byKanji.has(kanji)) {
            byKanji.set(kanji, []);
        }
        byKanji.get(kanji).push(entry);
    }

    return byKanji;
}

function buildRereviewProvenanceText(entry = {}) {
    const evidenceText = normalizeEvidenceEntries(entry.reviewEvidence)
        .filter((evidence) => ["manual-review", "current-standard-review"].includes(evidence.type))
        .map((evidence) => `${evidence.source} ${evidence.detail}`)
        .join(" ");
    const provenance = getRereviewProvenance(entry) || {};
    const provenanceText = Object.entries(provenance)
        .map(([key, value]) => `${key} ${flattenProofValue(value)}`)
        .join(" ");

    return normalizeProofText(`${evidenceText} ${provenanceText}`);
}

function hasBaseStructuredRereviewProvenance(entry = {}) {
    const provenance = getRereviewProvenance(entry);
    if (!provenance) {
        return false;
    }

    return normalizeProofText(provenance.type) === STRUCTURED_REREVIEW_PROVENANCE_TYPE
        && normalizeText(provenance.reviewStandard) === CURRENT_KANJI_PLATINUM_REVIEW_STANDARD
        && provenance.reviewedAfterStandard === true
        && provenance.mechanicalMigration === false
        && Boolean(normalizeText(provenance.reviewer || entry.reviewer));
}

function hasCardIdentityProof(entry = {}) {
    const provenance = getRereviewProvenance(entry);
    if (!provenance) {
        return false;
    }
    const proofText = normalizeProofParts([
        provenance.cardReviewed,
        provenance.evidenceChecked,
        provenance.sentenceQualityReview,
    ]);
    const kanji = normalizeProofText(entry.kanji);
    const readings = normalizeStringArray(entry.readingIncludes);
    const hasKanji = kanji && proofText.includes(kanji);
    const hasReading = readings.length === 0 || readings.some((reading) => proofText.includes(reading));

    return Boolean(hasKanji && hasReading);
}

function structuredSentenceQualityReviewPasses(entry = {}) {
    const review = getRereviewProvenance(entry)?.sentenceQualityReview;
    if (!isPlainRecord(review)) {
        return false;
    }

    const reviewText = normalizeProofParts(review);
    const examples = normalizeStringArray(entry.exampleIncludes);
    const hasExampleBinding = proofTextIncludesEvery(reviewText, examples);
    const requiredTruths = SENTENCE_QUALITY_REVIEW_BOOLEAN_FIELDS.map((field) => review[field]);

    return hasExampleBinding && requiredTruths.every((value) => value === true);
}

function textualSentenceQualityReviewPasses(entry = {}) {
    const proofText = buildRereviewProvenanceText(entry);
    const examples = normalizeStringArray(entry.exampleIncludes);
    const hasSentenceReviewMarker = proofTextIncludesAny(proofText, SENTENCE_REVIEW_TEXT_MARKERS);
    const hasExampleBinding = proofTextIncludesEvery(proofText, examples);
    const hasNaturalJudgment = /\bnatural(\s+japanese|\s+enough)?\b/.test(proofText);
    const hasLearnerUtilityJudgment = proofText.includes("learner useful")
        || proofText.includes("learner friendly")
        || /\buseful\b/.test(proofText);
    const hasLevelJudgment = proofText.includes("level appropriate");
    const hasSupportOnlyJudgment = proofText.includes("support only");
    const hasReviewerJudgment = proofText.includes("reviewer judgment")
        || /\b(human|manual)\b/.test(proofText);

    return hasSentenceReviewMarker
        && hasExampleBinding
        && hasNaturalJudgment
        && hasLearnerUtilityJudgment
        && hasLevelJudgment
        && hasSupportOnlyJudgment
        && hasReviewerJudgment;
}

function hasKanjiSentenceQualityReviewProof(entry = {}) {
    return structuredSentenceQualityReviewPasses(entry) || textualSentenceQualityReviewPasses(entry);
}

function hasStructuredRereviewProvenance(entry = {}) {
    return hasBaseStructuredRereviewProvenance(entry)
        && hasCardIdentityProof(entry)
        && hasKanjiSentenceQualityReviewProof(entry);
}

function entryHasSubstantiveCurrentStandardRereviewProof(entry = {}) {
    return hasStructuredRereviewProvenance(entry);
}

function buildMissingRereviewProofReason(entry = {}) {
    const hasRevalidatedAt = Boolean(normalizeText(entry.revalidatedAt));
    const currentStandardEvidence = normalizeEvidenceEntries(entry.reviewEvidence)
        .some((evidence) => evidence.type === "current-standard-review");
    const hasBaseProvenance = hasBaseStructuredRereviewProvenance(entry);
    const hasCardIdentity = hasCardIdentityProof(entry);
    const hasSentenceQualityProof = hasKanjiSentenceQualityReviewProof(entry);
    const observed = [
        hasRevalidatedAt ? "revalidatedAt" : "",
        currentStandardEvidence ? "current-standard-review lane" : "",
        hasBaseProvenance ? "base rereviewProvenance metadata" : "",
        hasBaseProvenance && !hasCardIdentity ? "rereviewProvenance without card identity binding" : "",
        hasBaseProvenance && !hasSentenceQualityProof ? "rereviewProvenance without actual example sentence quality review proof" : "",
    ].filter(Boolean);

    return [
        MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        "requires explicit non-mechanical post-v3 human rereview provenance with actual example sentence quality review proof",
        observed.length > 0 ? `observed ${observed.join(" and ")} only` : "no current-standard rereview provenance observed",
    ].join(": ");
}

function buildBlockedReasons({
    kanji = "",
    matchingEntries = [],
    matchingResults = [],
    reviewReport = {},
} = {}) {
    const reasons = [];

    if (reviewReport.missingPlatinumRows?.includes(kanji)) {
        reasons.push("missing current-standard structural entry");
    }
    if (reviewReport.duplicateActiveEntries?.includes(kanji)) {
        reasons.push("duplicate active current-standard structural entries");
    }
    for (const result of matchingResults) {
        if (!result.passed && result.failures?.length > 0) {
            reasons.push(...result.failures);
        }
    }
    if (matchingEntries.length === 0 && reasons.length === 0) {
        reasons.push("no platinum manifest entry found for generated kanji");
    }

    return [...new Set(reasons)];
}

function classifyGeneratedKanjiRereviewStatus({
    row = {},
    matchingEntries = [],
    matchingResults = [],
    reviewReport = {},
} = {}) {
    const kanji = normalizeKanji(row.kanji);
    const activeCurrentEntries = matchingEntries.filter(isCurrentStandardPlatinumEntry);
    const passedResultExists = matchingResults.some((result) => result.passed);
    const duplicateActive = reviewReport.duplicateActiveEntries?.includes(kanji);
    const platinumPassingEntry = !duplicateActive && activeCurrentEntries.find((entry) => (
        matchingResults.some((result) => result.passed && result.kanji === entry.kanji)
    ));

    if (!platinumPassingEntry || !passedResultExists || duplicateActive) {
        return {
            kanji,
            categories: [REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING],
            platinumPassed: false,
            substantiveRereviewProven: false,
            needsSubstantiveRereview: false,
            blockedOrFailing: true,
            status: REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING,
            reasons: buildBlockedReasons({
                kanji,
                matchingEntries,
                matchingResults,
                reviewReport,
            }),
        };
    }

    if (entryHasSubstantiveCurrentStandardRereviewProof(platinumPassingEntry)) {
        return {
            kanji,
            categories: [
                REREVIEW_STATUS_CATEGORIES.CURRENT_V3_PLATINUM_PASS,
                REREVIEW_STATUS_CATEGORIES.SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN,
            ],
            platinumPassed: true,
            substantiveRereviewProven: true,
            needsSubstantiveRereview: false,
            blockedOrFailing: false,
            status: REREVIEW_STATUS_CATEGORIES.SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN,
            reasons: [],
        };
    }

    return {
        kanji,
        categories: [
            REREVIEW_STATUS_CATEGORIES.CURRENT_V3_PLATINUM_PASS,
            REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        ],
        platinumPassed: true,
        substantiveRereviewProven: false,
        needsSubstantiveRereview: true,
        blockedOrFailing: false,
        status: REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        reasons: [buildMissingRereviewProofReason(platinumPassingEntry)],
    };
}

function countCards(cards = [], predicate) {
    return (Array.isArray(cards) ? cards : []).filter(predicate).length;
}

function summarizeCards(cards = []) {
    return {
        current_v3_platinum_pass: countCards(cards, (card) => card.platinumPassed ?? card.structuralPassed),
        current_v3_structural_pass: countCards(cards, (card) => card.platinumPassed ?? card.structuralPassed),
        substantive_current_standard_review_proven: countCards(cards, (card) => card.substantiveRereviewProven),
        needs_substantive_rereview: countCards(cards, (card) => card.needsSubstantiveRereview),
        blocked_or_failing: countCards(cards, (card) => card.blockedOrFailing),
    };
}

function buildPlatinumKanjiRereviewStatusReport({
    rows = [],
    entries = [],
    goldenExpectations,
    sapphireEntries,
    sapphireResults = [],
    requireLanePreconditions = false,
    level = null,
    kanjiSourceEvidence,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const reviewReport = evaluatePlatinumKanjiReviewSet({
        rows: generatedRows,
        entries: reviewEntries,
        goldenExpectations,
        requireGoldPrecondition: requireLanePreconditions,
        sapphireEntries,
        sapphireResults,
        requireSapphirePrecondition: requireLanePreconditions,
        kanjiSourceEvidence,
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const entriesByKanji = buildEntryByKanji(reviewEntries);
    const resultsByKanji = buildResultByKanji(reviewReport.results);
    const cards = generatedRows
        .map((row) => classifyGeneratedKanjiRereviewStatus({
            row,
            matchingEntries: entriesByKanji.get(normalizeKanji(row.kanji)) || [],
            matchingResults: resultsByKanji.get(normalizeKanji(row.kanji)) || [],
            reviewReport,
        }))
        .sort((left, right) => left.kanji.localeCompare(right.kanji, "ja"));
    const counts = summarizeCards(cards);

    return {
        level,
        currentReviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        generatedRows: generatedRows.length,
        reviewEntries: reviewEntries.length,
        categories: REREVIEW_STATUS_CATEGORIES,
        proofPolicy: {
            proofMarker: SUBSTANTIVE_REREVIEW_PROOF_MARKER,
            nonMechanicalMarker: NON_MECHANICAL_PROOF_MARKER,
            missingProofMarker: MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
            sentenceQualityReviewProofMarker: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
            note: "revalidatedAt and required v3 current-standard-review lane text are Platinum evidence, not standalone proof of substantive post-v3 human rereview or actual example sentence quality review",
        },
        counts,
        passed: counts.blocked_or_failing === 0,
        platinumReviewPassed: reviewReport.passed,
        platinumCoverageFailures: reviewReport.coverageFailures || [],
        cards,
    };
}

function buildAggregateCounts(levelReports = []) {
    return (Array.isArray(levelReports) ? levelReports : []).reduce((totals, report) => {
        for (const key of new Set(Object.values(REREVIEW_STATUS_CATEGORIES))) {
            totals[key] = (totals[key] || 0) + (report.counts?.[key] || 0);
        }
        totals.generatedRows += report.generatedRows || 0;
        totals.reviewEntries += report.reviewEntries || 0;
        return totals;
    }, {
        generatedRows: 0,
        reviewEntries: 0,
        current_v3_platinum_pass: 0,
        current_v3_structural_pass: 0,
        substantive_current_standard_review_proven: 0,
        needs_substantive_rereview: 0,
        blocked_or_failing: 0,
    });
}

function buildPlatinumKanjiRereviewStatusSummary(levelReports = []) {
    const reports = Array.isArray(levelReports) ? levelReports : [];
    return {
        currentReviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        proofMarker: SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        nonMechanicalMarker: NON_MECHANICAL_PROOF_MARKER,
        missingProofMarker: MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        sentenceQualityReviewProofMarker: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
        passed: reports.every((report) => report.passed),
        totals: buildAggregateCounts(reports),
        levels: reports,
    };
}

function formatSample(cards = [], { limit = 24 } = {}) {
    const kanji = (Array.isArray(cards) ? cards : []).map((card) => card.kanji).filter(Boolean);
    if (kanji.length === 0) {
        return "none";
    }

    const sample = kanji.slice(0, limit).join(", ");
    return kanji.length > limit ? `${sample}, ... ${kanji.length - limit} more` : sample;
}

function formatPlatinumKanjiRereviewStatusReport(summary = {}) {
    const totals = summary.totals || {};
    const lines = [
        "Japanese Kanji Builder Kanji Obsidian Proof Status",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_KANJI_PLATINUM_REVIEW_STANDARD}`,
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Generated active kanji rows: ${totals.generatedRows || 0}`,
        `Review entries: ${totals.reviewEntries || 0}`,
        "",
        "| Scope | Generated deck rows | Platinum | Obsidian certified (substantive proof) | Platinum entries needing Obsidian | Blocked/failing deck rows |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const report of summary.levels || []) {
        const counts = report.counts || {};
        lines.push([
            `| N${report.level}`,
            report.generatedRows || 0,
            counts.current_v3_platinum_pass || counts.current_v3_structural_pass || 0,
            counts.substantive_current_standard_review_proven || 0,
            counts.needs_substantive_rereview || 0,
            counts.blocked_or_failing || 0,
        ].join(" | ") + " |");
    }

    lines.push([
        "| Total",
        totals.generatedRows || 0,
        totals.current_v3_platinum_pass || totals.current_v3_structural_pass || 0,
        totals.substantive_current_standard_review_proven || 0,
        totals.needs_substantive_rereview || 0,
        totals.blocked_or_failing || 0,
    ].join(" | ") + " |");

    lines.push(
        "",
        "Proof policy:",
        "- Tier model: Silver = generated surface exists, Gold = golden regression, Sapphire = structural gate, Platinum = current-standard card-surface inspection, Obsidian = explicit non-mechanical current-version certification proof.",
        "- Generated deck rows are the certification denominator. Platinum subsets do not shrink the Obsidian queue.",
        `- ${summary.missingProofMarker || MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER}: Platinum lane validity is not counted as Obsidian certification proof by itself.`,
        `- To count as Obsidian certified, an entry must carry structured rereviewProvenance with explicit ${summary.proofMarker || SUBSTANTIVE_REREVIEW_PROOF_MARKER} provenance, ${summary.nonMechanicalMarker || NON_MECHANICAL_PROOF_MARKER} language, card identity binding, and actual ${summary.sentenceQualityReviewProofMarker || SENTENCE_QUALITY_REVIEW_PROOF_MARKER} evidence.`,
        "- This report is read-only. It does not promote, defer, reject, or edit cards."
    );

    for (const report of summary.levels || []) {
        const needs = (report.cards || []).filter((card) => card.needsSubstantiveRereview);
        const blocked = (report.cards || []).filter((card) => card.blockedOrFailing);
        const proven = (report.cards || []).filter((card) => card.substantiveRereviewProven);
        lines.push(
            "",
            `N${report.level} details:`,
            `- Obsidian certified sample: ${formatSample(proven)}`,
            `- needs Obsidian sample: ${formatSample(needs)}`,
            `- blocked/failing sample: ${formatSample(blocked)}`
        );
        if (blocked.length > 0) {
            for (const card of blocked.slice(0, 12)) {
                lines.push(`  - ${card.kanji}: ${card.reasons.join("; ")}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    NON_MECHANICAL_PROOF_MARKER,
    REREVIEW_STATUS_CATEGORIES,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    buildPlatinumKanjiRereviewStatusReport,
    buildPlatinumKanjiRereviewStatusSummary,
    entryHasSubstantiveCurrentStandardRereviewProof,
    formatPlatinumKanjiRereviewStatusReport,
    hasKanjiSentenceQualityReviewProof,
};
