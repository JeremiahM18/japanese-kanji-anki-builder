"use strict";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function buildWordSilverIdentity(row = {}) {
    const word = normalizeText(row.word);
    const reading = normalizeText(row.reading);
    return word && reading ? `${word}|${reading}` : "";
}

/**
 * Evaluates only Silver authority: a generated learner-facing surface exists
 * for each unique exact written|reading identity. It does not review content.
 *
 * @param {{rows?: Array<object>}} [options]
 * @returns {object}
 */
function evaluateWordSilverGeneratedSurface({ rows = [] } = {}) {
    const generatedRows = Array.isArray(rows) ? rows : [];
    const identityCounts = new Map();
    for (const row of generatedRows) {
        const identity = buildWordSilverIdentity(row);
        if (identity) {
            identityCounts.set(identity, (identityCounts.get(identity) || 0) + 1);
        }
    }
    const duplicateIdentities = [...identityCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([identity]) => identity)
        .sort((left, right) => left.localeCompare(right, "ja"));
    const duplicateSet = new Set(duplicateIdentities);
    const results = generatedRows.map((row, index) => {
        const identity = buildWordSilverIdentity(row);
        const failures = [];
        if (!normalizeText(row.word)) {
            failures.push("Silver generated row requires written form");
        }
        if (!normalizeText(row.reading)) {
            failures.push("Silver generated row requires reading");
        }
        if (identity && duplicateSet.has(identity)) {
            failures.push(`duplicate Silver generated identity: ${identity}`);
        }
        return {
            index,
            identity: identity || `(invalid-row-${index + 1})`,
            word: normalizeText(row.word),
            reading: normalizeText(row.reading),
            passed: failures.length === 0,
            failures,
        };
    });
    const passedCount = results.filter((result) => result.passed).length;
    return {
        tier: "Silver",
        authority: "generated learner-facing word surface exists for exact written|reading identity",
        totalRows: generatedRows.length,
        passedCount,
        failedCount: results.length - passedCount,
        duplicateIdentities,
        passed: results.length > 0 && passedCount === results.length,
        results,
    };
}

module.exports = {
    buildWordSilverIdentity,
    evaluateWordSilverGeneratedSurface,
};
