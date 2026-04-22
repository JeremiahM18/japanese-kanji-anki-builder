const {
    buildWordReadingCoverageReport,
    buildWordReadingGapTriage,
    parseKanjiTsv,
    parseWordTsv,
} = require("./wordReadingCoverageService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");

function buildWordDeckInventorySummary({ level, starterEntries, jlptWordLevelContract, builtWordRows }) {
    const canonicalEntries = Object.entries(jlptWordLevelContract?.wordLevels || {})
        .filter(([, entry]) => entry?.jlpt === level)
        .map(([key, entry]) => ({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: entry?.jlpt ?? null,
            starterEntry: starterEntries?.[key] || null,
        }));
    const excludedEntries = Object.entries(jlptWordLevelContract?.excludedWordLevels || {})
        .filter(([, entry]) => entry?.jlpt === level)
        .map(([key, entry]) => ({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: entry?.jlpt ?? null,
            exclusionReason: String(entry?.exclusionReason || "").trim(),
            starterEntry: starterEntries?.[key] || null,
        }));
    const builtKeys = new Set(
        (Array.isArray(builtWordRows) ? builtWordRows : []).map((row) => buildWordStudyEntryKey({
            written: row?.Word || row?.word,
            reading: row?.Reading || row?.reading,
        }))
    );

    const starterEligibleEntries = canonicalEntries;
    const builtEligibleEntries = starterEligibleEntries.filter((entry) => builtKeys.has(entry.key));
    const missingEligibleEntries = starterEligibleEntries.filter((entry) => !builtKeys.has(entry.key));
    const builtExtraEntries = (Array.isArray(builtWordRows) ? builtWordRows : [])
        .map((row) => ({
            key: buildWordStudyEntryKey({
                written: row?.Word || row?.word,
                reading: row?.Reading || row?.reading,
            }),
            written: String(row?.Word || row?.word || "").trim(),
            reading: String(row?.Reading || row?.reading || "").trim(),
            jlptLevel: String(row?.JLPTLevel || row?.jlptLevel || "").trim(),
        }))
        .filter((entry) => !canonicalEntries.some((contractEntry) => contractEntry.key === entry.key))
        .filter((entry) => !excludedEntries.some((contractEntry) => contractEntry.key === entry.key));

    return {
        level,
        canonicalInventoryCount: canonicalEntries.length,
        starterEligibleCount: starterEligibleEntries.length,
        builtEligibleCount: builtEligibleEntries.length,
        excludedSourceCount: excludedEntries.length,
        missingEligibleCount: missingEligibleEntries.length,
        extraBuiltCount: builtExtraEntries.length,
        starterEligibleCoveragePercent: starterEligibleEntries.length > 0
            ? Number(((builtEligibleEntries.length / starterEligibleEntries.length) * 100).toFixed(2))
            : 0,
        canonicalInventoryCoveragePercent: canonicalEntries.length > 0
            ? Number(((builtEligibleEntries.length / canonicalEntries.length) * 100).toFixed(2))
            : 0,
        excludedSourceEntries: excludedEntries,
        missingEligibleEntries,
        builtExtraEntries,
    };
}

function buildWordDeckCompletionReport({
    level,
    starterEntries,
    jlptWordLevelContract,
    kanjiTsv,
    wordTsv,
}) {
    const kanjiRows = parseKanjiTsv(kanjiTsv);
    const wordRows = parseWordTsv(wordTsv);
    const inventory = buildWordDeckInventorySummary({
        level,
        starterEntries,
        jlptWordLevelContract,
        builtWordRows: wordRows,
    });
    const readingCoverage = buildWordReadingCoverageReport({
        kanjiRows,
        wordRows,
        levelLabel: `N${level}`,
    });
    const triage = buildWordReadingGapTriage(readingCoverage);
    const readiness = buildWordDeckReadiness({
        inventory,
        readingCoverage: readingCoverage.summary,
        triage: triage.summary,
    });

    return {
        level,
        inventory,
        readingCoverage: readingCoverage.summary,
        triage: triage.summary,
        readiness,
    };
}

function buildWordDeckReadiness({ inventory, readingCoverage, triage }) {
    const hasMissingStarterRows = (inventory?.missingEligibleCount || 0) > 0;
    const hasActiveTriageItems = ((triage?.editorialReviewItems || 0) + (triage?.promoteCuratedExampleItems || 0)) > 0;
    const allOpenItemsDeferred = (triage?.totalItems || 0) > 0
        && (triage?.deferVariantItems || 0) === (triage?.totalItems || 0);
    const readingCoveragePercent = (readingCoverage?.totalReadings || 0) > 0
        ? Number((((readingCoverage?.coveredReadings || 0) / readingCoverage.totalReadings) * 100).toFixed(1))
        : 0;

    let status = "incomplete";
    if (!hasMissingStarterRows && !hasActiveTriageItems) {
        status = allOpenItemsDeferred ? "ready_with_deferred_variants" : "complete";
    }

    return {
        status,
        hasMissingStarterRows,
        hasActiveTriageItems,
        allOpenItemsDeferred,
        readingCoveragePercent,
    };
}

function formatWordDeckCompletionReport(report, { maxEntries = 20 } = {}) {
    const lines = [
        `Japanese Kanji Builder Word Deck Completion Audit (N${report.level})`,
        "",
        "Readiness:",
        `- Status: ${report.readiness.status}`,
        `- Active triage backlog cleared: ${report.readiness.hasActiveTriageItems ? "no" : "yes"}`,
        `- Remaining open items are deferred variants only: ${report.readiness.allOpenItemsDeferred ? "yes" : "no"}`,
        `- Reading coverage: ${report.readiness.readingCoveragePercent}%`,
        "",
        "Vocabulary coverage:",
        `- Canonical inventory rows: ${report.inventory.canonicalInventoryCount}`,
        `- Starter-eligible rows: ${report.inventory.starterEligibleCount}`,
        `- Built starter-eligible rows: ${report.inventory.builtEligibleCount} (${report.inventory.starterEligibleCoveragePercent}%)`,
        `- Tracked source-only exclusions: ${report.inventory.excludedSourceCount}`,
        `- Missing starter-eligible rows: ${report.inventory.missingEligibleCount}`,
        `- Built rows outside canonical inventory: ${report.inventory.extraBuiltCount}`,
        "",
        "Reading coverage:",
        `- Readings audited: ${report.readingCoverage.totalReadings}`,
        `- Covered by word deck: ${report.readingCoverage.coveredReadings}`,
        `- Covered by JLPT core words: ${report.readingCoverage.coreCoveredReadings}`,
        `- Covered by reading-support words: ${report.readingCoverage.supportCoveredReadings}`,
        `- Curated example exists but missing from word deck: ${report.readingCoverage.missingWordCardReadings}`,
        `- No curated example yet: ${report.readingCoverage.missingExampleReadings}`,
    ];

    if (report.inventory.missingEligibleEntries.length > 0) {
        lines.push("", "Missing starter-eligible N-level rows:");
        for (const entry of report.inventory.missingEligibleEntries.slice(0, maxEntries)) {
            lines.push(`- ${entry.written} (${entry.reading})`);
        }
    }

    if (report.inventory.excludedSourceEntries.length > 0) {
        lines.push("", "Tracked source-only exclusions outside canonical inventory:");
        for (const entry of report.inventory.excludedSourceEntries.slice(0, maxEntries)) {
            const reason = entry.exclusionReason ? ` — ${entry.exclusionReason}` : "";
            lines.push(`- ${entry.written} (${entry.reading})${reason}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    buildWordDeckReadiness,
    formatWordDeckCompletionReport,
};
