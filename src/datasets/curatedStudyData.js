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
    preferredWords: z.array(z.string().min(1)).default([]),
    blockedWords: z.array(z.string().min(1)).default([]),
    notes: z.string().min(1).optional(),
    exampleSentence: curatedSentenceSchema.optional(),
});

const curatedStudyDataSchema = z.record(z.string().min(1), curatedEntrySchema);

function loadCuratedStudyData(curatedStudyDataPath) {
    if (!fs.existsSync(curatedStudyDataPath)) {
        return {};
    }

    const text = fs.readFileSync(curatedStudyDataPath, "utf-8");
    const parsed = JSON.parse(text);
    return curatedStudyDataSchema.parse(parsed);
}

module.exports = {
    curatedEntrySchema,
    curatedSentenceSchema,
    curatedStudyDataSchema,
    loadCuratedStudyData,
};
