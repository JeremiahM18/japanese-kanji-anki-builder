const fs = require("node:fs");
const { z } = require("zod");
const { buildWordCoverageContractSummary } = require("./wordStudyData");

const jlptLevelSchema = z.number().int().min(1).max(5);

const jlptWordLevelEntrySchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    jlpt: jlptLevelSchema,
}).strict();

const jlptWordLevelContractSchema = z.object({
    version: z.number().int().min(1).default(1),
    inventoryCounts: z.object({
        "1": z.number().int().nonnegative(),
        "2": z.number().int().nonnegative(),
        "3": z.number().int().nonnegative(),
        "4": z.number().int().nonnegative(),
        "5": z.number().int().nonnegative(),
    }),
    wordLevels: z.record(z.string().min(1), jlptWordLevelEntrySchema),
}).strict();

function parseJlptWordLevelContract(value) {
    return jlptWordLevelContractSchema.parse(value);
}

function loadJlptWordLevelContract(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseJlptWordLevelContract(JSON.parse(text));
}

function buildInventoryCountsFromWordLevels(wordLevels = {}) {
    const counts = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };

    for (const entry of Object.values(wordLevels || {})) {
        const level = entry?.jlpt;
        if (Number.isInteger(level) && counts[level] !== undefined) {
            counts[level] += 1;
        }
    }

    return counts;
}

function createLevelCounts() {
    return {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };
}

function incrementLevelCount(counts, level) {
    if (Number.isInteger(level) && counts[level] !== undefined) {
        counts[level] += 1;
    }
}

function entryMatchesContract(entry, contractEntry) {
    return contractEntry
        && contractEntry.written === entry?.written
        && contractEntry.reading === entry?.reading
        && contractEntry.jlpt === entry?.jlpt;
}

function hasPhraseTag(entry) {
    return (Array.isArray(entry?.tags) ? entry.tags : [])
        .map((tag) => String(tag || "").trim().toLowerCase())
        .includes("phrase");
}

function buildStarterWordGovernanceSummary(wordStudyEntries = {}, contract = {}) {
    const defaultDeckStarterCounts = createLevelCounts();
    const canonicalStarterCounts = createLevelCounts();
    const curatedOnlyStarterCounts = createLevelCounts();
    const mismatchStarterCounts = createLevelCounts();
    const excludedPhraseCounts = createLevelCounts();

    for (const [key, entry] of Object.entries(wordStudyEntries || {})) {
        const level = Number.isInteger(entry?.jlpt) ? entry.jlpt : null;
        if (hasPhraseTag(entry)) {
            incrementLevelCount(excludedPhraseCounts, level);
            continue;
        }

        incrementLevelCount(defaultDeckStarterCounts, level);
        const contractEntry = contract?.wordLevels?.[key];

        if (!contractEntry) {
            incrementLevelCount(curatedOnlyStarterCounts, level);
            continue;
        }

        if (entryMatchesContract(entry, contractEntry)) {
            incrementLevelCount(canonicalStarterCounts, level);
            continue;
        }

        incrementLevelCount(mismatchStarterCounts, level);
    }

    const coverageByLevel = {};
    for (const level of [5, 4, 3, 2, 1]) {
        const starterCount = defaultDeckStarterCounts[level] || 0;
        const canonicalCount = canonicalStarterCounts[level] || 0;
        coverageByLevel[level] = starterCount > 0
            ? Number(((canonicalCount / starterCount) * 100).toFixed(2))
            : 0;
    }

    const defaultDeckStarterCount = Object.values(defaultDeckStarterCounts).reduce((sum, count) => sum + count, 0);
    const canonicalStarterCount = Object.values(canonicalStarterCounts).reduce((sum, count) => sum + count, 0);

    return {
        defaultDeckStarterCount,
        canonicalStarterCount,
        curatedOnlyStarterCount: Object.values(curatedOnlyStarterCounts).reduce((sum, count) => sum + count, 0),
        mismatchStarterCount: Object.values(mismatchStarterCounts).reduce((sum, count) => sum + count, 0),
        excludedPhraseCount: Object.values(excludedPhraseCounts).reduce((sum, count) => sum + count, 0),
        defaultDeckStarterCounts,
        canonicalStarterCounts,
        curatedOnlyStarterCounts,
        mismatchStarterCounts,
        excludedPhraseCounts,
        coverageByLevel,
        overallCoverage: defaultDeckStarterCount > 0
            ? Number(((canonicalStarterCount / defaultDeckStarterCount) * 100).toFixed(2))
            : 0,
    };
}

function buildJlptWordLevelContract({ wordLevels = {}, version = 1 } = {}) {
    const counts = buildInventoryCountsFromWordLevels(wordLevels);

    return parseJlptWordLevelContract({
        version,
        inventoryCounts: {
            "1": counts[1],
            "2": counts[2],
            "3": counts[3],
            "4": counts[4],
            "5": counts[5],
        },
        wordLevels,
    });
}

function getJlptWordLevel(contract = {}, key = "") {
    const entry = contract?.wordLevels?.[key];
    return Number.isInteger(entry?.jlpt) ? entry.jlpt : null;
}

function auditWordStudyEntriesAgainstContract(wordStudyEntries = {}, contract = {}) {
    const contractEntries = contract?.wordLevels || {};
    const mismatches = [];
    const missingContractEntries = [];

    for (const [key, entry] of Object.entries(wordStudyEntries || {})) {
        const contractEntry = contractEntries[key];
        if (!contractEntry) {
            missingContractEntries.push({
                key,
                written: String(entry?.written || "").trim(),
                reading: String(entry?.reading || "").trim(),
                actualLevel: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
            });
            continue;
        }

        if (
            contractEntry.written !== entry?.written
            || contractEntry.reading !== entry?.reading
            || contractEntry.jlpt !== entry?.jlpt
        ) {
            mismatches.push({
                key,
                expected: contractEntry,
                actual: {
                    written: String(entry?.written || "").trim(),
                    reading: String(entry?.reading || "").trim(),
                    jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
                },
            });
        }
    }

    const unexpectedContractEntries = Object.keys(contractEntries)
        .filter((key) => !Object.prototype.hasOwnProperty.call(wordStudyEntries || {}, key))
        .map((key) => ({
            key,
            ...contractEntries[key],
        }));

    return {
        valid: mismatches.length === 0 && missingContractEntries.length === 0 && unexpectedContractEntries.length === 0,
        entryCount: Object.keys(wordStudyEntries || {}).length,
        contractEntryCount: Object.keys(contractEntries).length,
        mismatchCount: mismatches.length,
        missingContractEntryCount: missingContractEntries.length,
        unexpectedContractEntryCount: unexpectedContractEntries.length,
        mismatches,
        missingContractEntries,
        unexpectedContractEntries,
        contractCounts: contract?.inventoryCounts || {},
        starterCounts: buildInventoryCountsFromWordLevels(wordStudyEntries),
        starterGovernance: buildStarterWordGovernanceSummary(wordStudyEntries, contract),
        readingCoverageContract: buildWordCoverageContractSummary(wordStudyEntries),
    };
}

module.exports = {
    auditWordStudyEntriesAgainstContract,
    buildStarterWordGovernanceSummary,
    buildInventoryCountsFromWordLevels,
    buildJlptWordLevelContract,
    getJlptWordLevel,
    jlptWordLevelContractSchema,
    loadJlptWordLevelContract,
    parseJlptWordLevelContract,
};
