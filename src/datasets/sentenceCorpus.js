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

function loadSentenceCorpus(sentenceCorpusPath) {
    if (!fs.existsSync(sentenceCorpusPath)) {
        return [];
    }

    const text = fs.readFileSync(sentenceCorpusPath, "utf-8");
    const parsed = JSON.parse(text);
    return sentenceCorpusSchema.parse(parsed);
}

module.exports = {
    loadSentenceCorpus,
    sentenceCorpusSchema,
    sentenceEntrySchema,
};
