const fs = require("node:fs");
const { z } = require("zod");

const jlptLevelSchema = z.number().int().min(1).max(5);

const jlptLevelContractSchema = z.object({
    version: z.number().int().min(1).default(1),
    inventoryCounts: z.object({
        "1": z.number().int().nonnegative(),
        "2": z.number().int().nonnegative(),
        "3": z.number().int().nonnegative(),
        "4": z.number().int().nonnegative(),
        "5": z.number().int().nonnegative(),
    }),
    kanjiLevels: z.record(z.string().min(1), jlptLevelSchema),
}).strict();

function parseJlptLevelContract(value) {
    return jlptLevelContractSchema.parse(value);
}

function loadJlptLevelContract(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseJlptLevelContract(JSON.parse(text));
}

function buildInventoryCountsFromKanjiLevels(kanjiLevels = {}) {
    const counts = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };

    for (const level of Object.values(kanjiLevels || {})) {
        if (Number.isInteger(level) && counts[level] !== undefined) {
            counts[level] += 1;
        }
    }

    return counts;
}

function buildJlptLevelContract({ kanjiLevels = {}, version = 1 } = {}) {
    const counts = buildInventoryCountsFromKanjiLevels(kanjiLevels);

    return parseJlptLevelContract({
        version,
        inventoryCounts: {
            "1": counts[1],
            "2": counts[2],
            "3": counts[3],
            "4": counts[4],
            "5": counts[5],
        },
        kanjiLevels,
    });
}

function buildJlptInventoryCountsFromDataset(jlptOnlyJson = {}) {
    return Object.values(jlptOnlyJson).reduce((counts, entry) => {
        if (Number.isInteger(entry?.jlpt) && counts[entry.jlpt] !== undefined) {
            counts[entry.jlpt] += 1;
        }
        return counts;
    }, {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    });
}

function auditJlptInventoryAgainstContract(jlptOnlyJson = {}, contract = {}) {
    const contractLevels = contract?.kanjiLevels || {};
    const contractCounts = contract?.inventoryCounts || {};
    const datasetCounts = buildJlptInventoryCountsFromDataset(jlptOnlyJson);
    const missingKanji = [];
    const unexpectedKanji = [];
    const levelMismatches = [];

    for (const [kanji, expectedLevel] of Object.entries(contractLevels)) {
        const actualLevel = jlptOnlyJson?.[kanji]?.jlpt;
        if (actualLevel === undefined) {
            missingKanji.push(kanji);
            continue;
        }

        if (actualLevel !== expectedLevel) {
            levelMismatches.push({
                kanji,
                expectedLevel,
                actualLevel,
            });
        }
    }

    for (const kanji of Object.keys(jlptOnlyJson || {})) {
        if (!Object.prototype.hasOwnProperty.call(contractLevels, kanji)) {
            unexpectedKanji.push(kanji);
        }
    }

    const countMismatches = Object.keys(contractCounts)
        .map((level) => {
            const expectedCount = contractCounts[level] || 0;
            const actualCount = datasetCounts[level] || 0;
            return expectedCount === actualCount
                ? null
                : {
                    level: Number(level),
                    expectedCount,
                    actualCount,
                };
        })
        .filter(Boolean);

    return {
        valid: missingKanji.length === 0 && unexpectedKanji.length === 0 && levelMismatches.length === 0 && countMismatches.length === 0,
        contractKanjiCount: Object.keys(contractLevels).length,
        datasetKanjiCount: Object.keys(jlptOnlyJson || {}).length,
        contractCounts,
        datasetCounts,
        missingKanji,
        unexpectedKanji,
        levelMismatches,
        countMismatches,
    };
}

function auditStarterEntriesAgainstContract(starterEntries = {}, contract = {}) {
    const contractLevels = contract?.kanjiLevels || {};
    const mismatches = [];

    for (const [kanji, entry] of Object.entries(starterEntries || {})) {
        const expectedLevel = contractLevels[kanji];
        const actualLevel = entry?.jlpt;
        const expectedTag = Number.isInteger(expectedLevel) ? `n${expectedLevel}` : null;
        const hasExpectedTag = expectedTag ? Array.isArray(entry?.tags) && entry.tags.includes(expectedTag) : false;

        if (!Number.isInteger(expectedLevel) || actualLevel !== expectedLevel || !hasExpectedTag) {
            mismatches.push({
                kanji,
                expectedLevel: expectedLevel ?? null,
                actualLevel: Number.isInteger(actualLevel) ? actualLevel : null,
                expectedTag,
                tags: Array.isArray(entry?.tags) ? entry.tags : [],
            });
        }
    }

    return {
        valid: mismatches.length === 0,
        entryCount: Object.keys(starterEntries || {}).length,
        mismatchCount: mismatches.length,
        mismatches,
    };
}

function auditGoldenReviewSetsAgainstContract(goldenReviewSets = {}, contract = {}) {
    const contractLevels = contract?.kanjiLevels || {};
    const mismatches = [];

    for (const [levelKey, entries] of Object.entries(goldenReviewSets || {})) {
        const reviewLevel = Number(levelKey);

        for (const entry of Array.isArray(entries) ? entries : []) {
            const kanji = String(entry?.kanji || "").trim();
            if (!kanji) {
                continue;
            }

            const expectedLevel = contractLevels[kanji];
            if (!Number.isInteger(expectedLevel) || expectedLevel !== reviewLevel) {
                mismatches.push({
                    kanji,
                    reviewLevel,
                    expectedLevel: Number.isInteger(expectedLevel) ? expectedLevel : null,
                });
            }
        }
    }

    return {
        valid: mismatches.length === 0,
        mismatchCount: mismatches.length,
        mismatches,
    };
}

function syncJlptInventoryToContract(jlptOnlyJson = {}, contract = {}) {
    const contractLevels = contract?.kanjiLevels || {};
    const syncedDataset = {};
    const updates = [];

    for (const [kanji, entry] of Object.entries(jlptOnlyJson || {})) {
        const expectedLevel = contractLevels[kanji];
        const nextEntry = {
            ...entry,
        };

        if (Number.isInteger(expectedLevel) && entry?.jlpt !== expectedLevel) {
            nextEntry.jlpt = expectedLevel;
            updates.push({
                kanji,
                previousLevel: Number.isInteger(entry?.jlpt) ? entry.jlpt : null,
                nextLevel: expectedLevel,
            });
        }

        syncedDataset[kanji] = nextEntry;
    }

    return {
        syncedDataset,
        updates,
    };
}

module.exports = {
    auditGoldenReviewSetsAgainstContract,
    auditJlptInventoryAgainstContract,
    auditStarterEntriesAgainstContract,
    buildInventoryCountsFromKanjiLevels,
    buildJlptInventoryCountsFromDataset,
    buildJlptLevelContract,
    jlptLevelContractSchema,
    loadJlptLevelContract,
    parseJlptLevelContract,
    syncJlptInventoryToContract,
};
