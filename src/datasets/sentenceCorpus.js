const fs = require("node:fs");
const { z } = require("zod");

const sentenceEntrySchema = z.object({
    kanji: z.string().min(1),
    written: z.string().min(1),
    japanese: z.string().min(1),
    reading: z.string().min(1).optional(),
    english: z.string().min(1),
    source: z.string().default("local-corpus"),
    tags: z.array(z.string()).default([]),
    frequencyRank: z.number().int().positive().optional(),
    register: z.enum(["neutral", "spoken", "formal", "literary"]).default("neutral"),
    jlpt: z.number().int().min(1).max(5).optional(),
});

const sentenceCorpusSchema = z.array(sentenceEntrySchema);

function cleanString(value) {
    const text = String(value ?? "").trim();
    return text || undefined;
}

function normalizeTags(tags) {
    const normalized = new Set(
        (Array.isArray(tags) ? tags : [])
            .map((tag) => cleanString(tag))
            .filter(Boolean)
            .map((tag) => tag.toLowerCase())
    );

    return [...normalized].sort((a, b) => a.localeCompare(b));
}

function normalizeRegister(register) {
    const normalized = String(register ?? "neutral").trim().toLowerCase();

    if (["neutral", "spoken", "formal", "literary"].includes(normalized)) {
        return normalized;
    }

    return "neutral";
}

function normalizeSentenceEntry(entry) {
    return sentenceEntrySchema.parse({
        kanji: cleanString(entry?.kanji),
        written: cleanString(entry?.written),
        japanese: cleanString(entry?.japanese),
        reading: cleanString(entry?.reading),
        english: cleanString(entry?.english),
        source: cleanString(entry?.source) || "local-corpus",
        tags: normalizeTags(entry?.tags),
        frequencyRank: Number.isInteger(entry?.frequencyRank) ? entry.frequencyRank : undefined,
        register: normalizeRegister(entry?.register),
        jlpt: Number.isInteger(entry?.jlpt) ? entry.jlpt : undefined,
    });
}

function buildSentenceEntryKey(entry) {
    return [entry.kanji, entry.written, entry.japanese].join("|");
}

function scoreSentenceEntryCompleteness(entry) {
    let score = 0;

    if (entry.reading) {
        score += 5;
    }
    if (entry.source && entry.source !== "local-corpus") {
        score += 3;
    }
    score += Array.isArray(entry.tags) ? entry.tags.length : 0;
    if (Number.isInteger(entry.frequencyRank)) {
        score += 2;
    }
    if (Number.isInteger(entry.jlpt)) {
        score += 1;
    }
    if (entry.register && entry.register !== "neutral") {
        score += 1;
    }

    return score;
}

function choosePreferredEntry(current, incoming) {
    const currentScore = scoreSentenceEntryCompleteness(current);
    const incomingScore = scoreSentenceEntryCompleteness(incoming);

    if (incomingScore !== currentScore) {
        return incomingScore > currentScore ? incoming : current;
    }

    const currentSource = current.source.localeCompare(incoming.source);
    if (currentSource !== 0) {
        return currentSource <= 0 ? current : incoming;
    }

    return current.english.localeCompare(incoming.english) <= 0 ? current : incoming;
}

function compareSentenceEntries(a, b) {
    return a.kanji.localeCompare(b.kanji)
        || a.written.localeCompare(b.written)
        || a.japanese.localeCompare(b.japanese)
        || a.english.localeCompare(b.english);
}

function normalizeSentenceCorpus(entries) {
    const map = new Map();

    for (const entry of sentenceCorpusSchema.parse(entries)) {
        const normalized = normalizeSentenceEntry(entry);
        const key = buildSentenceEntryKey(normalized);
        const existing = map.get(key);

        map.set(key, existing ? choosePreferredEntry(existing, normalized) : normalized);
    }

    return [...map.values()].sort(compareSentenceEntries);
}

function loadSentenceCorpus(sentenceCorpusPath) {
    if (!fs.existsSync(sentenceCorpusPath)) {
        return [];
    }

    const text = fs.readFileSync(sentenceCorpusPath, "utf-8");
    const parsed = JSON.parse(text);
    return normalizeSentenceCorpus(parsed);
}

module.exports = {
    buildSentenceEntryKey,
    compareSentenceEntries,
    loadSentenceCorpus,
    normalizeRegister,
    normalizeSentenceCorpus,
    normalizeSentenceEntry,
    normalizeTags,
    scoreSentenceEntryCompleteness,
    sentenceCorpusSchema,
    sentenceEntrySchema,
};
