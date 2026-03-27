const fs = require("node:fs");
const { z } = require("zod");

const curatedSentenceSchema = z.object({
    japanese: z.string().min(1),
    reading: z.string().min(1).optional(),
    english: z.string().min(1),
    source: z.string().default("curated-study-data"),
    tags: z.array(z.string()).default(["curated"]),
});

const curatedEntrySchema = z.object({
    englishMeaning: z.string().min(1).optional(),
    source: z.string().default("curated-study-data"),
    tags: z.array(z.string()).default(["curated"]),
    jlpt: z.number().int().min(1).max(5).optional(),
    preferredWords: z.array(z.string().min(1)).default([]),
    blockedWords: z.array(z.string().min(1)).default([]),
    blockedSentencePhrases: z.array(z.string().min(1)).default([]),
    notes: z.string().min(1).optional(),
    alternativeNotes: z.array(z.string().min(1)).default([]),
    exampleSentence: curatedSentenceSchema.optional(),
});

const curatedStudyDataSchema = z.record(z.string().min(1), curatedEntrySchema);

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

function normalizeStringArray(values) {
    const normalized = new Set(
        (Array.isArray(values) ? values : [])
            .map((value) => cleanString(value))
            .filter(Boolean)
    );

    return [...normalized].sort((a, b) => a.localeCompare(b));
}

function normalizeOrderedStringArray(values) {
    const out = [];
    const seen = new Set();

    for (const value of Array.isArray(values) ? values : []) {
        const cleaned = cleanString(value);
        if (!cleaned || seen.has(cleaned)) {
            continue;
        }

        seen.add(cleaned);
        out.push(cleaned);
    }

    return out;
}

function normalizeCuratedSentence(sentence) {
    if (!sentence) {
        return undefined;
    }

    return curatedSentenceSchema.parse({
        japanese: cleanString(sentence.japanese),
        reading: cleanString(sentence.reading),
        english: cleanString(sentence.english),
        source: cleanString(sentence.source) || "curated-study-data",
        tags: normalizeTags(sentence.tags),
    });
}

function normalizeCuratedEntry(entry) {
    return curatedEntrySchema.parse({
        englishMeaning: cleanString(entry?.englishMeaning),
        source: cleanString(entry?.source) || "curated-study-data",
        tags: normalizeTags(entry?.tags),
        jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : undefined,
        preferredWords: normalizeOrderedStringArray(entry?.preferredWords),
        blockedWords: normalizeStringArray(entry?.blockedWords),
        blockedSentencePhrases: normalizeStringArray(entry?.blockedSentencePhrases),
        notes: cleanString(entry?.notes),
        alternativeNotes: normalizeStringArray(entry?.alternativeNotes),
        exampleSentence: normalizeCuratedSentence(entry?.exampleSentence),
    });
}

function compareCuratedKeys(a, b) {
    return a.localeCompare(b);
}

function normalizeCuratedStudyData(curatedStudyData = {}) {
    const parsed = curatedStudyDataSchema.parse(curatedStudyData);
    const normalized = {};

    for (const key of Object.keys(parsed).sort(compareCuratedKeys)) {
        normalized[key] = normalizeCuratedEntry(parsed[key]);
    }

    return normalized;
}

function loadCuratedStudyData(curatedStudyDataPath) {
    if (!fs.existsSync(curatedStudyDataPath)) {
        return {};
    }

    const text = fs.readFileSync(curatedStudyDataPath, "utf-8");
    const parsed = JSON.parse(text);
    return normalizeCuratedStudyData(parsed);
}

module.exports = {
    cleanString,
    curatedEntrySchema,
    curatedSentenceSchema,
    curatedStudyDataSchema,
    loadCuratedStudyData,
    normalizeCuratedEntry,
    normalizeCuratedSentence,
    normalizeCuratedStudyData,
    normalizeOrderedStringArray,
    normalizeStringArray,
    normalizeTags,
};
