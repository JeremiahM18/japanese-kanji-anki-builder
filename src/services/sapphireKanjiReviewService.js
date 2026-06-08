const platinumKanjiReview = require("./platinumKanjiReviewService");

const ACTIVE_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);
const NON_SHIPPING_STATUSES = platinumKanjiReview.NON_SHIPPING_STATUSES;
const REVALIDATION_STATUSES = platinumKanjiReview.REVALIDATION_STATUSES;
const REVIEW_ONLY_STATUSES = platinumKanjiReview.REVIEW_ONLY_STATUSES;
const ALLOWED_SAPPHIRE_STATUSES = Object.freeze([
    ...ACTIVE_SAPPHIRE_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD = "kanji-sapphire-v1-evidence-lanes";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function mapSapphireStatusToPlatinum(status = "") {
    const normalized = normalizeText(status);
    if (normalized === "sapphire") {
        return "platinum";
    }
    if (normalized === "fixed_then_sapphire") {
        return "fixed_then_platinum";
    }
    return normalized;
}

function mapSapphireEntryToPlatinumCompatibility(entry = {}) {
    const mapped = {
        ...entry,
        status: mapSapphireStatusToPlatinum(entry.status),
        reviewStandard: entry.reviewStandard === CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD
            ? platinumKanjiReview.CURRENT_KANJI_PLATINUM_REVIEW_STANDARD
            : entry.reviewStandard,
    };

    if (entry.previousStatus) {
        mapped.previousStatus = mapSapphireStatusToPlatinum(entry.previousStatus);
    }
    if (entry.previousReviewStandard === CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD) {
        mapped.previousReviewStandard = platinumKanjiReview.CURRENT_KANJI_PLATINUM_REVIEW_STANDARD;
    }
    if (entry.sapphireReviewAudit && !entry.platinumReviewAudit) {
        mapped.platinumReviewAudit = entry.sapphireReviewAudit;
    }

    return mapped;
}

function mapSapphireEntriesToPlatinumCompatibility(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(mapSapphireEntryToPlatinumCompatibility);
}

function mapPlatinumTextToSapphire(value = "") {
    return String(value || "")
        .replaceAll(platinumKanjiReview.CURRENT_KANJI_PLATINUM_REVIEW_STANDARD, CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD)
        .replace(/fixed_then_platinum/g, "fixed_then_sapphire")
        .replace(/legacy Platinum compatibility/g, "Sapphire")
        .replace(/legacy compatibility/g, "Sapphire")
        .replace(/Legacy compatibility/g, "Sapphire")
        .replace(/current-standard Platinum/g, "current-standard Sapphire")
        .replace(/Current-standard Platinum/g, "Current-standard Sapphire")
        .replace(/active platinum/g, "active Sapphire")
        .replace(/active Platinum/g, "active Sapphire")
        .replace(/Platinum coverage requires current-standard revalidation/g, "Sapphire coverage requires current-standard structural revalidation")
        .replace(/Platinum cards/g, "Sapphire cards")
        .replace(/Platinum entries/g, "Sapphire entries")
        .replace(/platinum entries/g, "Sapphire entries")
        .replace(/Platinum row/g, "Sapphire row")
        .replace(/platinum row/g, "Sapphire row")
        .replace(/Platinum/g, "Sapphire")
        .replace(/platinum/g, "sapphire");
}

function mapSapphireResultFromCompatibility(result = {}) {
    return {
        ...result,
        status: mapPlatinumTextToSapphire(result.status),
        failures: (result.failures || []).map(mapPlatinumTextToSapphire),
    };
}

function hasActiveSapphireStatus(entry = {}) {
    return ACTIVE_SAPPHIRE_STATUSES.includes(normalizeText(entry.status));
}

function entryUsesCurrentKanjiSapphireStandard(entry = {}) {
    return platinumKanjiReview.entryUsesCurrentKanjiPlatinumStandard(
        mapSapphireEntryToPlatinumCompatibility(entry)
    );
}

function isCurrentStandardSapphireEntry(entry = {}) {
    return hasActiveSapphireStatus(entry) && entryUsesCurrentKanjiSapphireStandard(entry);
}

function buildKanjiSapphireReviewStandardSummary(entries = []) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeStatusEntries = reviewEntries.filter(hasActiveSapphireStatus);
    const currentStandardEntries = activeStatusEntries.filter(entryUsesCurrentKanjiSapphireStandard);
    const legacyEntries = reviewEntries.filter((entry) => (
        REVALIDATION_STATUSES.includes(normalizeText(entry.status))
        || (hasActiveSapphireStatus(entry) && !entryUsesCurrentKanjiSapphireStandard(entry))
    ));

    return {
        currentStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        activeStatusCount: activeStatusEntries.length,
        revalidationBacklogCount: legacyEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardKanji: currentStandardEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        revalidationBacklogKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedKanji: legacyEntries.map((entry) => normalizeText(entry.kanji)).filter(Boolean).sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function buildKanjiSapphireVerificationLimitationSummary(entries = []) {
    return platinumKanjiReview.buildKanjiVerificationLimitationSummary(
        mapSapphireEntriesToPlatinumCompatibility(entries)
    );
}

function validateCurrentKanjiSapphireReviewStandard(entry = {}) {
    return platinumKanjiReview
        .validateCurrentKanjiPlatinumReviewStandard(mapSapphireEntryToPlatinumCompatibility(entry))
        .map(mapPlatinumTextToSapphire);
}

function evaluateSapphireKanjiReviewSet({
    rows = [],
    entries = [],
    kanjiSourceEvidence,
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const compatibilityEntries = mapSapphireEntriesToPlatinumCompatibility(entries);
    const report = platinumKanjiReview.evaluatePlatinumKanjiReviewSet({
        rows,
        entries: compatibilityEntries,
        kanjiSourceEvidence,
        requireCurrentReviewStandard,
        requireAllRows,
        allowEmpty,
    });
    const standardSummary = buildKanjiSapphireReviewStandardSummary(entries);
    const nativeReport = { ...report };
    delete nativeReport.activePlatinumCount;
    delete nativeReport.activePlatinumStatusCount;
    delete nativeReport.currentStandardPlatinumCount;
    delete nativeReport.legacyOrUnversionedPlatinumCount;
    delete nativeReport.missingPlatinumRows;
    delete nativeReport.missingCurrentStandardRows;
    delete nativeReport.coverageFailures;
    delete nativeReport.results;

    return {
        ...nativeReport,
        coverageFailures: (report.coverageFailures || []).map(mapPlatinumTextToSapphire),
        results: (report.results || []).map(mapSapphireResultFromCompatibility),
        activeSapphireCount: report.activePlatinumCount,
        activeSapphireStatusCount: report.activePlatinumStatusCount,
        currentReviewStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
        currentStandardSapphireCount: standardSummary.currentStandardCount,
        legacyOrUnversionedSapphireCount: standardSummary.legacyOrUnversionedCount,
        currentStandardKanji: standardSummary.currentStandardKanji,
        legacyOrUnversionedKanji: standardSummary.legacyOrUnversionedKanji,
        revalidationBacklogKanji: standardSummary.revalidationBacklogKanji,
        missingSapphireRows: report.missingPlatinumRows,
        missingCurrentStandardSapphireRows: report.missingCurrentStandardRows,
    };
}

function formatSapphireKanjiReviewReport(report = {}, { title = "Japanese Kanji Builder Sapphire Kanji Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        "Tier: Sapphire (current-standard structural/card-quality gate; not Platinum content certification or Obsidian proof)",
        `Sapphire cards: ${report.activeSapphireCount ?? 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD}`,
        `Current-standard Sapphire cards: ${report.currentStandardSapphireCount ?? 0}`,
        `Revalidation backlog/history cards: ${report.revalidationBacklogCount ?? report.legacyOrUnversionedSapphireCount ?? 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationKanjiCount || 0}`,
        `Verification limitations: ${report.verificationLimitationCount || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0}`,
        `Needs revalidation: ${report.needsRevalidationCount || 0}`,
        `Needs review: ${report.needsReviewCount || 0}`,
        `Passed entries: ${report.passedCount || 0}`,
        `Failed entries: ${report.failedCount || 0}`,
        `Overall result: ${report.passed ? "passing" : "failing"}`,
    ];

    if (Array.isArray(report.coverageFailures) && report.coverageFailures.length > 0) {
        lines.push("", "Coverage failures:");
        for (const failure of report.coverageFailures) {
            lines.push(`- ${mapPlatinumTextToSapphire(failure)}`);
        }
    }

    const missingRows = report.missingSapphireRows || [];
    if (Array.isArray(missingRows) && missingRows.length > 0) {
        const sampleSize = 30;
        const sample = missingRows.slice(0, sampleSize);
        lines.push("", `Missing Sapphire kanji sample (${sample.length}/${missingRows.length}):`);
        for (const kanji of sample) {
            lines.push(`- ${kanji}`);
        }
        if (missingRows.length > sampleSize) {
            lines.push(`- ... ${missingRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${limitation.kanji}: ${limitation.field} (${limitation.status}) - ${limitation.label}`);
        }
    }

    for (const result of report.results || []) {
        lines.push("", `- ${result.label}: manifest status=${mapPlatinumTextToSapphire(result.status)}; Sapphire gate ${result.passed ? "pass" : "fail"}`);
        if (!result.passed) {
            for (const failure of result.failures) {
                lines.push(`  ${mapPlatinumTextToSapphire(failure)}`);
            }
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ACTIVE_SAPPHIRE_STATUSES,
    ALLOWED_SAPPHIRE_STATUSES,
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVALIDATION_STATUSES,
    REVIEW_ONLY_STATUSES,
    buildKanjiSapphireReviewStandardSummary,
    buildKanjiSapphireVerificationLimitationSummary,
    entryUsesCurrentKanjiSapphireStandard,
    evaluateSapphireKanjiReviewSet,
    formatSapphireKanjiReviewReport,
    hasActiveSapphireStatus,
    isCurrentStandardSapphireEntry,
    mapPlatinumTextToSapphire,
    mapSapphireEntriesToPlatinumCompatibility,
    mapSapphireEntryToPlatinumCompatibility,
    validateCurrentKanjiSapphireReviewStandard,
};
