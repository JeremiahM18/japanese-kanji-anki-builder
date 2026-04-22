const { buildWordReadingCoverageReport, parseKanjiTsv, parseWordTsv } = require("./wordReadingCoverageService");
const { buildWordStudyEntryKey } = require("../datasets/wordStudyData");

function hasPhraseTag(entry) {
    return (Array.isArray(entry?.tags) ? entry.tags : [])
        .map((tag) => String(tag || "").trim().toLowerCase())
        .includes("phrase");
}

function buildWordDeckInventorySummary({ level, starterEntries, jlptWordLevelContract, builtWordRows }) {
    const contractEntries = Object.entries(jlptWordLevelContract?.wordLevels || {})
        .filter(([, entry]) => entry?.jlpt === level)
        .map(([key, entry]) => ({
            key,
            written: String(entry?.written || "").trim(),
            reading: String(entry?.reading || "").trim(),
            jlpt: entry?.jlpt ?? null,
            starterEntry: starterEntries?.[key] || null,
        }));
    const builtKeys = new Set(
        (Array.isArray(builtWordRows) ? builtWordRows : []).map((row) => buildWordStudyEntryKey({
            written: row?.Word || row?.word,
            reading: row?.Reading || row?.reading,
        }))
    );

    const phraseExcludedEntries = contractEntries.filter((entry) => hasPhraseTag(entry.starterEntry));
    const starterEligibleEntries = contractEntries.filter((entry) => !hasPhraseTag(entry.starterEntry));
    const builtEligibleEntries = starterEligibleEntries.filter((entry) => builtKeys.has(entry.key));
    const missingEligibleEntries = starterEligibleEntries.filter((entry) => !builtKeys.has(entry.key));
    const missingContractEntries = contractEntries.filter((entry) => !builtKeys.has(entry.key));
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
        .filter((entry) => !contractEntries.some((contractEntry) => contractEntry.key === entry.key));

    return {
        level,
        canonicalInventoryCount: contractEntries.length,
        starterEligibleCount: starterEligibleEntries.length,
        builtEligibleCount: builtEligibleEntries.length,
        phraseExcludedCount: phraseExcludedEntries.length,
        missingEligibleCount: missingEligibleEntries.length,
        missingContractCount: missingContractEntries.length,
        extraBuiltCount: builtExtraEntries.length,
        starterEligibleCoveragePercent: starterEligibleEntries.length > 0
            ? Number(((builtEligibleEntries.length / starterEligibleEntries.length) * 100).toFixed(2))
            : 0,
        canonicalInventoryCoveragePercent: contractEntries.length > 0
            ? Number((((contractEntries.length - missingContractEntries.length) / contractEntries.length) * 100).toFixed(2))
            : 0,
        phraseExcludedEntries,
        missingEligibleEntries,
        missingContractEntries,
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

    return {
        level,
        inventory,
        readingCoverage: readingCoverage.summary,
    };
}

function formatWordDeckCompletionReport(report, { maxEntries = 20 } = {}) {
    const lines = [
        `Japanese Kanji Builder Word Deck Completion Audit (N${report.level})`,
        "",
        "Vocabulary coverage:",
        `- Canonical inventory rows: ${report.inventory.canonicalInventoryCount}`,
        `- Starter-eligible rows: ${report.inventory.starterEligibleCount}`,
        `- Built starter-eligible rows: ${report.inventory.builtEligibleCount} (${report.inventory.starterEligibleCoveragePercent}%)`,
        `- Phrase-tagged exclusions: ${report.inventory.phraseExcludedCount}`,
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

    if (report.inventory.phraseExcludedEntries.length > 0) {
        lines.push("", "Phrase-tagged exclusions still in the canonical inventory:");
        for (const entry of report.inventory.phraseExcludedEntries.slice(0, maxEntries)) {
            lines.push(`- ${entry.written} (${entry.reading})`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    buildWordDeckCompletionReport,
    buildWordDeckInventorySummary,
    formatWordDeckCompletionReport,
    hasPhraseTag,
};
