const fs = require("node:fs");
const { z } = require("zod");

const jlptOnlyEntrySchema = z.object({
    jlpt: z.number().int().min(1).max(5),
}).passthrough();

const jlptOnlyJsonSchema = z.record(z.string().min(1), jlptOnlyEntrySchema);
const canonicalJlptInventoryCounts = Object.freeze({
    1: 1232,
    2: 367,
    3: 367,
    4: 166,
    5: 80,
});
const requiredCanonicalKanjiLevels = Object.freeze({
    "分": 5,
});

function parseJlptOnlyJson(value) {
    return jlptOnlyJsonSchema.parse(value);
}

function loadJlptOnlyJson(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseJlptOnlyJson(JSON.parse(text));
}

function buildJlptInventorySummary(data = {}) {
    const counts = Object.values(data).reduce((acc, entry) => {
        if (Number.isInteger(entry?.jlpt)) {
            acc[entry.jlpt] = (acc[entry.jlpt] || 0) + 1;
        }
        return acc;
    }, {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    });

    return {
        totalKanji: Object.keys(data || {}).length,
        counts,
    };
}

function validateCanonicalJlptInventory(data = {}) {
    const summary = buildJlptInventorySummary(data);
    const errors = [];

    for (const [level, expectedCount] of Object.entries(canonicalJlptInventoryCounts)) {
        const actualCount = summary.counts[level] || 0;

        if (actualCount !== expectedCount) {
            errors.push(`JLPT N${level} count mismatch: expected ${expectedCount}, got ${actualCount}`);
        }
    }

    for (const [kanji, expectedLevel] of Object.entries(requiredCanonicalKanjiLevels)) {
        const actualLevel = data?.[kanji]?.jlpt;

        if (actualLevel !== expectedLevel) {
            errors.push(`${kanji} should be present at JLPT N${expectedLevel} but was ${actualLevel ?? "missing"}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        summary,
    };
}

module.exports = {
    buildJlptInventorySummary,
    canonicalJlptInventoryCounts,
    jlptOnlyEntrySchema,
    jlptOnlyJsonSchema,
    loadJlptOnlyJson,
    parseJlptOnlyJson,
    requiredCanonicalKanjiLevels,
    validateCanonicalJlptInventory,
};
