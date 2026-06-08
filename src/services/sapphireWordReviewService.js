const platinumWordReview = require("./platinumReviewService");

const ACTIVE_WORD_SAPPHIRE_STATUSES = Object.freeze(["sapphire", "fixed_then_sapphire"]);
const NON_SHIPPING_STATUSES = platinumWordReview.NON_SHIPPING_STATUSES;
const REVIEW_ONLY_STATUSES = platinumWordReview.REVIEW_ONLY_STATUSES;
const ALLOWED_WORD_SAPPHIRE_STATUSES = Object.freeze([
    ...ACTIVE_WORD_SAPPHIRE_STATUSES,
    ...NON_SHIPPING_STATUSES,
    ...REVIEW_ONLY_STATUSES,
]);

const CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD = "word-sapphire-v1-evidence-lanes";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
        .map((entry) => normalizeText(entry))
        .filter(Boolean);
}

function buildExpectedReadingText(entry = {}) {
    return normalizeStringArray(entry.readingIncludes).join(" / ");
}

function formatWordReviewLabel(word, reading = "") {
    const normalizedWord = normalizeText(word);
    const normalizedReading = normalizeText(reading);
    return normalizedReading ? `${normalizedWord} (${normalizedReading})` : normalizedWord;
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

function mapSapphireWordEntryToPlatinumCompatibility(entry = {}) {
    const mapped = {
        ...entry,
        status: mapSapphireStatusToPlatinum(entry.status),
        reviewStandard: entry.reviewStandard === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD
            ? platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD
            : entry.reviewStandard,
    };

    if (entry.previousStatus) {
        mapped.previousStatus = mapSapphireStatusToPlatinum(entry.previousStatus);
    }
    if (entry.previousReviewStandard === CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD) {
        mapped.previousReviewStandard = platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD;
    }

    return mapped;
}

function mapSapphireWordEntriesToPlatinumCompatibility(entries = []) {
    return (Array.isArray(entries) ? entries : []).map(mapSapphireWordEntryToPlatinumCompatibility);
}

function mapPlatinumTextToSapphire(value = "") {
    return String(value || "")
        .replaceAll(platinumWordReview.CURRENT_WORD_PLATINUM_REVIEW_STANDARD, CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD)
        .replace(/fixed_then_platinum/g, "fixed_then_sapphire")
        .replace(/current-standard Platinum/g, "current-standard Sapphire")
        .replace(/Current-standard Platinum/g, "Current-standard Sapphire")
        .replace(/active platinum/g, "active Sapphire")
        .replace(/active Platinum/g, "active Sapphire")
        .replace(/Platinum cards/g, "Sapphire cards")
        .replace(/Platinum entries/g, "Sapphire entries")
        .replace(/platinum entries/g, "Sapphire entries")
        .replace(/Platinum row/g, "Sapphire row")
        .replace(/platinum row/g, "Sapphire row")
        .replace(/Platinum/g, "Sapphire")
        .replace(/platinum/g, "sapphire");
}

function hasActiveWordSapphireStatus(entry = {}) {
    return ACTIVE_WORD_SAPPHIRE_STATUSES.includes(normalizeText(entry.status));
}

function entryUsesCurrentWordSapphireStandard(entry = {}) {
    return platinumWordReview.entryUsesCurrentWordPlatinumStandard(
        mapSapphireWordEntryToPlatinumCompatibility(entry)
    );
}

function isCurrentStandardWordSapphireEntry(entry = {}) {
    return hasActiveWordSapphireStatus(entry) && entryUsesCurrentWordSapphireStandard(entry);
}

function buildWordSapphireReviewStandardSummary(entries = []) {
    const reviewEntries = Array.isArray(entries) ? entries : [];
    const activeEntries = reviewEntries.filter(hasActiveWordSapphireStatus);
    const currentStandardEntries = activeEntries.filter(entryUsesCurrentWordSapphireStandard);
    const legacyEntries = activeEntries.filter((entry) => !entryUsesCurrentWordSapphireStandard(entry));

    return {
        currentStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        currentStandardCount: currentStandardEntries.length,
        activeStatusCount: activeEntries.length,
        legacyOrUnversionedCount: legacyEntries.length,
        currentStandardWords: currentStandardEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
        legacyOrUnversionedWords: legacyEntries
            .map((entry) => formatWordReviewLabel(entry.word, buildExpectedReadingText(entry)))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "ja")),
    };
}

function evaluateSapphireWordReviewSet({
    rows = [],
    entries = [],
    wordPitchAccentData = {},
    kanjiLevelData = null,
    requireCurrentReviewStandard = false,
    requireAllRows = false,
    allowEmpty = false,
} = {}) {
    const compatibilityEntries = mapSapphireWordEntriesToPlatinumCompatibility(entries);
    const report = platinumWordReview.evaluatePlatinumWordReviewSet({
        rows,
        entries: compatibilityEntries,
        wordPitchAccentData,
        kanjiLevelData,
        requireCurrentReviewStandard,
        requireAllRows,
        allowEmpty,
    });
    const standardSummary = buildWordSapphireReviewStandardSummary(entries);

    return {
        ...report,
        activeSapphireCount: report.activePlatinumCount,
        currentReviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        currentStandardSapphireCount: standardSummary.currentStandardCount,
        legacyOrUnversionedSapphireCount: standardSummary.legacyOrUnversionedCount,
        currentStandardWords: standardSummary.currentStandardWords,
        legacyOrUnversionedWords: standardSummary.legacyOrUnversionedWords,
        missingSapphireRows: report.missingPlatinumRows,
        missingCurrentStandardSapphireRows: report.missingCurrentStandardRows,
    };
}

function formatSapphireWordReviewReport(report = {}, { title = "Japanese Kanji Builder Sapphire Word Review" } = {}) {
    const lines = [
        title,
        "",
        `Review entries: ${report.totalEntries || 0}`,
        "Tier: Sapphire (current-standard structural/card-quality gate; not Platinum content certification or Obsidian proof)",
        `Sapphire cards: ${report.activeSapphireCount ?? report.activePlatinumCount ?? 0}`,
        `Current review standard: ${report.currentReviewStandard || CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD}`,
        `Current-standard Sapphire cards: ${report.currentStandardSapphireCount ?? report.currentStandardPlatinumCount ?? 0}`,
        `Legacy/unversioned Sapphire cards: ${report.legacyOrUnversionedSapphireCount ?? report.legacyOrUnversionedPlatinumCount ?? 0}`,
        `Active cards with verification limitations: ${report.verificationLimitationWordCount || 0}`,
        `Verification limitations: ${report.verificationLimitationCount || 0}`,
        `Deferred/removed tracked: ${report.nonShippingCount || 0}`,
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

    const missingRows = report.missingSapphireRows || report.missingPlatinumRows || [];
    if (Array.isArray(missingRows) && missingRows.length > 0) {
        const sampleSize = 30;
        const sample = missingRows.slice(0, sampleSize);
        lines.push("", `Missing Sapphire row sample (${sample.length}/${missingRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (missingRows.length > sampleSize) {
            lines.push(`- ... ${missingRows.length - sampleSize} more`);
        }
    }

    const missingCurrentStandardRows = report.missingCurrentStandardSapphireRows || report.missingCurrentStandardRows || [];
    if (Array.isArray(missingCurrentStandardRows) && missingCurrentStandardRows.length > 0) {
        const sampleSize = 30;
        const sample = missingCurrentStandardRows.slice(0, sampleSize);
        lines.push("", `Missing current-standard Sapphire row sample (${sample.length}/${missingCurrentStandardRows.length}):`);
        for (const row of sample) {
            lines.push(`- ${row}`);
        }
        if (missingCurrentStandardRows.length > sampleSize) {
            lines.push(`- ... ${missingCurrentStandardRows.length - sampleSize} more`);
        }
    }

    if (Array.isArray(report.verificationLimitations) && report.verificationLimitations.length > 0) {
        lines.push("", "Verification limitations:");
        for (const limitation of report.verificationLimitations) {
            lines.push(`- ${formatWordReviewLabel(limitation.word, limitation.reading)} ${limitation.field}: ${limitation.label} (${limitation.status})`);
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
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    ALLOWED_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
    REVIEW_ONLY_STATUSES,
    buildWordSapphireReviewStandardSummary,
    entryUsesCurrentWordSapphireStandard,
    evaluateSapphireWordReviewSet,
    formatSapphireWordReviewReport,
    hasActiveWordSapphireStatus,
    isCurrentStandardWordSapphireEntry,
    mapPlatinumTextToSapphire,
    mapSapphireWordEntriesToPlatinumCompatibility,
    mapSapphireWordEntryToPlatinumCompatibility,
};
