const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    evaluatePlatinumWordReviewSet,
    entryUsesCurrentWordPlatinumStandard,
} = require("./platinumReviewService");
const { normalizeEvidenceEntries } = require("./platinumEvidenceService");
const { buildWordIdentity } = require("./platinumWordBatchReportService");
const {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    NON_MECHANICAL_PROOF_MARKER,
    SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    entryHasSubstantiveCurrentStandardRereviewProof,
    hasBaseStructuredRereviewProvenance,
    hasCurrentWordObsidianStandardVersion,
    hasWordCardIdentityProof,
    hasWordSentenceAudioReviewProof,
    hasWordSentenceQualityReviewProof,
    wordRereviewEvidenceChecklistPasses,
} = require("./platinumWordObsidianProofService");

const REREVIEW_STATUS_CATEGORIES = Object.freeze({
    CURRENT_V3_PLATINUM_PASS: "current_v3_platinum_pass",
    CURRENT_V3_STRUCTURAL_PASS: "current_v3_platinum_pass",
    SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN: "substantive_current_standard_review_proven",
    NEEDS_SUBSTANTIVE_REREVIEW: "needs_substantive_rereview",
    BLOCKED_OR_FAILING: "blocked_or_failing",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildEntryIdentity(entry = {}) {
    return buildWordIdentity({
        word: entry.word,
        reading: normalizeStringArray(entry.readingIncludes).join(" / "),
    });
}

function buildEntryIdentities(entry = {}) {
    const word = normalizeText(entry.word);
    const readings = normalizeStringArray(entry.readingIncludes);
    return readings.length > 0
        ? readings.map((reading) => buildWordIdentity({ word, reading })).filter(Boolean)
        : [buildWordIdentity({ word })].filter(Boolean);
}

function buildRowIdentity(row = {}) {
    return buildWordIdentity({
        word: row.word,
        reading: row.reading,
    });
}

function buildWordLabel({ word = "", reading = "" } = {}) {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
}

function buildEntriesByIdentity(entries = []) {
    const byIdentity = new Map();

    for (const entry of Array.isArray(entries) ? entries : []) {
        for (const identity of buildEntryIdentities(entry)) {
            if (!byIdentity.has(identity)) {
                byIdentity.set(identity, []);
            }
            byIdentity.get(identity).push(entry);
        }
    }

    return byIdentity;
}

function buildResultsByIdentity({ entries = [], results = [] } = {}) {
    const byIdentity = new Map();
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const reviewResults = Array.isArray(results) ? results : [];

    for (let index = 0; index < reviewResults.length; index += 1) {
        const identities = new Set([
            buildEntryIdentity(reviewEntries[index] || {}),
            ...buildEntryIdentities(reviewEntries[index] || {}),
        ].filter(Boolean));
        for (const identity of identities) {
            if (!byIdentity.has(identity)) {
                byIdentity.set(identity, []);
            }
            byIdentity.get(identity).push(reviewResults[index]);
        }
    }

    return byIdentity;
}

function buildMissingRereviewProofReason(entry = {}) {
    const hasRevalidatedAt = Boolean(normalizeText(entry.revalidatedAt));
    const currentStandardEvidence = normalizeEvidenceEntries(entry.reviewEvidence)
        .some((evidence) => evidence.type === "current-standard-review");
    const hasBaseProvenance = hasBaseStructuredRereviewProvenance(entry);
    const hasCurrentObsidianVersion = hasCurrentWordObsidianStandardVersion(entry);
    const hasCardIdentity = hasWordCardIdentityProof(entry);
    const hasEvidenceChecklist = wordRereviewEvidenceChecklistPasses(entry);
    const hasSentenceQualityProof = hasWordSentenceQualityReviewProof(entry);
    const hasSentenceAudioProof = hasWordSentenceAudioReviewProof(entry);
    const observed = [
        hasRevalidatedAt ? "revalidatedAt" : "",
        currentStandardEvidence ? "current-standard-review lane" : "",
        hasBaseProvenance ? "base rereviewProvenance metadata" : "",
        hasBaseProvenance && !hasCurrentObsidianVersion ? `legacy or missing Obsidian standard version instead of ${CURRENT_WORD_OBSIDIAN_STANDARD_VERSION}` : "",
        hasBaseProvenance && !hasCardIdentity ? "rereviewProvenance without word-reading card identity binding" : "",
        hasBaseProvenance && !hasEvidenceChecklist ? "rereviewProvenance without full word-card evidence checklist" : "",
        hasBaseProvenance && !hasSentenceQualityProof ? "rereviewProvenance without actual example sentence quality review proof" : "",
        hasBaseProvenance && !hasSentenceAudioProof ? "rereviewProvenance without exact example sentence audio review proof" : "",
    ].filter(Boolean);

    return [
        MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        `requires explicit non-mechanical ${CURRENT_WORD_OBSIDIAN_STANDARD_VERSION} proof with word-reading card identity binding, full word-card evidence checklist, actual example sentence quality review proof, and exact example sentence audio review proof`,
        observed.length > 0 ? `observed ${observed.join(" and ")} only` : "no current-standard rereview provenance observed",
    ].join(": ");
}

function buildBlockedReasons({
    identity = "",
    label = "",
    matchingEntries = [],
    matchingResults = [],
    reviewReport = {},
} = {}) {
    const reasons = [];

    if (reviewReport.missingPlatinumRows?.includes(label) || reviewReport.missingPlatinumRows?.includes(identity)) {
        reasons.push("missing active platinum entry for generated word");
    }
    if (reviewReport.missingCurrentStandardRows?.includes(label) || reviewReport.missingCurrentStandardRows?.includes(identity)) {
            reasons.push("missing current-standard Platinum entry");
    }
    if (reviewReport.duplicateActiveEntries?.includes(label) || reviewReport.duplicateActiveEntries?.includes(identity)) {
        reasons.push("duplicate active platinum entries");
    }
    for (const result of matchingResults) {
        if (!result.passed && result.failures?.length > 0) {
            reasons.push(...result.failures);
        }
    }
    if (matchingEntries.length === 0 && reasons.length === 0) {
        reasons.push("no platinum manifest entry found for generated word");
    }

    return [...new Set(reasons)];
}

function classifyGeneratedWordRereviewStatus({
    row = {},
    matchingEntries = [],
    matchingResults = [],
    reviewReport = {},
} = {}) {
    const identity = buildRowIdentity(row);
    const label = buildWordLabel(row);
    const activeCurrentEntries = matchingEntries.filter(entryUsesCurrentWordPlatinumStandard);
    const passedResultExists = matchingResults.some((result) => result.passed);
    const duplicateActive = reviewReport.duplicateActiveEntries?.includes(label)
        || reviewReport.duplicateActiveEntries?.includes(identity);
    const platinumPassingEntry = !duplicateActive && activeCurrentEntries.find((entry) => (
        matchingResults.some((result) => result.passed && result.word === entry.word)
    ));

    if (!platinumPassingEntry || !passedResultExists || duplicateActive) {
        return {
            identity,
            label,
            word: row.word,
            reading: row.reading,
            categories: [REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING],
            platinumPassed: false,
            substantiveRereviewProven: false,
            needsSubstantiveRereview: false,
            blockedOrFailing: true,
            status: REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING,
            reasons: buildBlockedReasons({
                identity,
                label,
                matchingEntries,
                matchingResults,
                reviewReport,
            }),
        };
    }

    if (entryHasSubstantiveCurrentStandardRereviewProof(platinumPassingEntry)) {
        return {
            identity,
            label,
            word: row.word,
            reading: row.reading,
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
        identity,
        label,
        word: row.word,
        reading: row.reading,
        categories: [
            REREVIEW_STATUS_CATEGORIES.CURRENT_V3_PLATINUM_PASS,
            REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        ],
        platinumPassed: true,
        substantiveRereviewProven: false,
        currentObsidianProofObserved: hasBaseStructuredRereviewProvenance(platinumPassingEntry)
            && hasCurrentWordObsidianStandardVersion(platinumPassingEntry),
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

function buildPlatinumWordRereviewStatusReport({
    rows = [],
    rowsByWritten = null,
    entries = [],
    goldenExpectations,
    goldenExpectationsByIdentity = null,
    sapphireEntries,
    currentStandardSapphireEntriesByIdentity = null,
    sapphireResults = [],
    requireLanePreconditions = false,
    level = null,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const reviewReport = evaluatePlatinumWordReviewSet({
        rows: generatedRows,
        rowsByWritten,
        entries: reviewEntries,
        goldenExpectations,
        goldenExpectationsByIdentity,
        requireGoldPrecondition: requireLanePreconditions,
        sapphireEntries,
        currentStandardSapphireEntriesByIdentity,
        sapphireResults,
        requireSapphirePrecondition: requireLanePreconditions,
        wordPitchAccentData,
        kanjiLevelData,
        requireAllRows: true,
        requireCurrentReviewStandard: true,
    });
    const entriesByIdentity = buildEntriesByIdentity(reviewEntries);
    const resultsByIdentity = buildResultsByIdentity({
        entries: reviewEntries,
        results: reviewReport.results,
    });
    const cards = generatedRows
        .map((row) => {
            const identity = buildRowIdentity(row);
            return classifyGeneratedWordRereviewStatus({
                row,
                matchingEntries: entriesByIdentity.get(identity) || [],
                matchingResults: resultsByIdentity.get(identity) || [],
                reviewReport,
            });
        })
        .sort((left, right) => left.identity.localeCompare(right.identity, "ja"));
    const counts = summarizeCards(cards);

    return {
        level,
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        generatedRows: generatedRows.length,
        reviewEntries: reviewEntries.length,
        categories: REREVIEW_STATUS_CATEGORIES,
        proofPolicy: {
            proofMarker: SUBSTANTIVE_REREVIEW_PROOF_MARKER,
            nonMechanicalMarker: NON_MECHANICAL_PROOF_MARKER,
            missingProofMarker: MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
            sentenceQualityReviewProofMarker: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
            sentenceAudioReviewProofMarker: SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
            obsidianStandardVersion: CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
            note: "revalidatedAt and required v3 current-standard-review lane text are Platinum evidence, not standalone proof of Obsidian v2.5 rereview, actual word example sentence quality review, or exact example sentence audio proof",
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

function buildPlatinumWordRereviewStatusSummary(levelReports = []) {
    const reports = Array.isArray(levelReports) ? levelReports : [];
    return {
        currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        obsidianStandardVersion: CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
        proofMarker: SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        nonMechanicalMarker: NON_MECHANICAL_PROOF_MARKER,
        missingProofMarker: MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        sentenceQualityReviewProofMarker: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
        sentenceAudioReviewProofMarker: SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
        passed: reports.every((report) => report.passed),
        totals: buildAggregateCounts(reports),
        levels: reports,
    };
}

function formatSample(cards = [], { limit = 24 } = {}) {
    const identities = (Array.isArray(cards) ? cards : [])
        .map((card) => card.identity)
        .filter(Boolean);
    if (identities.length === 0) {
        return "none";
    }

    const sample = identities.slice(0, limit).join(", ");
    return identities.length > limit ? `${sample}, ... ${identities.length - limit} more` : sample;
}

function formatPlatinumWordRereviewStatusReport(summary = {}) {
    const totals = summary.totals || {};
    const lines = [
        "Japanese Kanji Builder Word Obsidian Proof Status",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Current Obsidian standard: ${summary.obsidianStandardVersion || CURRENT_WORD_OBSIDIAN_STANDARD_VERSION}`,
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Generated active word rows: ${totals.generatedRows || 0}`,
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
        `- To count as current Obsidian certified, an entry must carry structured rereviewProvenance with ${summary.obsidianStandardVersion || CURRENT_WORD_OBSIDIAN_STANDARD_VERSION}, explicit ${summary.proofMarker || SUBSTANTIVE_REREVIEW_PROOF_MARKER} provenance, ${summary.nonMechanicalMarker || NON_MECHANICAL_PROOF_MARKER} language, exact word-reading card identity binding, a full word-card evidence checklist, actual ${summary.sentenceQualityReviewProofMarker || SENTENCE_QUALITY_REVIEW_PROOF_MARKER} evidence, and exact ${summary.sentenceAudioReviewProofMarker || SENTENCE_AUDIO_REVIEW_PROOF_MARKER} evidence.`,
        "- Legacy word Obsidian proof remains dated history and does not count as current v2.5 certification.",
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
                lines.push(`  - ${card.identity}: ${card.reasons.join("; ")}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    NON_MECHANICAL_PROOF_MARKER,
    REREVIEW_STATUS_CATEGORIES,
    SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    buildPlatinumWordRereviewStatusReport,
    buildPlatinumWordRereviewStatusSummary,
    entryHasSubstantiveCurrentStandardRereviewProof,
    formatPlatinumWordRereviewStatusReport,
    hasWordSentenceQualityReviewProof,
    wordRereviewEvidenceChecklistPasses,
};
