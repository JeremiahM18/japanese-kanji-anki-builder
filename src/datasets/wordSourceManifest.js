const fs = require("node:fs");
const { z } = require("zod");

const sourceUseSchema = z.string().min(1);
const sourceStatusSchema = z.enum(["active", "registered", "needs_review", "blocked"]);
const sourceTypeSchema = z.enum([
    "community_web_list",
    "corpus_frequency",
    "dictionary",
    "jlpt_level_list",
    "pitch_accent",
    "textbook_word_list",
]);

const sourcePurposeRuleSchema = z.object({
    description: z.string().min(1),
    allowedUse: z.array(sourceUseSchema).default([]),
    disallowedUse: z.array(sourceUseSchema).default([]),
}).strict();

const sourceOriginSchema = z.object({
    url: z.string().url().optional(),
    localPath: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
}).strict();

const sourceLicenseUseSchema = z.object({
    status: z.enum(["approved", "needs_review", "blocked"]),
    license: z.string().min(1).optional(),
    notes: z.string().min(1),
}).strict();

const sourceLocalSchema = z.object({
    path: z.string().min(1),
    format: z.enum(["auto", "csv", "json", "tsv"]).default("auto"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    byteSize: z.number().int().nonnegative().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    columns: z.array(z.string().min(1)).default([]),
}).strict();

const sourceCandidatePolicySchema = z.object({
    levels: z.array(z.number().int().min(1).max(5)).optional(),
    kanjiScope: z.enum(["any", "at-or-below", "known-jlpt", "target-level"]).default("known-jlpt"),
    requireSourceLevel: z.boolean().default(false),
}).strict();

const wordSourceSchema = z.object({
    name: z.string().min(1),
    tier: z.number().int().min(1).max(4),
    status: sourceStatusSchema,
    sourceType: sourceTypeSchema,
    origin: sourceOriginSchema,
    licenseUse: sourceLicenseUseSchema,
    checkedAt: z.string().min(1),
    levels: z.array(z.number().int().min(1).max(5)).optional(),
    local: sourceLocalSchema.optional(),
    intendedUse: z.array(sourceUseSchema).default([]),
    allowedUse: z.array(sourceUseSchema).default([]),
    disallowedUse: z.array(sourceUseSchema).default([]),
    candidatePolicy: sourceCandidatePolicySchema.optional(),
}).strict();

const wordSourceManifestSchema = z.object({
    version: z.number().int().min(1).default(1),
    checkedAt: z.string().min(1),
    sourcePurposeRules: z.record(z.string().min(1), sourcePurposeRuleSchema),
    sources: z.record(z.string().min(1), wordSourceSchema),
}).strict();

function parseWordSourceManifest(value) {
    const parsed = wordSourceManifestSchema.parse(value);

    for (const [sourceId, source] of Object.entries(parsed.sources)) {
        const purposeRule = parsed.sourcePurposeRules[source.sourceType];
        if (!purposeRule) {
            throw new Error(`Word source ${sourceId} references missing sourcePurposeRules.${source.sourceType}.`);
        }
        const disallowedByRule = new Set(purposeRule.disallowedUse || []);
        for (const use of source.allowedUse || []) {
            if (disallowedByRule.has(use)) {
                throw new Error(`Word source ${sourceId} allows ${use}, but ${source.sourceType} disallows it.`);
            }
        }
        if (source.status === "active" && source.allowedUse.includes("candidate-discovery") && !source.local?.path) {
            throw new Error(`Active candidate-discovery word source ${sourceId} must pin a local source path.`);
        }
    }

    return parsed;
}

function loadWordSourceManifest(filePath) {
    return parseWordSourceManifest(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    loadWordSourceManifest,
    parseWordSourceManifest,
    wordSourceManifestSchema,
};
