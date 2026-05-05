const fs = require("node:fs");
const { z } = require("zod");

const sourceInputConfigSchema = z.object({
    sourceId: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceLabel: z.string().min(1),
    sourceUrl: z.string().min(1).optional(),
    format: z.enum(["tsv", "csv", "json"]).default("tsv"),
    kanjiColumn: z.string().min(1).default("kanji"),
    levelColumn: z.string().min(1).default("level"),
    reviewStatusColumn: z.string().min(1).optional(),
    citationColumn: z.string().min(1).optional(),
    evidenceRefColumn: z.string().min(1).optional(),
    notesColumn: z.string().min(1).optional(),
    defaultReviewStatus: z.enum(["reviewed", "needs_review", "blocked"]).default("needs_review"),
    defaultCitation: z.string().min(1).optional(),
    defaultEvidenceRef: z.string().min(1).optional(),
    defaultNotes: z.string().min(1).optional(),
    requireCitation: z.boolean().default(true),
    requireEvidenceRef: z.boolean().default(true),
    levelMapping: z.enum(["new-jlpt-n1-n5", "kanjidic2-legacy-jlpt"]).default("new-jlpt-n1-n5"),
    checkedAt: z.string().min(1).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    byteSize: z.number().int().nonnegative().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    integrityPolicy: z.string().min(1).optional(),
}).strict();

const sourceInputManifestSchema = z.object({
    version: z.number().int().min(1).default(1),
    policy: z.object({
        noDeckMutation: z.boolean().default(true),
        requirePinnedIntegrity: z.boolean().default(true),
        requireKnownEvidenceSource: z.boolean().default(true),
        notes: z.string().optional(),
    }).strict().default({}),
    inputs: z.record(z.string().min(1), sourceInputConfigSchema).default({}),
}).strict();

function normalizeJlptKanjiSourceInputs(value = {}) {
    const parsed = sourceInputManifestSchema.parse(value);
    const inputs = Object.fromEntries(
        Object.entries(parsed.inputs || {}).map(([inputId, input]) => {
            if (input.sourceId !== inputId) {
                throw new Error(`JLPT kanji source input id mismatch: ${inputId} declares ${input.sourceId}`);
            }
            return [inputId, input];
        })
    );

    return {
        ...parsed,
        inputs,
    };
}

function loadJlptKanjiSourceInputs(filePath) {
    return normalizeJlptKanjiSourceInputs(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    loadJlptKanjiSourceInputs,
    normalizeJlptKanjiSourceInputs,
    sourceInputConfigSchema,
    sourceInputManifestSchema,
};
