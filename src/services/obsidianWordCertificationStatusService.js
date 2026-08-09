const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
} = require("./platinumReviewService");
const {
    MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER,
    REREVIEW_STATUS_CATEGORIES,
    SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
    SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
    buildPlatinumWordRereviewStatusSummary,
} = require("./platinumWordRereviewStatusService");
const {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
} = require("./platinumWordObsidianProofService");

const OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE = "Current Obsidian certification is non-human governed native/fluent-quality proof for the scoped version. The gate verifies structure, source binding, protected snippets, exact word-reading audio identity, pitch source/render evidence, canonical JSONL proof binding, the full word-card evidence checklist, card-bound word example-quality review evidence, and exact example-sentence audio provenance; future human/native review is separate provenance for the same standard, and legacy word Obsidian proof is dated history until v2.5 proof exists.";
const MANUAL_WORD_REVIEW_BOUNDARY_NOTE = OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE;
const REQUIRED_ZERO_COUNTS = Object.freeze(["blocked_or_failing", "needs_substantive_rereview"]);
const CERTIFICATION_AUTOMATION_CHECKS = Object.freeze([
    "current-standard Platinum",
    "governed Japanese-source binding",
    "protected field snippets",
    "exact word-reading audio identity",
    "pitch source/render identity",
    "card-bound Obsidian rereview provenance",
    "full word-card evidence checklist",
    "presence of actual example sentence quality review proof",
    "presence of exact example sentence audio review proof",
]);
const NEEDS_REREVIEW_EXPECTED = `explicit non-mechanical substantive ${CURRENT_WORD_OBSIDIAN_STANDARD_VERSION} proof after Platinum, including exact word-reading card identity binding, a full word-card evidence checklist, actual example sentence quality review proof, and exact example sentence audio review proof`;
const NEEDS_REREVIEW_ACTION = "Perform the Obsidian v2.5 rereview from the live generated word card. Inspect and fix the actual written form, reading, meaning, example sentence natural Japanese, reading/translation, learner usefulness, word audio, example sentence audio, pitch, labels, notes, and limitations if needed, then record JSONL proof with reviewedAfterStandard=true, mechanicalMigration=false, reviewer, reviewedAt, cardReviewed identity binding, evidenceChecked, limitation decision, example sentence quality review evidence, and sentenceAudioReview evidence covering exact category, source, voice, locale, asset, identity hash, example text, and example reading.";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeCardLabel(card = {}) {
    return normalizeText(card.identity || card.label || [
        normalizeText(card.word),
        normalizeText(card.reading),
    ].filter(Boolean).join("|")) || "(unknown)";
}

function buildNeedsRereviewFailure({ card = {}, level = null } = {}) {
    return {
        level,
        card: normalizeCardLabel(card),
        ...(Number.isInteger(card.generatedRowIndex) ? { generatedRowIndex: card.generatedRowIndex } : {}),
        category: REREVIEW_STATUS_CATEGORIES.NEEDS_SUBSTANTIVE_REREVIEW,
        field: "rereviewProvenance",
        expected: NEEDS_REREVIEW_EXPECTED,
        actual: normalizeText((card.reasons || []).join("; ")) || `${MISSING_SUBSTANTIVE_REREVIEW_PROOF_MARKER}: missing proof`,
        currentObsidianProofObserved: Boolean(card.currentObsidianProofObserved),
        evidenceLane: "reviewEvidence.current-standard-review + rereviewProvenance",
        reviewerAction: NEEDS_REREVIEW_ACTION,
    };
}

function mapBlockedReasonToFailure({ card = {}, level = null, reason = "" } = {}) {
    const normalizedReason = normalizeText(reason);
    const base = {
        level,
        card: normalizeCardLabel(card),
        ...(Number.isInteger(card.generatedRowIndex) ? { generatedRowIndex: card.generatedRowIndex } : {}),
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
            reviewerAction: "Fix the word card data or manifest judgment, rerun Platinum, and only then attempt Obsidian certification.",
        };
    }

    const laneMatch = normalizedReason.match(/\b(sourceEvidence|internalChecks|reviewEvidence)\b/);
    if (laneMatch) {
        return {
            ...base,
            field: laneMatch[1],
            expected: "complete required current-standard structured evidence lane with governed source/use semantics",
            evidenceLane: laneMatch[1],
            reviewerAction: "Repair the evidence lane with governed evidence for the live word card fields, rerun Platinum, then rerun certification.",
        };
    }

    if (/missing.*(?:structural|Platinum) entry|no platinum manifest entry|missing active platinum entry|could not be generated|missing.*Platinum/i.test(normalizedReason)) {
        return {
            ...base,
            field: "platinumManifestEntry",
            expected: `one active current-standard Platinum entry using ${CURRENT_WORD_PLATINUM_REVIEW_STANDARD} and bound to the generated word-reading row`,
            evidenceLane: "sourceEvidence + internalChecks + reviewEvidence",
            reviewerAction: "Create or repair the governed Platinum manifest entry from the live generated word card before attempting Obsidian certification.",
        };
    }

    if (/duplicate active/i.test(normalizedReason)) {
        return {
            ...base,
            field: "platinumManifestEntry",
            expected: "exactly one active current-standard Platinum entry for the generated word-reading row",
            evidenceLane: "manifest identity",
            reviewerAction: "Resolve duplicate active manifest entries, rerun Platinum, then rerun certification.",
        };
    }

    if (/audio/i.test(normalizedReason)) {
        return {
            ...base,
            field: "audio",
            expected: "exact word-reading audio identity bound to the generated word row",
            evidenceLane: "internalChecks.audio-review",
            reviewerAction: "Fix or regenerate the exact word-reading audio reference and update evidence before certification.",
        };
    }

    if (/pitch/i.test(normalizedReason)) {
        return {
            ...base,
            field: "pitchAccent",
            expected: "pitch source/render evidence bound to the generated word row",
            evidenceLane: "internalChecks.pitch-accent-review",
            reviewerAction: "Fix pitch source/render evidence or card data, rerun Platinum, then rerun certification.",
        };
    }

    return {
        ...base,
        field: "platinumStructuralGate",
        expected: "passing current-standard Platinum for the live generated word card",
        evidenceLane: "sourceEvidence + internalChecks + reviewEvidence",
        reviewerAction: "Inspect the Platinum failure, repair the generated word card or manifest evidence, rerun Platinum, then rerun certification.",
    };
}

function buildBlockedFailures({ card = {}, level = null } = {}) {
    const reasons = Array.isArray(card.reasons) && card.reasons.length > 0
        ? card.reasons
        : ["blocked or failing Platinum"];

    return reasons.map((reason) => mapBlockedReasonToFailure({ card, level, reason }));
}

function buildWordCertificationFailures(levelReports = []) {
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

function buildObsidianWordCertificationStatusSummary(levelReports = []) {
    const rereviewSummary = buildPlatinumWordRereviewStatusSummary(levelReports);
    const failures = buildWordCertificationFailures(levelReports);
    const totals = rereviewSummary.totals || {};
    const passed = failures.length === 0
        && (totals.blocked_or_failing || 0) === 0
        && (totals.needs_substantive_rereview || 0) === 0;

    return {
        ...rereviewSummary,
        passed,
        certificationGate: {
            name: "word Obsidian certification",
            currentReviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
            currentObsidianStandard: CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
            requiredZeroCounts: [...REQUIRED_ZERO_COUNTS],
            automationChecks: [...CERTIFICATION_AUTOMATION_CHECKS],
            requiredSentenceReviewProof: SENTENCE_QUALITY_REVIEW_PROOF_MARKER,
            requiredSentenceAudioReviewProof: SENTENCE_AUDIO_REVIEW_PROOF_MARKER,
            contentCertificationBoundary: OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE,
            manualJudgmentBoundary: MANUAL_WORD_REVIEW_BOUNDARY_NOTE,
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

function formatObsidianWordCertificationStatusReport(summary = {}) {
    const totals = summary.totals || {};
    const gate = summary.certificationGate || {};
    const lines = [
        "Japanese Kanji Builder Word Obsidian Certification Status",
        "",
        `Current review standard: ${summary.currentReviewStandard || CURRENT_WORD_PLATINUM_REVIEW_STANDARD}`,
        `Current Obsidian standard: ${gate.currentObsidianStandard || CURRENT_WORD_OBSIDIAN_STANDARD_VERSION}`,
        "Certification target: Obsidian (explicit non-mechanical current-version rereview proof)",
        `Result: ${summary.passed ? "passing" : "failing"}`,
        `Generated active word rows: ${totals.generatedRows || 0}`,
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
        `- Obsidian proof must include structured rereviewProvenance, exact word-reading identity binding, a full word-card evidence checklist, actual ${gate.requiredSentenceReviewProof || SENTENCE_QUALITY_REVIEW_PROOF_MARKER} evidence, and exact ${gate.requiredSentenceAudioReviewProof || SENTENCE_AUDIO_REVIEW_PROOF_MARKER} evidence for the live card.`,
        `- ${gate.contentCertificationBoundary || gate.manualJudgmentBoundary || OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE}`
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
    MANUAL_WORD_REVIEW_BOUNDARY_NOTE,
    OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE,
    buildObsidianWordCertificationStatusSummary,
    buildPlatinumWordCertificationStatusSummary: buildObsidianWordCertificationStatusSummary,
    buildWordCertificationFailures,
    formatObsidianWordCertificationStatusReport,
    formatPlatinumWordCertificationStatusReport: formatObsidianWordCertificationStatusReport,
};
