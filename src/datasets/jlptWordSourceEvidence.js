const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const wordSourceReviewStatusSchema = z.enum([
    "reviewed",
    "needs_review",
    "blocked",
    "source_access_gap",
    "license_blocked",
]);

const wordSourceSupportClaimSchema = z.enum([
    "dictionary-identity",
    "commonness",
]);

const jlptWordSourceAllowedUseSchema = z.enum([
    "candidate-discovery",
    "level-hint",
    "learner-fit-support",
    "dictionary-verification",
    "reading-verification",
    "meaning-verification",
    "commonness-support",
    "frequency-sanity",
    "pitch-verification",
    "background-only",
    "blocked",
    "needs_review",
]);

const jlptWordSourceKindSchema = z.enum([
    "candidate-discovery",
    "level-claim",
    "dictionary",
    "dictionary-priority",
    "commonness",
    "frequency",
    "pitch",
    "textbook-word-list",
    "background",
    "derived",
]);

const jlptWordEvidencePolicySchema = z.object({
    minimumIndependentSources: z.number().int().min(1).default(3),
    minimumIndependentEvidenceLineages: z.number().int().min(0).default(2),
    minimumJapanesePublishedOrPermissionedLearnerSources: z.number().int().min(0).default(1),
    requireDictionaryIdentitySupport: z.boolean().default(true),
    requireCommonnessSupport: z.boolean().default(true),
}).strict();

const DEFAULT_WORD_EVIDENCE_POLICY = Object.freeze({
    minimumIndependentSources: 3,
    minimumIndependentEvidenceLineages: 2,
    minimumJapanesePublishedOrPermissionedLearnerSources: 1,
    requireDictionaryIdentitySupport: true,
    requireCommonnessSupport: true,
});

const sourceTierSchema = z.object({
    label: z.string().min(1),
    rank: z.number().int().min(1),
    role: z.enum([
        "primary-discovery",
        "supporting-discovery",
        "identity-support",
        "commonness-support",
        "background-only",
    ]),
    description: z.string().min(1),
    notes: z.string().optional(),
}).strict();

const sourceLineageSchema = z.object({
    label: z.string().min(1),
    role: z.enum([
        "community-study-list",
        "legacy-jlpt-estimate",
        "post-2010-estimate",
        "japanese-published-study",
        "dictionary",
        "dictionary-priority",
        "frequency-sanity",
        "pitch-accent",
        "textbook",
        "background",
    ]),
    description: z.string().min(1),
    notes: z.string().optional(),
}).strict();

const independenceGroupSchema = z.object({
    label: z.string().min(1),
    description: z.string().min(1),
    notes: z.string().optional(),
}).strict();

const postureLabelSchema = z.object({
    releaseMeaning: z.string().min(1),
    blocksUniverseClaim: z.boolean().default(true),
}).strict();

const wordEvidenceSourceSchema = z.object({
    name: z.string().min(1),
    tier: z.string().min(1),
    evidenceLineage: z.string().min(1),
    independenceGroup: z.string().min(1),
    status: z.enum(["planned", "registered", "in_review", "active", "blocked", "deprecated"]).default("planned"),
    sourceKind: jlptWordSourceKindSchema,
    sourceType: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    levels: z.array(z.number().int().min(1).max(5)).default([]),
    japanesePublished: z.boolean().default(false),
    permissionedLearnerSource: z.boolean().default(false),
    countsForConsensus: z.boolean().default(false),
    weight: z.number().positive().default(1),
    licenseStatus: z.enum(["approved", "needs_review", "restricted", "blocked", "unknown"]).default("needs_review"),
    allowedUse: z.array(jlptWordSourceAllowedUseSchema).default([]),
    disallowedUse: z.array(jlptWordSourceAllowedUseSchema).default([]),
    canStoreWordAssignments: z.boolean().default(false),
    canStoreRawList: z.boolean().default(false),
    canStoreExcerpts: z.boolean().default(false),
    requiresCitation: z.boolean().default(true),
    positiveEvidenceOnly: z.boolean().default(false),
    licenseEvidenceUrl: z.string().min(1).optional(),
    licenseReviewedAt: z.string().min(1).optional(),
    checkedAt: z.string().min(1).optional(),
    local: z.object({
        path: z.string().min(1),
        format: z.enum(["csv", "json", "tsv"]).default("tsv"),
        sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
        byteSize: z.number().int().nonnegative().optional(),
        rowCount: z.number().int().nonnegative().optional(),
    }).strict().optional(),
    derivedFromSources: z.array(z.string().min(1)).default([]),
    legalNotes: z.string().optional(),
    notes: z.string().optional(),
}).strict();

const wordAssignmentSchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    level: z.union([
        z.number().int().min(1).max(5),
        z.string().min(1),
    ]).optional(),
    reviewStatus: wordSourceReviewStatusSchema.default("needs_review"),
    citation: z.string().min(1).optional(),
    evidenceRef: z.string().min(1).optional(),
    notes: z.string().optional(),
    evidenceRecordId: z.string().min(1).optional(),
    supportClaims: z.array(wordSourceSupportClaimSchema).default([]),
}).strict();

const assignmentEvidenceRecordSchema = z.object({
    citation: z.string().min(1).optional(),
    evidenceRef: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
}).strict().refine((record) => Object.values(record).some((value) => value !== undefined), {
    message: "Word assignment evidence records must define citation, evidenceRef, or notes.",
});

const assignmentFileSchema = z.object({
    sourceId: z.string().min(1),
    evidenceRecords: z.record(z.string().min(1), assignmentEvidenceRecordSchema).default({}),
    assignments: z.record(z.string().min(1), wordAssignmentSchema).default({}),
}).strict();

const wordEvidenceEntrySchema = z.object({
    sources: z.record(z.string().min(1), wordAssignmentSchema).default({}),
    sourceConsensusLevel: z.number().int().min(1).max(5).nullable().optional(),
    sourceAgreementCount: z.number().int().nonnegative().optional(),
    independentSourceCount: z.number().int().nonnegative().optional(),
    independentEvidenceLineageCount: z.number().int().nonnegative().optional(),
    japanesePublishedOrPermissionedLearnerSourceCount: z.number().int().nonnegative().optional(),
    dictionaryIdentitySourceIds: z.array(z.string().min(1)).default([]),
    commonnessSourceIds: z.array(z.string().min(1)).default([]),
    dictionaryIdentitySupported: z.boolean().default(false),
    commonnessSupported: z.boolean().default(false),
    posture: z.string().min(1).optional(),
    notes: z.string().optional(),
}).strict();

const jlptWordSourceEvidenceSchema = z.object({
    version: z.number().int().min(1).default(1),
    checkedAt: z.string().min(1),
    policy: jlptWordEvidencePolicySchema.default(DEFAULT_WORD_EVIDENCE_POLICY),
    sourceTiers: z.record(z.string().min(1), sourceTierSchema).default({}),
    sourceLineages: z.record(z.string().min(1), sourceLineageSchema).default({}),
    independenceGroups: z.record(z.string().min(1), independenceGroupSchema).default({}),
    postureLabels: z.record(z.string().min(1), postureLabelSchema).default({}),
    sources: z.record(z.string().min(1), wordEvidenceSourceSchema).default({}),
    assignmentFiles: z.record(z.string().min(1), z.string().min(1)).default({}),
    assignments: z.record(
        z.string().min(1),
        z.record(z.string().min(1), wordAssignmentSchema)
    ).default({}),
    words: z.record(z.string().min(1), wordEvidenceEntrySchema).default({}),
}).strict();

function normalizeText(value) {
    return String(value ?? "").trim();
}

function buildWordIdentity(written, reading) {
    const normalizedWritten = normalizeText(written);
    const normalizedReading = normalizeText(reading);
    return normalizedWritten && normalizedReading ? `${normalizedWritten}|${normalizedReading}` : "";
}

function normalizeJlptWordLevel(value) {
    if (Number.isInteger(value) && value >= 1 && value <= 5) {
        return value;
    }
    const match = normalizeText(value).match(/^(?:jlpt\s*)?n?\s*([1-5])$/i);
    return match ? Number(match[1]) : null;
}

function normalizeWordAssignment(identity, assignment = {}) {
    const written = normalizeText(assignment.written || identity.split("|")[0]);
    const reading = normalizeText(assignment.reading || identity.split("|")[1]);
    const key = buildWordIdentity(written, reading);
    if (!key) {
        throw new Error(`Invalid word source assignment identity: ${identity || "(blank)"}`);
    }
    if (key !== identity) {
        throw new Error(`Word source assignment ${identity} declares mismatched identity ${key}.`);
    }
    const parsed = wordAssignmentSchema.parse({
        ...assignment,
        written,
        reading,
    });
    if (parsed.level !== undefined) {
        const level = normalizeJlptWordLevel(parsed.level);
        if (!Number.isInteger(level)) {
            throw new Error(`Word source assignment ${identity} has invalid level: ${parsed.level}`);
        }
        return {
            ...parsed,
            level,
        };
    }
    return parsed;
}

function validateSourceUse(sourceId, source = {}) {
    const overlap = (source.allowedUse || []).filter((use) => (source.disallowedUse || []).includes(use));
    if (overlap.length > 0) {
        throw new Error(`Word source ${sourceId} both allows and disallows: ${overlap.join(", ")}.`);
    }
    if (source.status === "blocked" && (source.allowedUse || []).length > 0) {
        throw new Error(`Blocked word source ${sourceId} must not allow active use.`);
    }
    if (source.countsForConsensus && !source.canStoreWordAssignments) {
        throw new Error(`Voting word source ${sourceId} must allow stored word assignments.`);
    }
    if (source.countsForConsensus && source.licenseStatus !== "approved" && source.licenseStatus !== "restricted") {
        throw new Error(`Voting word source ${sourceId} must have approved or restricted license status.`);
    }
}

function resolveManifestRelativePath(manifestPath, relativePath) {
    return path.resolve(path.dirname(manifestPath), ...String(relativePath || "").split(/[\\/]/u));
}

function readAssignmentFile({ manifestPath, relativePath }) {
    const assignmentPath = resolveManifestRelativePath(manifestPath, relativePath);
    if (!fs.existsSync(assignmentPath)) {
        throw new Error(`Missing word source assignment file: ${assignmentPath}`);
    }
    return assignmentFileSchema.parse(JSON.parse(fs.readFileSync(assignmentPath, "utf8")));
}

function normalizeJlptWordSourceEvidence(value = {}, { manifestPath = "" } = {}) {
    const parsed = jlptWordSourceEvidenceSchema.parse(value);
    const assignments = { ...(parsed.assignments || {}) };

    if (manifestPath) {
        for (const [sourceId, relativePath] of Object.entries(parsed.assignmentFiles || {})) {
            const assignmentFile = readAssignmentFile({ manifestPath, relativePath });
            if (assignmentFile.sourceId !== sourceId) {
                throw new Error(`Word source assignment file ${relativePath} declares ${assignmentFile.sourceId}, not ${sourceId}.`);
            }
            assignments[sourceId] = {
                ...(assignments[sourceId] || {}),
                ...(assignmentFile.assignments || {}),
            };
        }
    }

    for (const [tierId, tier] of Object.entries(parsed.sourceTiers || {})) {
        if (!tier.label) {
            throw new Error(`Word source tier ${tierId} is missing label.`);
        }
    }
    for (const [sourceId, source] of Object.entries(parsed.sources || {})) {
        if (!parsed.sourceTiers[source.tier]) {
            throw new Error(`Word source ${sourceId} references missing source tier ${source.tier}.`);
        }
        if (!parsed.sourceLineages[source.evidenceLineage]) {
            throw new Error(`Word source ${sourceId} references missing source lineage ${source.evidenceLineage}.`);
        }
        if (!parsed.independenceGroups[source.independenceGroup]) {
            throw new Error(`Word source ${sourceId} references missing independence group ${source.independenceGroup}.`);
        }
        validateSourceUse(sourceId, source);
    }

    const normalizedAssignments = {};
    for (const [sourceId, sourceAssignments] of Object.entries(assignments || {})) {
        if (!parsed.sources[sourceId]) {
            throw new Error(`Word source assignments reference unknown source ${sourceId}.`);
        }
        normalizedAssignments[sourceId] = {};
        for (const [identity, assignment] of Object.entries(sourceAssignments || {})) {
            normalizedAssignments[sourceId][identity] = normalizeWordAssignment(identity, assignment);
        }
    }

    return {
        ...parsed,
        assignments: normalizedAssignments,
    };
}

function loadJlptWordSourceEvidence(filePath) {
    return normalizeJlptWordSourceEvidence(JSON.parse(fs.readFileSync(filePath, "utf8")), {
        manifestPath: filePath,
    });
}

function readJlptWordSourceEvidenceManifest(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatWordSourceEvidenceJson(value = {}) {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function formatWordSourceAssignmentFileJson({ sourceId, assignments = {} } = {}) {
    return formatWordSourceEvidenceJson({
        sourceId,
        evidenceRecords: {},
        assignments,
    });
}

module.exports = {
    DEFAULT_WORD_EVIDENCE_POLICY,
    assignmentFileSchema,
    buildWordIdentity,
    formatWordSourceAssignmentFileJson,
    formatWordSourceEvidenceJson,
    jlptWordSourceEvidenceSchema,
    loadJlptWordSourceEvidence,
    normalizeJlptWordLevel,
    normalizeJlptWordSourceEvidence,
    readJlptWordSourceEvidenceManifest,
    wordAssignmentSchema,
    wordSourceReviewStatusSchema,
    wordSourceSupportClaimSchema,
};
