const fs = require("node:fs");
const { z } = require("zod");

const jlptLevelAssignmentValueSchema = z.union([
    z.number().int().min(1).max(5),
    z.string().min(1),
    z.object({
        level: z.union([
            z.number().int().min(1).max(5),
            z.string().min(1),
        ]).optional(),
        levelRange: z.array(z.union([
            z.number().int().min(1).max(5),
            z.string().min(1),
        ])).min(2).optional(),
        reviewStatus: z.enum(["reviewed", "needs_review", "blocked"]).default("reviewed"),
        citation: z.string().min(1).optional(),
        evidenceRef: z.string().min(1).optional(),
        notes: z.string().min(1).optional(),
    }).strict(),
]);

const evidencePolicySchema = z.object({
    minimumIndependentSources: z.number().int().min(1).default(3),
    minimumIndependentEvidenceLineages: z.number().int().min(0).default(1),
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

const sourceLineageSchema = z.object({
    label: z.string().min(1),
    role: z.enum([
        "operational-baseline",
        "direct-legacy-jlpt",
        "post-2010-estimate",
        "japanese-published-study",
        "dictionary-legacy-jlpt",
        "community-study-list",
        "frequency-sanity",
        "learning-platform",
        "official-background",
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

const confidenceReasonLabelSchema = z.object({
    label: z.string().min(1),
    description: z.string().min(1),
}).strict();

const confidenceIdSchema = z.enum([
    "high_confidence",
    "standard_confidence",
    "disputed",
    "weak_evidence",
    "unknown",
]);
const REQUIRED_CONFIDENCE_IDS = Object.freeze([
    "high_confidence",
    "standard_confidence",
    "disputed",
    "weak_evidence",
    "unknown",
]);
const REQUIRED_CONFIDENCE_REASON_IDS = Object.freeze([
    "direct_legacy_mapping",
    "estimated_split_evidence",
    "textbook_agreement",
    "range_evidence_present",
    "range_evidence_only",
    "disputed_source_votes",
    "weak_independence_or_missing_japanese_source",
    "unknown_no_reviewed_external_evidence",
    "current_contract_mismatch",
    "source_confidence_threshold_met",
]);

const evidenceSourceSchema = z.object({
    name: z.string().min(1),
    tier: z.string().min(1),
    evidenceLineage: z.string().min(1).optional(),
    lineage: z.string().min(1).optional(),
    status: z.enum(["planned", "active", "blocked", "deprecated"]).default("planned"),
    sourceType: z.string().min(1),
    url: z.string().min(1).optional(),
    independent: z.boolean().default(true),
    publisherIndependence: z.string().min(1).optional(),
    independenceGroup: z.string().min(1).optional(),
    japanesePublished: z.boolean().default(false),
    countsForConsensus: z.boolean().default(true),
    weight: z.number().positive().default(1),
    licenseStatus: z.enum(["approved", "needs_review", "restricted", "unknown"]).default("needs_review"),
    derivedFromSources: z.array(z.string().min(1)).default([]),
    notes: z.string().optional(),
}).strict();

const kanjiEvidenceEntrySchema = z.object({
    sources: z.record(z.string().min(1), jlptLevelAssignmentValueSchema).default({}),
    consensusLevel: jlptLevelAssignmentValueSchema.optional(),
    agreementScore: z.number().min(0).max(1).optional(),
    confidence: confidenceIdSchema.optional(),
    notes: z.string().optional(),
}).strict();

const jlptKanjiSourceEvidenceSchema = z.object({
    version: z.number().int().min(1).default(1),
    policy: evidencePolicySchema.default({}),
    sourceTiers: z.record(z.string().min(1), sourceTierSchema).default({}),
    sourceLineages: z.record(z.string().min(1), sourceLineageSchema).default({}),
    confidenceLabels: z.record(z.string().min(1), confidenceLabelSchema).default({}),
    confidenceReasonLabels: z.record(z.string().min(1), confidenceReasonLabelSchema).default({}),
    sources: z.record(z.string().min(1), evidenceSourceSchema).default({}),
    assignments: z.record(
        z.string().min(1),
        z.record(z.string().min(1), jlptLevelAssignmentValueSchema)
    ).default({}),
    kanji: z.record(z.string().min(1), kanjiEvidenceEntrySchema).default({}),
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

function normalizeJlptLevelRangeAssignment(value) {
    if (!Array.isArray(value)) {
        const text = String(value || "").trim();
        if (!text) {
            return null;
        }
        const levels = [...text.matchAll(/(?:jlpt\s*)?n?\s*([1-5])/gi)]
            .map((match) => Number(match[1]));
        return normalizeJlptLevelRangeAssignment(levels);
    }

    const levels = [...new Set(
        value
            .map((level) => normalizeJlptLevelAssignment(level))
            .filter((level) => Number.isInteger(level))
    )].sort((a, b) => a - b);

    return levels.length >= 2 ? levels : null;
}

function normalizeJlptLevelAssignmentEntry(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const level = normalizeJlptLevelAssignment(value.level);
        const levelRange = normalizeJlptLevelRangeAssignment(value.levelRange);
        if (!Number.isInteger(level) && !Array.isArray(levelRange)) {
            return null;
        }
        const normalized = {
            reviewStatus: value.reviewStatus || "reviewed",
            citation: value.citation,
            evidenceRef: value.evidenceRef,
            notes: value.notes,
        };
        if (Number.isInteger(level)) {
            normalized.level = level;
        }
        if (Array.isArray(levelRange)) {
            normalized.levelRange = levelRange;
        }
        return normalized;
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

function assertKnownSourceLineages(parsed) {
    const knownLineageIds = new Set(Object.keys(parsed.sourceLineages || {}));
    if (knownLineageIds.size === 0) {
        return;
    }

    const unknownLineages = Object.entries(parsed.sources || {})
        .filter(([, source]) => {
            const lineage = source.evidenceLineage || source.lineage;
            return lineage && !knownLineageIds.has(lineage);
        })
        .map(([sourceId, source]) => `${sourceId}:${source.evidenceLineage || source.lineage}`);

    if (unknownLineages.length > 0) {
        throw new Error(`Unknown JLPT kanji source lineages: ${unknownLineages.join(", ")}`);
    }
}

function assertRequiredConfidenceLabels(parsed) {
    const missing = REQUIRED_CONFIDENCE_IDS.filter((labelId) => !parsed.confidenceLabels?.[labelId]);
    if (missing.length > 0) {
        throw new Error(`Missing JLPT kanji confidence labels: ${missing.join(", ")}`);
    }
}

function assertRequiredConfidenceReasonLabels(parsed) {
    const missing = REQUIRED_CONFIDENCE_REASON_IDS
        .filter((labelId) => !parsed.confidenceReasonLabels?.[labelId]);
    if (missing.length > 0) {
        throw new Error(`Missing JLPT kanji confidence reason labels: ${missing.join(", ")}`);
    }
}

function normalizeKanjiEvidence(kanjiEvidence = {}) {
    return Object.fromEntries(
        Object.entries(kanjiEvidence || {}).map(([kanji, entry]) => {
            const sources = Object.fromEntries(
                Object.entries(entry.sources || {})
                    .map(([sourceId, value]) => [sourceId, normalizeJlptLevelAssignmentEntry(value)])
                    .filter(([, normalized]) => normalized !== null)
            );
            return [kanji, {
                ...entry,
                consensusLevel: entry.consensusLevel === undefined
                    ? undefined
                    : normalizeJlptLevelAssignment(entry.consensusLevel),
                sources,
            }];
        })
    );
}

function buildAssignmentsFromKanjiEvidence(kanjiEvidence = {}) {
    const assignments = {};

    for (const [kanji, entry] of Object.entries(kanjiEvidence || {})) {
        for (const [sourceId, assignment] of Object.entries(entry.sources || {})) {
            assignments[sourceId] = assignments[sourceId] || {};
            assignments[sourceId][kanji] = assignment;
        }
    }

    return assignments;
}

function hasConflictingAssignmentLevel(existing = {}, next = {}) {
    const existingLevel = Number.isInteger(existing.level) ? existing.level : null;
    const nextLevel = Number.isInteger(next.level) ? next.level : null;
    const existingRange = Array.isArray(existing.levelRange) ? existing.levelRange.join("/") : "";
    const nextRange = Array.isArray(next.levelRange) ? next.levelRange.join("/") : "";
    return existingLevel !== nextLevel || existingRange !== nextRange;
}

function mergeAssignments(primary = {}, secondary = {}) {
    const merged = Object.fromEntries(
        Object.entries(primary || {}).map(([sourceId, sourceAssignments]) => [
            sourceId,
            { ...sourceAssignments },
        ])
    );

    for (const [sourceId, sourceAssignments] of Object.entries(secondary || {})) {
        merged[sourceId] = merged[sourceId] || {};
        for (const [kanji, assignment] of Object.entries(sourceAssignments || {})) {
            const existing = merged[sourceId][kanji];
            if (existing && hasConflictingAssignmentLevel(existing, assignment)) {
                throw new Error(`Conflicting JLPT kanji source assignments for ${kanji} from ${sourceId}`);
            }
            merged[sourceId][kanji] = existing
                ? { ...assignment, ...existing }
                : assignment;
        }
    }

    return merged;
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
    assertKnownSourceLineages(parsed);
    assertRequiredConfidenceLabels(parsed);
    assertRequiredConfidenceReasonLabels(parsed);
    const kanji = normalizeKanjiEvidence(parsed.kanji);
    const sourceCentricAssignments = normalizeAssignments(parsed.assignments);
    const kanjiAssignments = buildAssignmentsFromKanjiEvidence(kanji);
    return {
        ...parsed,
        kanji,
        assignments: mergeAssignments(sourceCentricAssignments, kanjiAssignments),
    };
}

function loadJlptKanjiSourceEvidence(filePath) {
    return normalizeJlptKanjiSourceEvidence(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    REQUIRED_CONFIDENCE_IDS,
    REQUIRED_CONFIDENCE_REASON_IDS,
    evidencePolicySchema,
    confidenceLabelSchema,
    confidenceReasonLabelSchema,
    confidenceIdSchema,
    evidenceSourceSchema,
    kanjiEvidenceEntrySchema,
    sourceLineageSchema,
    sourceTierSchema,
    jlptKanjiSourceEvidenceSchema,
    loadJlptKanjiSourceEvidence,
    normalizeJlptKanjiSourceEvidence,
    normalizeJlptLevelRangeAssignment,
    normalizeJlptLevelAssignmentEntry,
    normalizeJlptLevelAssignment,
};
