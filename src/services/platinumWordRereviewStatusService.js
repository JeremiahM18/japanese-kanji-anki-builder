const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    evaluatePlatinumWordReviewSet,
    entryUsesCurrentWordPlatinumStandard,
} = require("./platinumReviewService");
const { normalizeEvidenceEntries } = require("./platinumEvidenceService");
const { buildWordIdentity } = require("./platinumWordBatchReportService");

const REREVIEW_STATUS_CATEGORIES = Object.freeze({
    CURRENT_V3_STRUCTURAL_PASS: "current_v3_structural_pass",
    SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN: "substantive_current_standard_review_proven",
    NEEDS_SUBSTANTIVE_REREVIEW: "needs_substantive_rereview",
    BLOCKED_OR_FAILING: "blocked_or_failing",
});

const SUBSTANTIVE_REREVIEW_PROOF_MARKER = "substantive post-v3 human rereview";
const NON_MECHANICAL_PROOF_MARKER = "not mechanically migrated";
const MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER = "missing_substantive_current_standard_word_rereview_proof";

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

function buildRereviewProvenanceText(entry = {}) {
    const evidenceText = normalizeEvidenceEntries(entry.reviewEvidence)
        .filter((evidence) => ["manual-review", "current-standard-review"].includes(evidence.type))
        .map((evidence) => `${evidence.source} ${evidence.detail}`)
        .join(" ");
    const provenance = entry.rereviewProvenance && typeof entry.rereviewProvenance === "object"
        ? entry.rereviewProvenance
        : {};
    const provenanceText = Object.entries(provenance)
        .map(([key, value]) => `${key} ${value}`)
        .join(" ");

    return normalizeProofText(`${evidenceText} ${provenanceText}`);
}

function hasStructuredRereviewProvenance(entry = {}) {
    const provenance = entry.rereviewProvenance;
    if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
        return false;
    }

    return normalizeProofText(provenance.type) === "substantive current standard rereview"
        && normalizeText(provenance.reviewStandard) === CURRENT_WORD_PLATINUM_REVIEW_STANDARD
        && provenance.reviewedAfterStandard === true
        && provenance.mechanicalMigration === false
        && Boolean(normalizeText(provenance.reviewer || entry.reviewer));
}

function hasTextualRereviewProvenance(entry = {}) {
    const proofText = buildRereviewProvenanceText(entry);
    const hasSubstantiveMarker = proofText.includes(normalizeProofText(SUBSTANTIVE_REREVIEW_PROOF_MARKER))
        || proofText.includes("substantive current standard rereview");
    const hasHumanMarker = /\b(human|manual)\b/.test(proofText);
    const hasNonMechanicalMarker = proofText.includes(normalizeProofText(NON_MECHANICAL_PROOF_MARKER))
        || proofText.includes("not a mechanical migration")
        || proofText.includes("not migration only")
        || proofText.includes("non mechanical");

    return hasSubstantiveMarker && hasHumanMarker && hasNonMechanicalMarker;
}

function entryHasSubstantiveCurrentStandardRereviewProof(entry = {}) {
    return hasStructuredRereviewProvenance(entry) || hasTextualRereviewProvenance(entry);
}

function buildMissingRereviewProofReason(entry = {}) {
    const hasRevalidatedAt = Boolean(normalizeText(entry.revalidatedAt));
    const currentStandardEvidence = normalizeEvidenceEntries(entry.reviewEvidence)
        .some((evidence) => evidence.type === "current-standard-review");
    const observed = [
        hasRevalidatedAt ? "revalidatedAt" : "",
        currentStandardEvidence ? "current-standard-review lane" : "",
    ].filter(Boolean);

    return [
        MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        "requires explicit non-mechanical post-v3 human rereview provenance",
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
        reasons.push("missing current-standard structural entry");
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
    const structurallyPassingEntry = !duplicateActive && activeCurrentEntries.find((entry) => (
        matchingResults.some((result) => result.passed && result.word === entry.word)
    ));

    if (!structurallyPassingEntry || !passedResultExists || duplicateActive) {
        return {
            identity,
            label,
            word: row.word,
            reading: row.reading,
            categories: [REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING],
            structuralPassed: false,
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

    if (entryHasSubstantiveCurrentStandardRereviewProof(structurallyPassingEntry)) {
        return {
            identity,
            label,
            word: row.word,
            reading: row.reading,
            categories: [
                REREVIEW_STATUS_CATEGORIES.CURRENT_V3_STRUCTURAL_PASS,
                REREVIEW_STATUS_CATEGORIES.SUBSTANTIVE_CURRENT_STANDARD_REVIEW_PROVEN,
            ],
            structuralPassed: true,
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
            REREVIEW_STATUS_CATEGORIES.CURRENT_V3_STRUCTURAL_PASS,
            REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        ],
        structuralPassed: true,
        substantiveRereviewProven: false,
        needsSubstantiveRereview: true,
        blockedOrFailing: false,
        status: REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        reasons: [buildMissingRereviewProofReason(structurallyPassingEntry)],
    };
}

function countCards(cards = [], predicate) {
    return (Array.isArray(cards) ? cards : []).filter(predicate).length;
}

function summarizeCards(cards = []) {
    return {
        current_v3_structural_pass: countCards(cards, (card) => card.structuralPassed),
        substantive_current_standard_review_proven: countCards(cards, (card) => card.substantiveRereviewProven),
        needs_substantive_rereview: countCards(cards, (card) => card.needsSubstantiveRereview),
        blocked_or_failing: countCards(cards, (card) => card.blockedOrFailing),
    };
}

function buildPlatinumWordRereviewStatusReport({
    rows = [],
    entries = [],
    level = null,
    wordPitchAccentData = {},
    kanjiLevelData = null,
} = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const reviewReport = evaluatePlatinumWordReviewSet({
        rows: generatedRows,
        entries: reviewEntries,
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
            note: "revalidatedAt and required v3 current-standard-review lane text are structural evidence, not standalone proof of substantive post-v3 human rereview",
        },
        counts,
        passed: counts.blocked_or_failing === 0,
        structuralReviewPassed: reviewReport.passed,
        structuralCoverageFailures: reviewReport.coverageFailures || [],
        cards,
    };
}

function buildAggregateCounts(levelReports = []) {
    return (Array.isArray(levelReports) ? levelReports : []).reduce((totals, report) => {
        for (const key of Object.values(REREVIEW_STATUS_CATEGORIES)) {
            totals[key] = (totals[key] || 0) + (report.counts?.[key] || 0);
        }
        totals.generatedRows += report.generatedRows || 0;
        totals.reviewEntries += report.reviewEntries || 0;
        return totals;
    }, {
        generatedRows: 0,
        reviewEntries: 0,
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
        proofMarker: SUBSTANTIVE_REREVIEW_PROOF_MARKER,
        nonMechanicalMarker: NON_MECHANICAL_PROOF_MARKER,
        missingProofMarker: MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
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
        "Japanese Kanji Builder Platinum Word Rereview Status",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Generated active word rows: ${totals.generatedRows || 0}`,
        `Review entries: ${totals.reviewEntries || 0}`,
        "",
        "| Scope | Generated deck rows | Platinum pass (structural gate) | Obsidian certified (substantive proof) | Platinum entries needing Obsidian | Blocked/failing deck rows |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const report of summary.levels || []) {
        const counts = report.counts || {};
        lines.push([
            `| N${report.level}`,
            report.generatedRows || 0,
            counts.current_v3_structural_pass || 0,
            counts.substantive_current_standard_review_proven || 0,
            counts.needs_substantive_rereview || 0,
            counts.blocked_or_failing || 0,
        ].join(" | ") + " |");
    }

    lines.push([
        "| Total",
        totals.generatedRows || 0,
        totals.current_v3_structural_pass || 0,
        totals.substantive_current_standard_review_proven || 0,
        totals.needs_substantive_rereview || 0,
        totals.blocked_or_failing || 0,
    ].join(" | ") + " |");

    lines.push(
        "",
        "Proof policy:",
        "- Tier model: Silver = generated surface exists, Gold = golden regression, Platinum = current-standard structural gate, Obsidian = explicit non-mechanical current-version certification proof.",
        "- Generated deck rows are the certification denominator. Platinum subsets do not shrink the Obsidian queue.",
        `- ${summary.missingProofMarker || MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER}: Platinum lane validity is not counted as Obsidian certification proof by itself.`,
        `- To count as Obsidian certified, an entry must carry explicit ${summary.proofMarker || SUBSTANTIVE_REREVIEW_PROOF_MARKER} provenance and ${summary.nonMechanicalMarker || NON_MECHANICAL_PROOF_MARKER} language, or equivalent structured rereviewProvenance metadata.`,
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
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    NON_MECHANICAL_PROOF_MARKER,
    REREVIEW_STATUS_CATEGORIES,
    SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    buildPlatinumWordRereviewStatusReport,
    buildPlatinumWordRereviewStatusSummary,
    entryHasSubstantiveCurrentStandardRereviewProof,
    formatPlatinumWordRereviewStatusReport,
};
