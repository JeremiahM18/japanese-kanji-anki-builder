const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const ANKI_NOTE_SCHEMA_PATH = path.join(__dirname, "ankiNoteSchema.json");

const schema = z.object({
    noteTypeName: z.string().min(1),
    cardTemplateName: z.string().min(1),
    fieldNames: z.array(z.string().min(1)).min(1),
    cssLines: z.array(z.string()).min(1),
    qfmt: z.string().min(1),
    afmtLines: z.array(z.string()).min(1),
});

let cachedSchema = null;

function loadAnkiNoteSchema() {
    if (cachedSchema) {
        return cachedSchema;
    }

    const raw = JSON.parse(fs.readFileSync(ANKI_NOTE_SCHEMA_PATH, "utf-8"));
    const parsed = schema.parse(raw);
    const uniqueFieldNames = [...new Set(parsed.fieldNames)];
    if (uniqueFieldNames.length !== parsed.fieldNames.length) {
        throw new Error("Anki note schema contains duplicate field names.");
    }

    cachedSchema = {
        ...parsed,
        fieldNames: uniqueFieldNames,
        css: parsed.cssLines.join("\n"),
        afmt: parsed.afmtLines.join(""),
    };
    return cachedSchema;
}

module.exports = {
    ANKI_NOTE_SCHEMA_PATH,
    loadAnkiNoteSchema,
};
