const fs = require("node:fs");
const { z } = require("zod");

const jlptOnlyEntrySchema = z.object({
    jlpt: z.number().int().min(1).max(5),
}).passthrough();

const jlptOnlyJsonSchema = z.record(z.string().min(1), jlptOnlyEntrySchema);

function parseJlptOnlyJson(value) {
    return jlptOnlyJsonSchema.parse(value);
}

function loadJlptOnlyJson(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    return parseJlptOnlyJson(JSON.parse(text));
}

module.exports = {
    jlptOnlyEntrySchema,
    jlptOnlyJsonSchema,
    loadJlptOnlyJson,
    parseJlptOnlyJson,
};
