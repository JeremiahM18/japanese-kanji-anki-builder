const fs = require("node:fs");
const { z } = require("zod");

const sourceUseSchema = z.string().min(1);
const sourceStatusSchema = z.enum(["active", "registered", "blocked"]);
const sourceUrlHostSchema = z.string().regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/iu,
    "Expected a bare URL hostname without a scheme, port, path, query, or fragment."
);
const sourceTypeSchema = z.enum([
    "generated_artifact",
    "kanji_assignment_origin",
    "kanji_reference",
    "kanji_reading_reference",
    "learner_reference",
    "lexical_dictionary",
    "official_kanji_reference",
    "source_governance",
    "word_list",
]);

const sourcePurposeRuleSchema = z.object({
    description: z.string().min(1),
    allowedUse: z.array(sourceUseSchema).default([]),
    disallowedUse: z.array(sourceUseSchema).default([]),
}).strict();

const sourceLicenseUseSchema = z.object({
    status: z.enum(["approved", "restricted", "needs_review", "blocked"]),
    license: z.string().min(1).optional(),
    notes: z.string().min(1),
}).strict();

const platinumCardSourceSchema = z.object({
    name: z.string().min(1),
    status: sourceStatusSchema,
    sourceType: sourceTypeSchema,
    matchers: z.array(z.string().min(1)).default([]),
    urlHosts: z.array(sourceUrlHostSchema).default([]),
    sourceFamily: z.string().min(1),
    independenceGroup: z.string().min(1),
    licenseUse: sourceLicenseUseSchema,
    checkedAt: z.string().min(1),
    allowedUse: z.array(sourceUseSchema).default([]),
    disallowedUse: z.array(sourceUseSchema).default([]),
    notes: z.string().min(1).optional(),
}).strict();

const platinumCardSourceManifestSchema = z.object({
    version: z.number().int().min(1).default(1),
    checkedAt: z.string().min(1),
    sourcePurposeRules: z.record(z.string().min(1), sourcePurposeRuleSchema),
    sources: z.record(z.string().min(1), platinumCardSourceSchema),
}).strict();

function listOverlap(left = [], right = []) {
    const rightSet = new Set(right || []);
    return (left || []).filter((value) => rightSet.has(value));
}

function assertNoConflictingUses({ id, label, allowedUse = [], disallowedUse = [] } = {}) {
    const conflictingUses = listOverlap(allowedUse, disallowedUse);
    if (conflictingUses.length > 0) {
        throw new Error(`${label} ${id} both allows and disallows: ${conflictingUses.join(", ")}.`);
    }
}

function parsePlatinumCardSourceManifest(value) {
    const parsed = platinumCardSourceManifestSchema.parse(value);

    for (const [ruleId, purposeRule] of Object.entries(parsed.sourcePurposeRules)) {
        assertNoConflictingUses({
            id: ruleId,
            label: "Platinum card source purpose rule",
            allowedUse: purposeRule.allowedUse,
            disallowedUse: purposeRule.disallowedUse,
        });
    }

    const matcherOwners = new Map();
    for (const [sourceId, source] of Object.entries(parsed.sources)) {
        const purposeRule = parsed.sourcePurposeRules[source.sourceType];
        if (!purposeRule) {
            throw new Error(`Platinum card source ${sourceId} references missing sourcePurposeRules.${source.sourceType}.`);
        }

        assertNoConflictingUses({
            id: sourceId,
            label: "Platinum card source",
            allowedUse: source.allowedUse,
            disallowedUse: source.disallowedUse,
        });

        const allowedByRule = new Set(purposeRule.allowedUse || []);
        const disallowedByRule = new Set(purposeRule.disallowedUse || []);
        for (const use of source.allowedUse || []) {
            if (!allowedByRule.has(use)) {
                throw new Error(`Platinum card source ${sourceId} allows ${use}, but ${source.sourceType} does not allow it.`);
            }
            if (disallowedByRule.has(use)) {
                throw new Error(`Platinum card source ${sourceId} allows ${use}, but ${source.sourceType} disallows it.`);
            }
        }

        if (source.status === "blocked" && source.allowedUse.length > 0) {
            throw new Error(`Blocked platinum card source ${sourceId} must not allow active use.`);
        }
        if (source.status === "active" && source.licenseUse.status === "blocked") {
            throw new Error(`Active platinum card source ${sourceId} cannot have blocked license/use status.`);
        }
        if (source.status === "active" && source.matchers.length === 0) {
            throw new Error(`Active platinum card source ${sourceId} must declare at least one matcher.`);
        }

        for (const matcher of source.matchers || []) {
            const normalizedMatcher = matcher.trim().toLowerCase();
            const owner = matcherOwners.get(normalizedMatcher);
            if (owner && owner !== sourceId) {
                throw new Error(`Platinum card source matcher "${matcher}" is shared by ${owner} and ${sourceId}.`);
            }
            matcherOwners.set(normalizedMatcher, sourceId);
        }
    }

    return parsed;
}

function loadPlatinumCardSourceManifest(filePath) {
    return parsePlatinumCardSourceManifest(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    loadPlatinumCardSourceManifest,
    parsePlatinumCardSourceManifest,
    platinumCardSourceManifestSchema,
};
