const fs = require("node:fs");
const { z } = require("zod");

const sourceUseSchema = z.string().min(1);

const levelCoverageSchema = z.object({
    expected: z.number().int().nonnegative(),
    entries: z.number().int().nonnegative(),
    withOnReading: z.number().int().nonnegative(),
    withKunReading: z.number().int().nonnegative(),
}).strict();

const readingReferenceEntrySchema = z.object({
    level: z.number().int().min(1).max(5),
    onReadings: z.array(z.string().min(1)),
    kunReadings: z.array(z.string().min(1)),
    normalizedOnReadings: z.array(z.string().min(1)),
    normalizedKunReadings: z.array(z.string().min(1)),
    sourceRef: z.string().min(1),
}).strict();

const kanjiReadingReferenceContractSchema = z.object({
    version: z.number().int().min(1),
    contractType: z.literal("kanji-reading-reference"),
    standard: z.literal("kanji-reading-reference-v1"),
    checkedAt: z.string().min(1),
    sourceUse: z.object({
        sourceId: z.string().min(1),
        sourceName: z.string().min(1),
        sourceFamily: z.string().min(1),
        independenceGroup: z.string().min(1),
        publisher: z.string().min(1),
        sourceUrl: z.string().min(1),
        license: z.string().min(1),
        licenseEvidenceUrl: z.string().min(1),
        allowedUse: z.array(sourceUseSchema),
        disallowedUse: z.array(sourceUseSchema),
        attribution: z.string().min(1),
    }).strict(),
    sourceFile: z.object({
        path: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
        byteSize: z.number().int().positive(),
        header: z.object({
            fileVersion: z.string().min(1),
            databaseVersion: z.string().min(1),
            dateOfCreation: z.string().min(1),
        }).strict(),
    }).strict(),
    extraction: z.object({
        readingTypesIncluded: z.array(z.string().min(1)),
        readingTypesExcluded: z.array(z.string().min(1)),
        notes: z.string().min(1),
    }).strict(),
    coverage: z.object({
        contractKanjiCount: z.number().int().nonnegative(),
        sourceCharacterCount: z.number().int().positive(),
        entryCount: z.number().int().nonnegative(),
        missingEntryCount: z.number().int().nonnegative(),
        missingOnReading: z.number().int().nonnegative(),
        missingKunReading: z.number().int().nonnegative(),
        byLevel: z.object({
            "1": levelCoverageSchema,
            "2": levelCoverageSchema,
            "3": levelCoverageSchema,
            "4": levelCoverageSchema,
            "5": levelCoverageSchema,
        }).strict(),
    }).strict(),
    entries: z.record(z.string().min(1), readingReferenceEntrySchema),
}).strict();

function listOverlap(left = [], right = []) {
    const rightSet = new Set(right || []);
    return (left || []).filter((value) => rightSet.has(value));
}

function countByLevel(entries = {}) {
    const counts = {
        1: { entries: 0, withOnReading: 0, withKunReading: 0 },
        2: { entries: 0, withOnReading: 0, withKunReading: 0 },
        3: { entries: 0, withOnReading: 0, withKunReading: 0 },
        4: { entries: 0, withOnReading: 0, withKunReading: 0 },
        5: { entries: 0, withOnReading: 0, withKunReading: 0 },
    };

    for (const entry of Object.values(entries || {})) {
        const levelCounts = counts[entry.level];
        if (!levelCounts) {
            continue;
        }
        levelCounts.entries += 1;
        if (entry.onReadings.length > 0) {
            levelCounts.withOnReading += 1;
        }
        if (entry.kunReadings.length > 0) {
            levelCounts.withKunReading += 1;
        }
    }

    return counts;
}

function parseKanjiReadingReferenceContract(value) {
    const parsed = kanjiReadingReferenceContractSchema.parse(value);
    const failures = [];
    const allowedUse = parsed.sourceUse.allowedUse || [];
    const disallowedUse = parsed.sourceUse.disallowedUse || [];

    if (!allowedUse.includes("kanji-reading-reference")) {
        failures.push("sourceUse.allowedUse must include kanji-reading-reference.");
    }
    for (const blockedUse of ["kanji-field-verification", "word-field-verification", "placement-claim-origin", "level-truth"]) {
        if (!disallowedUse.includes(blockedUse)) {
            failures.push(`sourceUse.disallowedUse must include ${blockedUse}.`);
        }
    }
    const conflictingUses = listOverlap(allowedUse, disallowedUse);
    if (conflictingUses.length > 0) {
        failures.push(`sourceUse both allows and disallows: ${conflictingUses.join(", ")}.`);
    }
    if (parsed.extraction.readingTypesIncluded.join(",") !== "ja_on,ja_kun") {
        failures.push("extraction.readingTypesIncluded must be exactly ja_on,ja_kun.");
    }
    if (parsed.coverage.entryCount !== Object.keys(parsed.entries).length) {
        failures.push("coverage.entryCount must match entries count.");
    }
    if (parsed.coverage.contractKanjiCount !== parsed.coverage.entryCount + parsed.coverage.missingEntryCount) {
        failures.push("coverage.contractKanjiCount must equal entries plus missing entries.");
    }

    const computedLevelCounts = countByLevel(parsed.entries);
    for (const [level, computed] of Object.entries(computedLevelCounts)) {
        const declared = parsed.coverage.byLevel[level];
        if (declared.entries !== computed.entries) {
            failures.push(`coverage.byLevel.${level}.entries must match entry levels.`);
        }
        if (declared.withOnReading !== computed.withOnReading) {
            failures.push(`coverage.byLevel.${level}.withOnReading must match entry readings.`);
        }
        if (declared.withKunReading !== computed.withKunReading) {
            failures.push(`coverage.byLevel.${level}.withKunReading must match entry readings.`);
        }
    }

    if (failures.length > 0) {
        throw new Error(`Invalid kanji reading reference contract:\n- ${failures.join("\n- ")}`);
    }

    return parsed;
}

function loadKanjiReadingReferenceContract(filePath) {
    return parseKanjiReadingReferenceContract(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function auditKanjiReadingReferenceContract({
    readingReferenceContract = {},
    jlptLevelContract = {},
    platinumCardSourceManifest = null,
} = {}) {
    const failures = [];
    const entries = readingReferenceContract.entries || {};
    const contractLevels = jlptLevelContract.kanjiLevels || {};
    const sourceId = readingReferenceContract.sourceUse?.sourceId;
    const manifestSource = platinumCardSourceManifest?.sources?.[sourceId];

    if (!manifestSource) {
        failures.push(`Reading reference source ${sourceId || "(missing)"} is not registered in the platinum card source manifest.`);
    } else {
        if (!manifestSource.allowedUse.includes("kanji-reading-reference")) {
            failures.push(`Reading reference source ${sourceId} must allow kanji-reading-reference.`);
        }
        if (manifestSource.allowedUse.includes("kanji-field-verification")) {
            failures.push(`Reading reference source ${sourceId} must not allow kanji-field-verification.`);
        }
        if (manifestSource.licenseUse.status !== "approved") {
            failures.push(`Reading reference source ${sourceId} must have approved license/use status.`);
        }
    }

    const missingKanji = [];
    const unexpectedKanji = [];
    const levelMismatches = [];
    for (const [kanji, level] of Object.entries(contractLevels)) {
        const entry = entries[kanji];
        if (!entry) {
            missingKanji.push(kanji);
            continue;
        }
        if (entry.level !== level) {
            levelMismatches.push({ kanji, expectedLevel: level, actualLevel: entry.level });
        }
    }
    for (const kanji of Object.keys(entries)) {
        if (!Object.prototype.hasOwnProperty.call(contractLevels, kanji)) {
            unexpectedKanji.push(kanji);
        }
    }

    if (missingKanji.length > 0) {
        failures.push(`Reading reference contract is missing ${missingKanji.length} JLPT kanji.`);
    }
    if (unexpectedKanji.length > 0) {
        failures.push(`Reading reference contract includes ${unexpectedKanji.length} kanji outside the JLPT contract.`);
    }
    if (levelMismatches.length > 0) {
        failures.push(`Reading reference contract has ${levelMismatches.length} JLPT level mismatches.`);
    }

    return {
        passed: failures.length === 0,
        failures,
        counts: {
            contractKanji: Object.keys(contractLevels).length,
            readingReferenceEntries: Object.keys(entries).length,
            missingKanji: missingKanji.length,
            unexpectedKanji: unexpectedKanji.length,
            levelMismatches: levelMismatches.length,
            missingOnReading: readingReferenceContract.coverage?.missingOnReading || 0,
            missingKunReading: readingReferenceContract.coverage?.missingKunReading || 0,
        },
        missingKanji,
        unexpectedKanji,
        levelMismatches,
    };
}

module.exports = {
    auditKanjiReadingReferenceContract,
    kanjiReadingReferenceContractSchema,
    loadKanjiReadingReferenceContract,
    parseKanjiReadingReferenceContract,
};
