const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const NOTE_SCHEMA_PATHS = {
    kanji: path.join(__dirname, "ankiNoteSchema.json"),
    word: path.join(__dirname, "ankiWordNoteSchema.json"),
};

const schema = z.object({
    noteTypeName: z.string().min(1),
    cardTemplateName: z.string().min(1),
    fieldNames: z.array(z.string().min(1)).min(1),
    cssLines: z.array(z.string()).min(1),
    qfmt: z.string().min(1),
    afmtLines: z.array(z.string()).min(1),
});

const cachedSchemas = new Map();

function resolveSchemaPath(kind = "kanji") {
    const normalizedKind = String(kind ?? "kanji").trim().toLowerCase();
    const schemaPath = NOTE_SCHEMA_PATHS[normalizedKind];

    if (!schemaPath) {
        throw new Error(`Unsupported Anki note schema kind: ${kind}`);
    }

    return {
        kind: normalizedKind,
        schemaPath,
    };
}

function loadAnkiNoteSchema(kind = "kanji") {
    const resolved = resolveSchemaPath(kind);
    if (cachedSchemas.has(resolved.kind)) {
        return cachedSchemas.get(resolved.kind);
    }

    const raw = JSON.parse(fs.readFileSync(resolved.schemaPath, "utf-8"));
    const parsed = schema.parse(raw);
    const uniqueFieldNames = [...new Set(parsed.fieldNames)];
    if (uniqueFieldNames.length !== parsed.fieldNames.length) {
        throw new Error("Anki note schema contains duplicate field names.");
    }

    const hydrated = {
        ...parsed,
        kind: resolved.kind,
        schemaPath: resolved.schemaPath,
        fieldNames: uniqueFieldNames,
        css: parsed.cssLines.join("\n"),
        afmt: parsed.afmtLines.join(""),
    };
    cachedSchemas.set(resolved.kind, hydrated);
    return hydrated;
}

module.exports = {
    ANKI_NOTE_SCHEMA_PATH: NOTE_SCHEMA_PATHS.kanji,
    NOTE_SCHEMA_PATHS,
    loadAnkiNoteSchema,
};
