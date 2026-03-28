const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const curatedSentenceSchema = z.object({
    japanese: z.string().min(1),
    reading: z.string().min(1).optional(),
    english: z.string().min(1),
    source: z.string().default("curated-study-data"),
    tags: z.array(z.string()).default(["curated"]),
});

const curatedDisplayWordSchema = z.object({
    written: z.string().min(1),
    pron: z.string().min(1).optional(),
});

const curatedEntrySchema = z.object({
    englishMeaning: z.string().min(1).optional(),
    breakdownEnglishMeaning: z.string().min(1).optional(),
    displayWord: curatedDisplayWordSchema.optional(),
    breakdownDisplayWord: curatedDisplayWordSchema.optional(),
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

function normalizeCuratedDisplayWord(displayWord) {
    if (!displayWord) {
        return undefined;
    }

    return curatedDisplayWordSchema.parse({
        written: cleanString(displayWord.written),
        pron: cleanString(displayWord.pron),
    });
}

function normalizeCuratedEntry(entry) {
    return curatedEntrySchema.parse({
        englishMeaning: cleanString(entry?.englishMeaning),
        breakdownEnglishMeaning: cleanString(entry?.breakdownEnglishMeaning),
        displayWord: normalizeCuratedDisplayWord(entry?.displayWord),
        breakdownDisplayWord: normalizeCuratedDisplayWord(entry?.breakdownDisplayWord),
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

function loadCuratedStudyDataFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return {};
    }

    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
        throw new Error(`Expected JSON object in ${filePath}`);
    }

    return parsed;
}

function mergeCuratedEntry(starterEntry = {}, localEntry = {}) {
    return {
        ...starterEntry,
        ...localEntry,
        ...(starterEntry.displayWord || localEntry.displayWord
            ? {
                displayWord: {
                    ...(starterEntry.displayWord || {}),
                    ...(localEntry.displayWord || {}),
                },
            }
            : {}),
        ...(starterEntry.breakdownDisplayWord || localEntry.breakdownDisplayWord
            ? {
                breakdownDisplayWord: {
                    ...(starterEntry.breakdownDisplayWord || {}),
                    ...(localEntry.breakdownDisplayWord || {}),
                },
            }
            : {}),
        ...(starterEntry.exampleSentence || localEntry.exampleSentence
            ? {
                exampleSentence: {
                    ...(starterEntry.exampleSentence || {}),
                    ...(localEntry.exampleSentence || {}),
                },
            }
            : {}),
    };
}

function mergeCuratedStudyData(starterEntries = {}, localEntries = {}) {
    const merged = {};
    const keys = new Set([
        ...Object.keys(starterEntries || {}),
        ...Object.keys(localEntries || {}),
    ]);

    for (const key of [...keys].sort(compareCuratedKeys)) {
        merged[key] = mergeCuratedEntry(starterEntries?.[key], localEntries?.[key]);
    }

    return merged;
}

function loadCuratedStudyData(
    curatedStudyDataPath,
    {
        starterPath = path.resolve(process.cwd(), "templates", "starter_curated_study_data.json"),
    } = {}
) {
    const starterEntries = loadCuratedStudyDataFile(starterPath);
    const localEntries = loadCuratedStudyDataFile(curatedStudyDataPath);
    return normalizeCuratedStudyData(mergeCuratedStudyData(starterEntries, localEntries));
}

module.exports = {
    cleanString,
    curatedDisplayWordSchema,
    curatedEntrySchema,
    curatedSentenceSchema,
    curatedStudyDataSchema,
    loadCuratedStudyData,
    loadCuratedStudyDataFile,
    mergeCuratedEntry,
    mergeCuratedStudyData,
    normalizeCuratedDisplayWord,
    normalizeCuratedEntry,
    normalizeCuratedSentence,
    normalizeCuratedStudyData,
    normalizeOrderedStringArray,
    normalizeStringArray,
    normalizeTags,
};
