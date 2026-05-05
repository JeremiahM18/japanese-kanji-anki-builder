const fs = require("node:fs");
const { z } = require("zod");

const jlptLevelAssignmentValueSchema = z.union([
    z.number().int().min(1).max(5),
    z.string().min(1),
    z.object({
        level: z.union([
            z.number().int().min(1).max(5),
            z.string().min(1),
        ]),
        reviewStatus: z.enum(["reviewed", "needs_review", "blocked"]).default("reviewed"),
        citation: z.string().min(1).optional(),
        evidenceRef: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
    }).strict(),
]);

const evidencePolicySchema = z.object({
    minimumIndependentSources: z.number().int().min(1).default(3),
    minimumJapanesePublishedSources: z.number().int().min(0).default(1),
    standardAgreementScore: z.number().min(0).max(1).default(0.67),
    highAgreementScore: z.number().min(0).max(1).default(0.8),
}).strict();

const sourceTierSchema = z.object({
    label: z.string().min(1),
    rank: z.number().int().min(1),
    role: z.enum([
        "primary-evidence",
        "supporting-evidence",
        "sanity-check",
        "background-only",
    ]),
    description: z.string().min(1),
    notes: z.string().optional(),
}).strict();

const confidenceLabelSchema = z.object({
    label: z.string().min(1),
    releaseMeaning: z.string().min(1),
    blocksRelease: z.boolean().default(true),
    requirements: z.array(z.string().min(1)).default([]),
}).strict();

const evidenceSourceSchema = z.object({
    name: z.string().min(1),
    tier: z.string().min(1),
    status: z.enum(["planned", "active", "blocked", "deprecated"]).default("planned"),
    sourceType: z.string().min(1),
    url: z.string().min(1).optional(),
    independent: z.boolean().default(true),
    independenceGroup: z.string().min(1).optional(),
    japanesePublished: z.boolean().default(false),
    countsForConsensus: z.boolean().default(true),
    weight: z.number().positive().default(1),
    licenseStatus: z.enum(["approved", "needs_review", "restricted", "unknown"]).default("needs_review"),
    notes: z.string().optional(),
}).strict();

const jlptKanjiSourceEvidenceSchema = z.object({
    version: z.number().int().min(1).default(1),
    policy: evidencePolicySchema.default({}),
    sourceTiers: z.record(z.string().min(1), sourceTierSchema).default({}),
    confidenceLabels: z.record(z.string().min(1), confidenceLabelSchema).default({}),
    sources: z.record(z.string().min(1), evidenceSourceSchema).default({}),
    assignments: z.record(
        z.string().min(1),
        z.record(z.string().min(1), jlptLevelAssignmentValueSchema)
    ).default({}),
}).strict();

function normalizeJlptLevelAssignment(value) {
    if (Number.isInteger(value) && value >= 1 && value <= 5) {
        return value;
    }

    const text = String(value || "").trim();
    const match = text.match(/^(?:jlpt\s*)?n?\s*([1-5])$/i);
    if (!match) {
        return null;
    }

    return Number(match[1]);
}

function normalizeJlptLevelAssignmentEntry(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const level = normalizeJlptLevelAssignment(value.level);
        if (!Number.isInteger(level)) {
            return null;
        }
        return {
            level,
            reviewStatus: value.reviewStatus || "reviewed",
            citation: value.citation,
            evidenceRef: value.evidenceRef,
            notes: value.notes,
        };
    }

    const level = normalizeJlptLevelAssignment(value);
    if (!Number.isInteger(level)) {
        return null;
    }
    return {
        level,
        reviewStatus: "reviewed",
    };
}

function assertKnownSourceTiers(parsed) {
    const knownTierIds = new Set(Object.keys(parsed.sourceTiers || {}));
    if (knownTierIds.size === 0) {
        return;
    }

    const unknownTiers = Object.entries(parsed.sources || {})
        .filter(([, source]) => !knownTierIds.has(source.tier))
        .map(([sourceId, source]) => `${sourceId}:${source.tier}`);

    if (unknownTiers.length > 0) {
        throw new Error(`Unknown JLPT kanji source tiers: ${unknownTiers.join(", ")}`);
    }
}

function normalizeAssignments(assignments = {}) {
    return Object.fromEntries(
        Object.entries(assignments || {}).map(([sourceId, sourceAssignments]) => [
            sourceId,
            Object.fromEntries(
                Object.entries(sourceAssignments || {})
                    .map(([kanji, value]) => [kanji, normalizeJlptLevelAssignmentEntry(value)])
                    .filter(([, entry]) => entry !== null)
            ),
        ])
    );
}

function normalizeJlptKanjiSourceEvidence(value = {}) {
    const parsed = jlptKanjiSourceEvidenceSchema.parse(value);
    assertKnownSourceTiers(parsed);
    return {
        ...parsed,
        assignments: normalizeAssignments(parsed.assignments),
    };
}

function loadJlptKanjiSourceEvidence(filePath) {
    return normalizeJlptKanjiSourceEvidence(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    evidencePolicySchema,
    confidenceLabelSchema,
    evidenceSourceSchema,
    sourceTierSchema,
    jlptKanjiSourceEvidenceSchema,
    loadJlptKanjiSourceEvidence,
    normalizeJlptKanjiSourceEvidence,
    normalizeJlptLevelAssignmentEntry,
    normalizeJlptLevelAssignment,
};
