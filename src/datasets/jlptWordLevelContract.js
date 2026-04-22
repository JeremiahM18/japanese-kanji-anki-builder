const fs = require("node:fs");
const { z } = require("zod");
const { buildWordCoverageContractSummary, hasPhraseTag } = require("./wordStudyData");

const jlptLevelSchema = z.number().int().min(1).max(5);

const jlptWordLevelEntrySchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    jlpt: jlptLevelSchema,
}).strict();

const excludedWordLevelEntrySchema = jlptWordLevelEntrySchema.extend({
    exclusionReason: z.string().min(1),
}).strict();

const serializedLevelCountsSchema = z.object({
    "1": z.number().int().nonnegative(),
    "2": z.number().int().nonnegative(),
    "3": z.number().int().nonnegative(),
    "4": z.number().int().nonnegative(),
    "5": z.number().int().nonnegative(),
});

const jlptWordLevelContractSchema = z.object({
    version: z.number().int().min(1).default(1),
    inventoryCounts: serializedLevelCountsSchema,
    excludedCounts: serializedLevelCountsSchema.default({
        "1": 0,
        "2": 0,
        "3": 0,
        "4": 0,
        "5": 0,
    }),
    wordLevels: z.record(z.string().min(1), jlptWordLevelEntrySchema),
    excludedWordLevels: z.record(z.string().min(1), excludedWordLevelEntrySchema).default({}),
}).strict();

function parseJlptWordLevelContract(value) {
    return jlptWordLevelContractSchema.parse(value);
}

function buildSerializedInventoryCounts(wordLevels = {}) {
    const counts = buildInventoryCountsFromEntries(wordLevels);
    return {
        "1": counts[1],
        "2": counts[2],
        "3": counts[3],
        "4": counts[4],
        "5": counts[5],
    };
}

function buildSerializedExcludedCounts(wordLevels = {}) {
    return buildSerializedInventoryCounts(wordLevels);
}

function loadJlptWordLevelContract(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = parseJlptWordLevelContract(JSON.parse(text));
    const expectedCounts = buildSerializedInventoryCounts(parsed.wordLevels);
    const expectedExcludedCounts = buildSerializedExcludedCounts(parsed.excludedWordLevels);

    for (const level of ["1", "2", "3", "4", "5"]) {
        if (parsed.inventoryCounts[level] !== expectedCounts[level]) {
            throw new Error(
                `JLPT word contract inventoryCounts.${level} is stale: expected ${expectedCounts[level]}, received ${parsed.inventoryCounts[level]}.`
            );
        }
        if (parsed.excludedCounts[level] !== expectedExcludedCounts[level]) {
            throw new Error(
                `JLPT word contract excludedCounts.${level} is stale: expected ${expectedExcludedCounts[level]}, received ${parsed.excludedCounts[level]}.`
            );
        }
    }

    for (const key of Object.keys(parsed.wordLevels)) {
        if (Object.prototype.hasOwnProperty.call(parsed.excludedWordLevels, key)) {
            throw new Error(`JLPT word contract key ${key} cannot exist in both wordLevels and excludedWordLevels.`);
        }
    }

    return parsed;
}

function buildInventoryCountsFromEntries(wordLevels = {}) {
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

function buildInventoryCountsFromWordLevels(wordLevels = {}) {
    return buildInventoryCountsFromEntries(wordLevels);
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

function buildJlptWordLevelContract({ wordLevels = {}, excludedWordLevels = {}, version = 1 } = {}) {
    return parseJlptWordLevelContract({
        version,
        inventoryCounts: buildSerializedInventoryCounts(wordLevels),
        excludedCounts: buildSerializedExcludedCounts(excludedWordLevels),
        wordLevels,
        excludedWordLevels,
    });
}

function getJlptWordLevel(contract = {}, key = "") {
    const entry = contract?.wordLevels?.[key];
    return Number.isInteger(entry?.jlpt) ? entry.jlpt : null;
}

function auditWordStudyEntriesAgainstContract(wordStudyEntries = {}, contract = {}) {
    const contractEntries = contract?.wordLevels || {};
    const excludedEntries = contract?.excludedWordLevels || {};
    const mismatches = [];
    const missingContractEntries = [];
    const missingExcludedContractEntries = [];

    for (const [key, entry] of Object.entries(wordStudyEntries || {})) {
        const phraseTagged = hasPhraseTag(entry);
        const contractEntry = phraseTagged ? excludedEntries[key] : contractEntries[key];

        if (!contractEntry) {
            const target = {
                key,
                written: String(entry?.written || "").trim(),
                reading: String(entry?.reading || "").trim(),
                actualLevel: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
            };
            if (phraseTagged) {
                missingExcludedContractEntries.push(target);
            } else {
                missingContractEntries.push(target);
            }
            continue;
        }

        if (
            contractEntry.written !== entry?.written
            || contractEntry.reading !== entry?.reading
            || contractEntry.jlpt !== entry?.jlpt
            || (phraseTagged && contractEntry.exclusionReason !== "phrase")
        ) {
            mismatches.push({
                key,
                scope: phraseTagged ? "excluded" : "canonical",
                expected: contractEntry,
                actual: {
                    written: String(entry?.written || "").trim(),
                    reading: String(entry?.reading || "").trim(),
                    jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
                    exclusionReason: phraseTagged ? "phrase" : undefined,
                },
            });
        }
    }

    const unexpectedContractEntries = Object.keys(contractEntries)
        .filter((key) => {
            const entry = wordStudyEntries?.[key];
            return !entry || hasPhraseTag(entry);
        })
        .map((key) => ({
            key,
            ...contractEntries[key],
        }));
    const unexpectedExcludedContractEntries = Object.keys(excludedEntries)
        .filter((key) => {
            const entry = wordStudyEntries?.[key];
            return !entry || !hasPhraseTag(entry);
        })
        .map((key) => ({
            key,
            ...excludedEntries[key],
        }));

    return {
        valid: mismatches.length === 0
            && missingContractEntries.length === 0
            && missingExcludedContractEntries.length === 0
            && unexpectedContractEntries.length === 0
            && unexpectedExcludedContractEntries.length === 0,
        entryCount: Object.keys(wordStudyEntries || {}).length,
        contractEntryCount: Object.keys(contractEntries).length + Object.keys(excludedEntries).length,
        canonicalContractEntryCount: Object.keys(contractEntries).length,
        excludedContractEntryCount: Object.keys(excludedEntries).length,
        mismatchCount: mismatches.length,
        missingContractEntryCount: missingContractEntries.length,
        missingExcludedContractEntryCount: missingExcludedContractEntries.length,
        unexpectedContractEntryCount: unexpectedContractEntries.length,
        unexpectedExcludedContractEntryCount: unexpectedExcludedContractEntries.length,
        mismatches,
        missingContractEntries,
        missingExcludedContractEntries,
        unexpectedContractEntries,
        unexpectedExcludedContractEntries,
        contractCounts: contract?.inventoryCounts || {},
        excludedCounts: contract?.excludedCounts || {},
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
