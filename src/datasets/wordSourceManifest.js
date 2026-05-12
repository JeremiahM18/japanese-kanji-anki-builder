const fs = require("node:fs");
const { z } = require("zod");

const sourceUseSchema = z.string().min(1);
const sourceStatusSchema = z.enum(["active", "registered", "needs_review", "blocked"]);
const sourceTypeSchema = z.enum([
    "community_web_list",
    "corpus_frequency",
    "dictionary",
    "dictionary_priority",
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

const localIntegrityUses = new Set([
    "candidate-discovery",
    "dictionary-verification",
    "frequency-sanity",
    "learner-fit-support",
    "level-hint",
    "reading-verification",
    "meaning-verification",
    "usefulness-support",
]);

function listOverlap(left = [], right = []) {
    const rightSet = new Set(right || []);
    return (left || []).filter((value) => rightSet.has(value));
}

function sourceNeedsLocalIntegrity(source = {}) {
    return source.status === "active"
        && (source.allowedUse || []).some((use) => localIntegrityUses.has(use));
}

function requireLocalColumns(sourceId, source, requiredColumns = []) {
    const columns = new Set(source.local?.columns || []);
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    if (missingColumns.length > 0) {
        throw new Error(`Word source ${sourceId} is missing required local column(s): ${missingColumns.join(", ")}.`);
    }
}

function assertSourceUseColumns(sourceId, source) {
    if (!sourceNeedsLocalIntegrity(source)) {
        return;
    }

    const allowedUse = new Set(source.allowedUse || []);
    const requiredColumns = new Set();
    if (allowedUse.has("candidate-discovery")) {
        requiredColumns.add("written");
        requiredColumns.add("reading");
        if (source.candidatePolicy?.requireSourceLevel) {
            requiredColumns.add("jlpt");
        }
    }
    if (allowedUse.has("dictionary-verification") || allowedUse.has("reading-verification")) {
        requiredColumns.add("written");
        requiredColumns.add("reading");
    }
    if (allowedUse.has("meaning-verification")) {
        requiredColumns.add("meaning");
    }
    if (allowedUse.has("frequency-sanity") || allowedUse.has("usefulness-support")) {
        requiredColumns.add("written");
        requiredColumns.add("reading");
        requiredColumns.add("frequencyRank");
    }
    requireLocalColumns(sourceId, source, [...requiredColumns]);
}

function parseWordSourceManifest(value) {
    const parsed = wordSourceManifestSchema.parse(value);

    for (const [ruleId, purposeRule] of Object.entries(parsed.sourcePurposeRules)) {
        const conflictingRuleUses = listOverlap(purposeRule.allowedUse, purposeRule.disallowedUse);
        if (conflictingRuleUses.length > 0) {
            throw new Error(`Word source purpose rule ${ruleId} both allows and disallows: ${conflictingRuleUses.join(", ")}.`);
        }
    }

    for (const [sourceId, source] of Object.entries(parsed.sources)) {
        const purposeRule = parsed.sourcePurposeRules[source.sourceType];
        if (!purposeRule) {
            throw new Error(`Word source ${sourceId} references missing sourcePurposeRules.${source.sourceType}.`);
        }
        const conflictingSourceUses = listOverlap(source.allowedUse, source.disallowedUse);
        if (conflictingSourceUses.length > 0) {
            throw new Error(`Word source ${sourceId} both allows and disallows: ${conflictingSourceUses.join(", ")}.`);
        }
        const allowedByRule = new Set(purposeRule.allowedUse || []);
        const disallowedByRule = new Set(purposeRule.disallowedUse || []);
        for (const use of source.allowedUse || []) {
            if (!allowedByRule.has(use)) {
                throw new Error(`Word source ${sourceId} allows ${use}, but ${source.sourceType} does not allow it.`);
            }
            if (disallowedByRule.has(use)) {
                throw new Error(`Word source ${sourceId} allows ${use}, but ${source.sourceType} disallows it.`);
            }
        }
        if (source.status === "blocked" && source.allowedUse.length > 0) {
            throw new Error(`Blocked word source ${sourceId} must not allow active use.`);
        }
        if (source.status === "active" && source.licenseUse.status === "blocked") {
            throw new Error(`Active word source ${sourceId} cannot have blocked license/use status.`);
        }
        if (source.status === "active" && source.allowedUse.includes("candidate-discovery") && !source.local?.path) {
            throw new Error(`Active candidate-discovery word source ${sourceId} must pin a local source path.`);
        }
        if (source.status === "active" && source.allowedUse.includes("candidate-discovery")) {
            if (!source.candidatePolicy) {
                throw new Error(`Active candidate-discovery word source ${sourceId} must declare candidatePolicy.`);
            }
            if (!Array.isArray(source.candidatePolicy.levels) || source.candidatePolicy.levels.length === 0) {
                throw new Error(`Active candidate-discovery word source ${sourceId} must declare candidatePolicy.levels.`);
            }
        }
        if (sourceNeedsLocalIntegrity(source)) {
            const missingPins = [];
            if (!source.local) {
                missingPins.push("path", "sha256", "byteSize", "rowCount", "columns");
            } else {
                if (!source.local.path) {
                    missingPins.push("path");
                }
                if (!source.local.sha256) {
                    missingPins.push("sha256");
                }
                if (!Number.isInteger(source.local.byteSize)) {
                    missingPins.push("byteSize");
                }
                if (!Number.isInteger(source.local.rowCount)) {
                    missingPins.push("rowCount");
                }
                if (!Array.isArray(source.local.columns) || source.local.columns.length === 0) {
                    missingPins.push("columns");
                }
            }
            if (missingPins.length > 0) {
                throw new Error(`Active local-evidence word source ${sourceId} is missing local integrity pin(s): ${missingPins.join(", ")}.`);
            }
        }
        assertSourceUseColumns(sourceId, source);
    }

    return parsed;
}

function loadWordSourceManifest(filePath) {
    return parseWordSourceManifest(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    loadWordSourceManifest,
    parseWordSourceManifest,
    sourceNeedsLocalIntegrity,
    wordSourceManifestSchema,
};
