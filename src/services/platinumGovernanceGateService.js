const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_KANJI_PLATINUM_STATUSES,
    entryUsesCurrentKanjiPlatinumStandard,
} = require("./platinumKanjiReviewService");
const {
    ACTIVE_PLATINUM_STATUSES: ACTIVE_WORD_PLATINUM_STATUSES,
    entryUsesCurrentWordPlatinumStandard,
} = require("./platinumReviewService");
const { buildWordIdentity } = require("./platinumWordBatchReportService");

const GOVERNANCE_MARKERS = Object.freeze({
    BULK_TEMPLATE_REVALIDATION_SUMMARY: "bulk_template_revalidation_summary",
    CARD_SPECIFIC_REVALIDATION_SUMMARY_MISSING: "card_specific_revalidation_summary_missing",
    EXAMPLE_QUALITY_MANUAL_JUDGMENT_ONLY: "example_quality_manual_judgment_only",
    ZERO_VERIFICATION_LIMITATIONS: "zero_verification_limitations_recorded",
    ALLOWED_INCOMPLETE_WORD_PLATINUM_LEVEL: "allowed_incomplete_word_platinum_level",
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function isActiveCurrentStandardEntry(kind, entry = {}) {
    if (kind === "kanji") {
        return ACTIVE_KANJI_PLATINUM_STATUSES.includes(normalizeText(entry.status))
            && entryUsesCurrentKanjiPlatinumStandard(entry);
    }

    return ACTIVE_WORD_PLATINUM_STATUSES.includes(normalizeText(entry.status))
        && entryUsesCurrentWordPlatinumStandard(entry);
}

function buildEntryIdentity(kind, entry = {}) {
    if (kind === "kanji") {
        return normalizeText(entry.kanji);
    }

    return buildWordIdentity({
        word: entry.word,
        reading: normalizeStringArray(entry.readingIncludes).join(" / "),
    });
}

function summaryMentionsCard(kind, entry = {}) {
    const summary = normalizeText(entry.revalidationSummary).toLowerCase();
    const identity = buildEntryIdentity(kind, entry).toLowerCase();
    const word = normalizeText(entry.word).toLowerCase();
    const reading = normalizeStringArray(entry.readingIncludes).join(" / ").toLowerCase();
    const kanji = normalizeText(entry.kanji).toLowerCase();

    if (kind === "kanji") {
        return Boolean(kanji && summary.includes(kanji));
    }

    return Boolean(
        (identity && summary.includes(identity))
        || (word && reading && summary.includes(word) && summary.includes(reading))
    );
}

function getVerificationLimitations(entry = {}) {
    return Array.isArray(entry.verificationLimitations) ? entry.verificationLimitations : [];
}

function buildManifestGovernancePosture({ kind = "kanji", level = null, entries = [] } = {}) {
    const currentEntries = (Array.isArray(entries) ? entries : [])
        .filter((entry) => isActiveCurrentStandardEntry(kind, entry));
    const summaries = currentEntries.map((entry) => normalizeText(entry.revalidationSummary));
    const distinctSummaries = [...new Set(summaries.filter(Boolean))];
    const cardSpecificSummaryCount = currentEntries.filter((entry) => summaryMentionsCard(kind, entry)).length;
    const entriesWithLimitations = currentEntries.filter((entry) => getVerificationLimitations(entry).length > 0);
    const limitationCount = entriesWithLimitations.reduce((sum, entry) => sum + getVerificationLimitations(entry).length, 0);
    const markers = [];

    if (currentEntries.length > 1 && distinctSummaries.length === 1) {
        markers.push(GOVERNANCE_MARKERS.BULK_TEMPLATE_REVALIDATION_SUMMARY);
    }
    if (currentEntries.length > 0 && cardSpecificSummaryCount < currentEntries.length) {
        markers.push(GOVERNANCE_MARKERS.CARD_SPECIFIC_REVALIDATION_SUMMARY_MISSING);
    }
    if (currentEntries.length > 0) {
        markers.push(GOVERNANCE_MARKERS.EXAMPLE_QUALITY_MANUAL_JUDGMENT_ONLY);
    }
    if (currentEntries.length > 0 && limitationCount === 0) {
        markers.push(GOVERNANCE_MARKERS.ZERO_VERIFICATION_LIMITATIONS);
    }

    return {
        kind,
        level,
        activeCurrentStandardEntries: currentEntries.length,
        distinctRevalidationSummaries: distinctSummaries.length,
        cardSpecificRevalidationSummaryCount: cardSpecificSummaryCount,
        entriesWithVerificationLimitations: entriesWithLimitations.length,
        verificationLimitations: limitationCount,
        exampleQualityAutomationScope: "marker_and_binding_only",
        markers,
    };
}

function isAllowedMissingWordPlatinumCard(card = {}) {
    const reasons = Array.isArray(card.reasons) ? card.reasons : [];
    return card.blockedOrFailing === true
        && reasons.length > 0
        && reasons.every((reason) => /missing .*platinum entry|missing current-standard structural entry/i.test(reason));
}

function evaluatePlatinumGovernanceGate({
    kanjiRereviewReports = [],
    wordRereviewReports = [],
    wordSourcePostureSummary = {},
    manifestPostures = [],
    allowedIncompleteWordLevels = [4],
} = {}) {
    const issues = [];
    const warnings = [];
    const allowedIncompleteLevels = new Set(allowedIncompleteWordLevels);

    for (const report of Array.isArray(kanjiRereviewReports) ? kanjiRereviewReports : []) {
        if ((report.counts?.blocked_or_failing || 0) > 0) {
            issues.push(`N${report.level} kanji platinum has blocked/failing generated rows: ${report.counts.blocked_or_failing}`);
        }
        if ((report.counts?.needs_substantive_rereview || 0) > 0) {
            warnings.push(`N${report.level} kanji ${report.counts.needs_substantive_rereview} Platinum entries still lack Obsidian proof`);
        }
    }

    for (const report of Array.isArray(wordRereviewReports) ? wordRereviewReports : []) {
        const blockedCount = report.counts?.blocked_or_failing || 0;
        const blockedCards = (report.cards || []).filter((card) => card.blockedOrFailing);
        const levelAllowedIncomplete = allowedIncompleteLevels.has(report.level);
        const onlyKnownMissing = blockedCards.every(isAllowedMissingWordPlatinumCard);

        if (blockedCount > 0 && (!levelAllowedIncomplete || !onlyKnownMissing)) {
            issues.push(`N${report.level} word platinum has unexpected blocked/failing generated rows: ${blockedCount}`);
        } else if (blockedCount > 0) {
            warnings.push(`${GOVERNANCE_MARKERS.ALLOWED_INCOMPLETE_WORD_PLATINUM_LEVEL}: N${report.level} word Platinum coverage is incomplete with ${blockedCount} generated rows missing active current-standard structural entries`);
        }
        if ((report.counts?.needs_substantive_rereview || 0) > 0) {
            warnings.push(`N${report.level} word ${report.counts.needs_substantive_rereview} Platinum entries still lack Obsidian proof`);
        }
    }

    const sourceTotals = wordSourcePostureSummary.totals || {};
    if ((sourceTotals.missing_governed_source || 0) > 0) {
        issues.push(`Word platinum source posture has active entries missing governed source evidence: ${sourceTotals.missing_governed_source}`);
    }
    if ((sourceTotals.single_source_family || 0) > 0) {
        warnings.push(`word_source_independence_not_proven: ${sourceTotals.single_source_family} structurally current-standard word entries use one source family`);
    }

    for (const posture of Array.isArray(manifestPostures) ? manifestPostures : []) {
        for (const marker of posture.markers || []) {
            warnings.push(`${marker}: ${posture.kind} N${posture.level}`);
        }
    }

    return {
        passed: issues.length === 0,
        issues,
        warnings,
        summaries: {
            kanjiRereviewReports,
            wordRereviewReports,
            wordSourcePostureSummary,
            manifestPostures,
        },
    };
}

function formatPlatinumGovernanceGateReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Platinum Governance Gate",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
    ];

    if (report.issues?.length > 0) {
        lines.push("", "Issues:");
        for (const issue of report.issues) {
            lines.push(`- ${issue}`);
        }
    }

    if (report.warnings?.length > 0) {
        lines.push("", "Governance warnings:");
        for (const warning of report.warnings) {
            lines.push(`- ${warning}`);
        }
    }

    const manifestPostures = report.summaries?.manifestPostures || [];
    if (manifestPostures.length > 0) {
        lines.push(
            "",
            "| Manifest | Platinum entries | Distinct summaries | Card-specific summaries | Entries with limitations | Limitation count | Example quality automation |",
            "| --- | ---: | ---: | ---: | ---: | ---: | --- |"
        );
        for (const posture of manifestPostures) {
            lines.push([
                `| ${posture.kind} N${posture.level}`,
                posture.activeCurrentStandardEntries || 0,
                posture.distinctRevalidationSummaries || 0,
                posture.cardSpecificRevalidationSummaryCount || 0,
                posture.entriesWithVerificationLimitations || 0,
                posture.verificationLimitations || 0,
                posture.exampleQualityAutomationScope || "unknown",
            ].join(" | ") + " |");
        }
    }

    lines.push(
        "",
        "Scope note:",
        "- This gate exercises local real generated rows when local ignored data is present.",
        "- Platinum counts and source-posture counts are diagnostics only; only explicit non-mechanical rereview provenance counts as Obsidian proof.",
        "- It does not promote, defer, reject, or edit cards.",
        "- N4 word Platinum incompleteness is allowed only when every blocked row is missing active current-standard structural coverage; dirty reviewed entries still fail the gate."
    );

    return `${lines.join("\n")}\n`;
}

module.exports = {
    GOVERNANCE_MARKERS,
    buildManifestGovernancePosture,
    evaluatePlatinumGovernanceGate,
    formatPlatinumGovernanceGateReport,
};
