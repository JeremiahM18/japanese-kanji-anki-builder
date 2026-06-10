const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
} = require("./platinumKanjiReviewService");
const {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    REREVIEW_STATUS_CATEGORIES,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    buildPlatinumKanjiRereviewStatusSummary,
} = require("./platinumKanjiRereviewStatusService");

const OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE = "Current Obsidian certification is non-human governed native/fluent-quality proof for the scoped version. The gate verifies structure, source binding, protected snippets, audio identity, stroke-order identity, canonical proof binding, and card-bound sentence-quality review evidence; future human/native review is separate provenance for the same standard.";
const MANUAL_SENTENCE_REVIEW_BOUNDARY_NOTE = OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE;
const REQUIRED_ZERO_COUNTS = Object.freeze(["blocked_or_failing", "needs_substantive_rereview"]);
const CERTIFICATION_AUTOMATION_CHECKS = Object.freeze([
    "current-standard Platinum",
    "governed Japanese-source binding",
    "protected field snippets",
    "exact primary-reading audio identity",
    "stroke-order media identity",
    "card-bound Obsidian rereview provenance",
    "presence of actual example sentence quality review proof",
]);
const NEEDS_REREVIEW_EXPECTED = "explicit non-mechanical substantive current-standard Obsidian rereview proof after Platinum, including actual example sentence quality review proof";
const NEEDS_REREVIEW_ACTION = "Perform the Obsidian rereview from the live generated card. Inspect and fix the actual example sentence if needed, then record rereviewProvenance with reviewedAfterStandard=true, mechanicalMigration=false, reviewer, reviewedAt, cardReviewed, checked evidence, limitation decision, and example sentence quality review evidence covering natural Japanese, learner usefulness, level appropriateness, support-only usage, reading, and translation.";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function buildNeedsRereviewFailure({ card = {}, level = null } = {}) {
    return {
        level,
        card: card.kanji || "(unknown)",
        category: REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        field: "rereviewProvenance",
        expected: NEEDS_REREVIEW_EXPECTED,
        actual: normalizeText((card.reasons || []).join("; ")) || `${MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER}: missing proof`,
        evidenceLane: "reviewEvidence.current-standard-review + rereviewProvenance",
        reviewerAction: NEEDS_REREVIEW_ACTION,
    };
}

function mapBlockedReasonToFailure({ card = {}, level = null, reason = "" } = {}) {
    const normalizedReason = normalizeText(reason);
    const base = {
        level,
        card: card.kanji || "(unknown)",
        category: REREVIEW_STATUS_CATEGORIES.BLOCKED_OR_FAILING,
        actual: normalizedReason || "blocked or failing Platinum",
    };

    const qualityGateMatch = normalizedReason.match(/quality gate must be true: ([A-Za-z0-9_-]+)/);
    if (qualityGateMatch) {
        return {
            ...base,
            field: `qualityGates.${qualityGateMatch[1]}`,
            expected: "true",
            evidenceLane: "qualityGates + reviewEvidence.current-standard-review",
            reviewerAction: "Fix the card data or manifest judgment, rerun Platinum, and only then attempt Obsidian certification.",
        };
    }

    const laneMatch = normalizedReason.match(/\b(sourceEvidence|internalChecks|reviewEvidence)\b/);
    if (laneMatch) {
        return {
            ...base,
            field: laneMatch[1],
            expected: "complete required current-standard structured evidence lane with governed source/use semantics",
            evidenceLane: laneMatch[1],
            reviewerAction: "Repair the evidence lane with governed evidence for the live card fields, rerun Platinum, then rerun certification.",
        };
    }

    if (/missing current-standard (?:structural|Platinum) entry|no platinum manifest entry|could not be generated|missing.*Platinum/i.test(normalizedReason)) {
        return {
            ...base,
            field: "platinumManifestEntry",
            expected: `one active current-standard Platinum entry using ${CURRENT_KANJI_PLATINUM_REVIEW_STANDARD} and bound to the generated kanji row`,
            evidenceLane: "sourceEvidence + internalChecks + reviewEvidence",
            reviewerAction: "Create or repair the governed Platinum manifest entry from the live generated card before attempting Obsidian certification.",
        };
    }

    if (/duplicate active/i.test(normalizedReason)) {
        return {
            ...base,
            field: "platinumManifestEntry",
            expected: "exactly one active current-standard Platinum entry for the generated kanji row",
            evidenceLane: "manifest identity",
            reviewerAction: "Resolve duplicate active manifest entries, rerun Platinum, then rerun certification.",
        };
    }

    if (/audio/i.test(normalizedReason)) {
        return {
            ...base,
            field: "audio",
            expected: "exact primary-reading kanji audio identity bound to the generated row",
            evidenceLane: "internalChecks.audio-review",
            reviewerAction: "Fix or regenerate the exact primary-reading audio reference and update evidence before certification.",
        };
    }

    if (/stroke/i.test(normalizedReason)) {
        return {
            ...base,
            field: "strokeOrder",
            expected: "stroke-order media identity bound to the target kanji",
            evidenceLane: "internalChecks.stroke-order-review",
            reviewerAction: "Fix stroke-order media identity/provenance and rerun Platinum before certification.",
        };
    }

    return {
        ...base,
        field: "platinumCardSurfaceInspection",
        expected: "passing current-standard Platinum for the live generated card",
        evidenceLane: "sourceEvidence + internalChecks + reviewEvidence",
        reviewerAction: "Inspect the Platinum failure, repair the generated card or manifest evidence, rerun Platinum, then rerun certification.",
    };
}

function buildBlockedFailures({ card = {}, level = null } = {}) {
    const reasons = Array.isArray(card.reasons) && card.reasons.length > 0
        ? card.reasons
        : ["blocked or failing Platinum"];

    return reasons.map((reason) => mapBlockedReasonToFailure({ card, level, reason }));
}

function buildCertificationFailures(levelReports = []) {
    const failures = [];

    for (const report of Array.isArray(levelReports) ? levelReports : []) {
        for (const card of report.cards || []) {
            if (card.needsSubstantiveRereview) {
                failures.push(buildNeedsRereviewFailure({ card, level: report.level }));
            }
            if (card.blockedOrFailing) {
                failures.push(...buildBlockedFailures({ card, level: report.level }));
            }
        }
    }

    return failures;
}

function buildObsidianKanjiCertificationStatusSummary(levelReports = []) {
    const rereviewSummary = buildPlatinumKanjiRereviewStatusSummary(levelReports);
    const failures = buildCertificationFailures(levelReports);
    const totals = rereviewSummary.totals || {};
    const passed = failures.length === 0
        && (totals.blocked_or_failing || 0) === 0
        && (totals.needs_substantive_rereview || 0) === 0;

    return {
        ...rereviewSummary,
        passed,
        certificationGate: {
            name: "kanji Obsidian certification",
            currentReviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            requiredZeroCounts: [...REQUIRED_ZERO_COUNTS],
            automationChecks: [...CERTIFICATION_AUTOMATION_CHECKS],
            requiredSentenceReviewProof: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
            contentCertificationBoundary: OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE,
            manualJudgmentBoundary: MANUAL_SENTENCE_REVIEW_BOUNDARY_NOTE,
        },
        failureCount: failures.length,
        failures,
    };
}

function formatFailure(failure = {}) {
    return [
        `- N${failure.level ?? "?"} ${failure.card || "(unknown)"}`,
        `field=${failure.field || "(unknown)"}`,
        `expected=${failure.expected || "(unspecified)"}`,
        `actual=${failure.actual || "(unspecified)"}`,
        `evidence lane=${failure.evidenceLane || "(unspecified)"}`,
        `reviewer action=${failure.reviewerAction || "(unspecified)"}`,
    ].join("; ");
}

function formatObsidianKanjiCertificationStatusReport(summary = {}) {
    const totals = summary.totals || {};
    const gate = summary.certificationGate || {};
    const lines = [
        "Japanese Kanji Builder Kanji Obsidian Certification Status",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_KANJI_PLATINUM_REVIEW_STANDARD}`,
        "Certification target: Obsidian (explicit non-mechanical current-version rereview proof)",
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Generated active kanji rows: ${totals.generatedRows || 0}`,
        `Review entries: ${totals.reviewEntries || 0}`,
        "",
        "| Scope | Generated deck rows | Platinum | Obsidian certified | Needs Obsidian | Blocked/failing |",
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
        "Certification policy:",
        "- Platinum commands test the current card-surface requirements against the live generated rows.",
        "- This command is stricter: it fails when any intended release row is blocked/failing or still needs Obsidian proof.",
        `- Obsidian proof must include structured rereviewProvenance and actual ${gate.requiredSentenceReviewProof || SENTENCE_QUALITY_REVIEW_PROOF_MARKER} evidence for the live card.`,
        `- ${gate.contentCertificationBoundary || gate.manualJudgmentBoundary || OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE}`
    );

    const failures = Array.isArray(summary.failures) ? summary.failures : [];
    if (failures.length > 0) {
        lines.push("", `Certification failures (${failures.length}):`);
        for (const failure of failures) {
            lines.push(formatFailure(failure));
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    MANUAL_SENTENCE_REVIEW_BOUNDARY_NOTE,
    OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE,
    buildCertificationFailures,
    buildObsidianKanjiCertificationStatusSummary,
    buildPlatinumKanjiCertificationStatusSummary: buildObsidianKanjiCertificationStatusSummary,
    formatObsidianKanjiCertificationStatusReport,
    formatPlatinumKanjiCertificationStatusReport: formatObsidianKanjiCertificationStatusReport,
};
