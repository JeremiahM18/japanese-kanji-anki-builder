const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const { buildWordStudyEntryKey, cleanString } = require("./wordStudyData");

const pitchAccentSourceSchema = z.object({
    name: z.string().min(1),
    license: z.string().min(1),
    url: z.string().min(1).optional(),
    licenseUrl: z.string().min(1).optional(),
    attribution: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
}).strict();

const pitchAccentEntrySchema = z.object({
    pattern: z.string().min(1),
    sourceId: z.string().min(1),
    sourceWord: z.string().min(1).optional(),
    sourceReading: z.string().min(1).optional(),
    sourceAccent: z.string().min(1).optional(),
    sourceQuery: z.string().min(1).optional(),
    generatedReading: z.string().min(1).optional(),
    reviewed: z.boolean().optional(),
}).strict();

const wordPitchAccentDataSchema = z.object({
    version: z.number().int().min(1).default(1),
    sources: z.record(z.string().min(1), pitchAccentSourceSchema).default({}),
    entries: z.record(z.string().min(1), pitchAccentEntrySchema).default({}),
}).strict();

function normalizePitchAccentSource(source) {
    return pitchAccentSourceSchema.parse({
        name: cleanString(source?.name),
        license: cleanString(source?.license),
        url: cleanString(source?.url),
        licenseUrl: cleanString(source?.licenseUrl),
        attribution: cleanString(source?.attribution),
        notes: cleanString(source?.notes),
    });
}

function normalizePitchAccentEntry(entry) {
    return pitchAccentEntrySchema.parse({
        pattern: cleanString(entry?.pattern),
        sourceId: cleanString(entry?.sourceId),
        sourceWord: cleanString(entry?.sourceWord),
        sourceReading: cleanString(entry?.sourceReading),
        sourceAccent: cleanString(entry?.sourceAccent),
        sourceQuery: cleanString(entry?.sourceQuery),
        generatedReading: cleanString(entry?.generatedReading),
        reviewed: typeof entry?.reviewed === "boolean" ? entry.reviewed : undefined,
    });
}

function normalizeWordPitchAccentData(data = {}) {
    const parsed = wordPitchAccentDataSchema.parse(data);
    const sources = {};
    const entries = {};

    for (const sourceId of Object.keys(parsed.sources || {}).sort((a, b) => a.localeCompare(b))) {
        sources[sourceId] = normalizePitchAccentSource(parsed.sources[sourceId]);
    }

    for (const key of Object.keys(parsed.entries || {}).sort((a, b) => a.localeCompare(b))) {
        const entry = normalizePitchAccentEntry(parsed.entries[key]);
        if (!sources[entry.sourceId]) {
            throw new Error(`Pitch accent entry ${key} references unknown source ${entry.sourceId}.`);
        }
        entries[key] = entry;
    }

    return {
        version: parsed.version,
        sources,
        entries,
    };
}

function loadWordPitchAccentData(filePath = path.resolve(process.cwd(), "templates", "word_pitch_accent_data.json")) {
    if (!filePath || !fs.existsSync(filePath)) {
        return normalizeWordPitchAccentData();
    }

    return normalizeWordPitchAccentData(JSON.parse(fs.readFileSync(filePath, "utf-8")));
}

function resolveWordPitchAccent({ written, reading, wordPitchAccentData }) {
    const key = buildWordStudyEntryKey({ written, reading });
    return wordPitchAccentData?.entries?.[key] || null;
}

module.exports = {
    loadWordPitchAccentData,
    normalizePitchAccentEntry,
    normalizePitchAccentSource,
    normalizeWordPitchAccentData,
    pitchAccentEntrySchema,
    pitchAccentSourceSchema,
    resolveWordPitchAccent,
    wordPitchAccentDataSchema,
};
