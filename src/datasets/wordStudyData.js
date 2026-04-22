const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const wordStudySentenceSchema = z.object({
    japanese: z.string().min(1),
    reading: z.string().min(1).optional(),
    english: z.string().min(1),
    source: z.string().default("word-study-data"),
    tags: z.array(z.string()).default(["curated"]),
});

const wordCoverageRoleSchema = z.enum(["core", "support", "both"]);

const wordStudyCoverageSchema = z.object({
    role: wordCoverageRoleSchema,
    focusKanji: z.array(z.string().min(1)).min(1),
    coversReadings: z.record(z.string().min(1), z.string().min(1)).default({}),
}).strict();

const wordStudyEntrySchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    meaning: z.string().min(1),
    source: z.string().default("word-study-data"),
    tags: z.array(z.string()).default(["curated"]),
    jlpt: z.number().int().min(1).max(5).optional(),
    notes: z.string().min(1).optional(),
    exampleSentence: wordStudySentenceSchema.optional(),
    coverage: wordStudyCoverageSchema.optional(),
});

const wordStudyDataSchema = z.record(z.string().min(1), wordStudyEntrySchema);

function cleanString(value) {
    const text = String(value ?? "").trim();
    return text || undefined;
}

function normalizeTags(tags, fallback = ["curated"]) {
    const normalized = new Set(
        (Array.isArray(tags) ? tags : fallback)
            .map((tag) => cleanString(tag))
            .filter(Boolean)
            .map((tag) => tag.toLowerCase())
    );

    return [...normalized].sort((a, b) => a.localeCompare(b));
}

function buildWordStudyEntryKey({ written, reading }) {
    const normalizedWritten = String(written ?? "").trim();
    const normalizedReading = String(reading ?? "").trim();
    return `${normalizedWritten}|${normalizedReading}`;
}

function normalizeWordStudySentence(sentence) {
    if (!sentence) {
        return undefined;
    }

    return wordStudySentenceSchema.parse({
        japanese: cleanString(sentence.japanese),
        reading: cleanString(sentence.reading),
        english: cleanString(sentence.english),
        source: cleanString(sentence.source) || "word-study-data",
        tags: normalizeTags(sentence.tags),
    });
}

function normalizeCoverageFocusKanji(focusKanji = []) {
    return [...new Set(
        (Array.isArray(focusKanji) ? focusKanji : [])
            .map((kanji) => cleanString(kanji))
            .filter(Boolean)
    )];
}

function normalizeCoverageReadings(coversReadings = {}) {
    const normalized = {};
    for (const [kanji, reading] of Object.entries(coversReadings || {})) {
        const normalizedKanji = cleanString(kanji);
        const normalizedReading = cleanString(reading);
        if (!normalizedKanji || !normalizedReading) {
            continue;
        }
        normalized[normalizedKanji] = normalizedReading;
    }
    return normalized;
}

function normalizeWordCoverage(coverage) {
    if (!coverage) {
        return undefined;
    }

    const normalized = wordStudyCoverageSchema.parse({
        role: cleanString(coverage.role),
        focusKanji: normalizeCoverageFocusKanji(coverage.focusKanji),
        coversReadings: normalizeCoverageReadings(coverage.coversReadings),
    });

    return normalized;
}

function normalizeWordStudyEntry(entry) {
    return wordStudyEntrySchema.parse({
        written: cleanString(entry?.written),
        reading: cleanString(entry?.reading),
        meaning: cleanString(entry?.meaning),
        source: cleanString(entry?.source) || "word-study-data",
        tags: normalizeTags(entry?.tags),
        jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : undefined,
        notes: cleanString(entry?.notes),
        exampleSentence: normalizeWordStudySentence(entry?.exampleSentence),
        coverage: normalizeWordCoverage(entry?.coverage),
    });
}

function normalizeWordStudyData(wordStudyData = {}) {
    const parsed = wordStudyDataSchema.parse(wordStudyData);
    const normalized = {};

    for (const key of Object.keys(parsed).sort((a, b) => a.localeCompare(b))) {
        const entry = normalizeWordStudyEntry(parsed[key]);
        const normalizedKey = buildWordStudyEntryKey(entry);
        normalized[normalizedKey] = entry;
    }

    return normalized;
}

function loadWordStudyDataFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return {};
    }

    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function loadWordStudyData({
    localPath,
    starterPath = path.resolve(process.cwd(), "templates", "starter_word_study_data.json"),
} = {}) {
    const starterEntries = loadWordStudyDataFile(starterPath);
    const localEntries = loadWordStudyDataFile(localPath);
    return normalizeWordStudyData({
        ...starterEntries,
        ...localEntries,
    });
}

function buildWordCoverageContractSummary(wordStudyEntries = {}) {
    const levels = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const explicitCoverageEntriesByLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const explicitReadingTargetsByLevel = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    for (const entry of Object.values(wordStudyEntries || {})) {
        const level = Number.isInteger(entry?.jlpt) ? entry.jlpt : null;
        if (!level || levels[level] === undefined) {
            continue;
        }

        levels[level] += 1;
        if (!entry?.coverage) {
            continue;
        }

        explicitCoverageEntriesByLevel[level] += 1;
        explicitReadingTargetsByLevel[level] += Object.keys(entry.coverage.coversReadings || {}).length;
    }

    const explicitCoveragePercentByLevel = {};
    for (const level of [5, 4, 3, 2, 1]) {
        explicitCoveragePercentByLevel[level] = levels[level] > 0
            ? Number(((explicitCoverageEntriesByLevel[level] / levels[level]) * 100).toFixed(2))
            : 0;
    }

    return {
        starterEntriesByLevel: levels,
        explicitCoverageEntriesByLevel,
        explicitReadingTargetsByLevel,
        explicitCoveragePercentByLevel,
        totalStarterEntries: Object.values(levels).reduce((sum, count) => sum + count, 0),
        totalExplicitCoverageEntries: Object.values(explicitCoverageEntriesByLevel).reduce((sum, count) => sum + count, 0),
        totalExplicitReadingTargets: Object.values(explicitReadingTargetsByLevel).reduce((sum, count) => sum + count, 0),
    };
}

module.exports = {
    buildWordCoverageContractSummary,
    buildWordStudyEntryKey,
    cleanString,
    loadWordStudyData,
    normalizeTags,
    normalizeWordCoverage,
    normalizeWordStudyData,
    normalizeWordStudyEntry,
    normalizeWordStudySentence,
    wordCoverageRoleSchema,
    wordStudyCoverageSchema,
    wordStudyDataSchema,
    wordStudyEntrySchema,
    wordStudySentenceSchema,
};
