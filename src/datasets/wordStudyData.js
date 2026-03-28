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

const wordStudyEntrySchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    meaning: z.string().min(1),
    source: z.string().default("word-study-data"),
    tags: z.array(z.string()).default(["curated"]),
    jlpt: z.number().int().min(1).max(5).optional(),
    notes: z.string().min(1).optional(),
    exampleSentence: wordStudySentenceSchema.optional(),
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

module.exports = {
    buildWordStudyEntryKey,
    cleanString,
    loadWordStudyData,
    normalizeTags,
    normalizeWordStudyData,
    normalizeWordStudyEntry,
    normalizeWordStudySentence,
    wordStudyDataSchema,
    wordStudyEntrySchema,
    wordStudySentenceSchema,
};
