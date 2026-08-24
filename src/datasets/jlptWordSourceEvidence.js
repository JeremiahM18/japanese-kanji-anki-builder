const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");
const {
    openVerifiedRegularFileSync,
    resolveGovernedDirectChildPath,
} = require("../utils/fs");

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

const wordSupportEvidenceKindSchema = z.enum([
    "exact-dictionary-entry",
    "dictionary-priority",
    "corpus-frequency",
]);

const isoDateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine((value) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp)
        && new Date(timestamp).toISOString().slice(0, 10) === value;
}, "Expected a valid YYYY-MM-DD calendar date");

const upstreamSnapshotSchema = z.object({
    url: z.string().url(),
    version: z.string().min(1),
    retrievedAt: isoDateStringSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/iu),
    byteSize: z.number().int().nonnegative(),
}).strict();

const sourceFreshnessSchema = z.object({
    checkedAt: isoDateStringSchema,
    maximumAgeDays: z.number().int().positive(),
    updateProcedure: z.string().min(1),
}).strict();

const wordSupportEvidenceSchema = z.discriminatedUnion("kind", [
    z.object({
        kind: z.literal("exact-dictionary-entry"),
        snapshotVersion: z.string().min(1),
        normalizedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
        entryIds: z.array(z.string().min(1)).min(1),
    }).strict(),
    z.object({
        kind: z.literal("dictionary-priority"),
        snapshotVersion: z.string().min(1),
        normalizedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
        entryIds: z.array(z.string().min(1)).min(1).optional(),
        priorityTags: z.array(z.string().min(1)).min(1),
        frequencyRank: z.number().int().positive(),
    }).strict(),
    z.object({
        kind: z.literal("corpus-frequency"),
        snapshotVersion: z.string().min(1),
        normalizedSourceSha256: z.string().regex(/^[a-f0-9]{64}$/iu),
        frequencyRank: z.number().int().positive(),
        occurrenceCount: z.number().int().positive(),
        documentCount: z.number().int().positive(),
        channelCount: z.number().int().positive(),
        matchStatus: z.literal("exact_written"),
        frequencyBand: z.enum(["strong", "good", "borderline"]),
    }).strict(),
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
    canStoreSupportFacts: z.boolean().default(false),
    canStoreRawList: z.boolean().default(false),
    canStoreExcerpts: z.boolean().default(false),
    requiresCitation: z.boolean().default(true),
    positiveEvidenceOnly: z.boolean().default(false),
    supportEvidenceKinds: z.array(wordSupportEvidenceKindSchema).default([]),
    upstreamSnapshot: upstreamSnapshotSchema.optional(),
    freshness: sourceFreshnessSchema.optional(),
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

const wordSupportRecordSchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    reviewStatus: z.literal("reviewed"),
    citation: z.string().min(1),
    evidenceRef: z.string().min(1),
    supportClaims: z.array(wordSourceSupportClaimSchema).length(1),
    evidence: wordSupportEvidenceSchema,
    notes: z.string().optional(),
}).strict().superRefine((record, context) => {
    const expectedClaim = record.evidence.kind === "exact-dictionary-entry"
        ? "dictionary-identity"
        : "commonness";
    if (record.supportClaims[0] !== expectedClaim) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["supportClaims"],
            message: `${record.evidence.kind} evidence requires ${expectedClaim}`,
        });
    }
});

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

const supportFileSchema = z.object({
    sourceId: z.string().min(1),
    supportRecords: z.record(z.string().min(1), wordSupportRecordSchema).default({}),
}).strict();

const wordEvidenceEntrySchema = z.object({
    sources: z.record(z.string().min(1), wordAssignmentSchema).default({}),
    supportSources: z.record(z.string().min(1), wordSupportRecordSchema).default({}),
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

function sourceFileMapSchema(directoryName) {
    return z.record(z.string().min(1), z.string().min(1)).superRefine((files, context) => {
        for (const [sourceId, relativePath] of Object.entries(files || {})) {
            const expectedPath = `jlpt_word_source_evidence/${directoryName}/${sourceId}.json`;
            if (relativePath !== expectedPath) {
                context.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [sourceId],
                    message: `must use canonical data path ${expectedPath}`,
                });
            }
        }
    });
}

const jlptWordSourceEvidenceSchema = z.object({
    version: z.number().int().min(1).default(1),
    checkedAt: z.string().min(1),
    policy: jlptWordEvidencePolicySchema.default(DEFAULT_WORD_EVIDENCE_POLICY),
    sourceTiers: z.record(z.string().min(1), sourceTierSchema).default({}),
    sourceLineages: z.record(z.string().min(1), sourceLineageSchema).default({}),
    independenceGroups: z.record(z.string().min(1), independenceGroupSchema).default({}),
    postureLabels: z.record(z.string().min(1), postureLabelSchema).default({}),
    sources: z.record(z.string().min(1), wordEvidenceSourceSchema).default({}),
    assignmentFiles: sourceFileMapSchema("assignments").default({}),
    supportFiles: sourceFileMapSchema("support").default({}),
    assignments: z.record(
        z.string().min(1),
        z.record(z.string().min(1), wordAssignmentSchema)
    ).default({}),
    supportRecords: z.record(
        z.string().min(1),
        z.record(z.string().min(1), wordSupportRecordSchema)
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

function normalizeWordSupportRecord(identity, record = {}) {
    const written = normalizeText(record.written || identity.split("|")[0]);
    const reading = normalizeText(record.reading || identity.split("|")[1]);
    const key = buildWordIdentity(written, reading);
    if (!key) {
        throw new Error(`Invalid word support-record identity: ${identity || "(blank)"}`);
    }
    if (key !== identity) {
        throw new Error(`Word support record ${identity} declares mismatched identity ${key}.`);
    }
    return wordSupportRecordSchema.parse({
        ...record,
        written,
        reading,
    });
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
    if (source.canStoreSupportFacts) {
        if (source.countsForConsensus || source.canStoreWordAssignments) {
            throw new Error(`Support-fact source ${sourceId} must not also hold JLPT placement authority.`);
        }
        const missingFields = [
            (source.supportEvidenceKinds || []).length === 0 ? "supportEvidenceKinds" : null,
            !source.upstreamSnapshot ? "upstreamSnapshot" : null,
            !source.local?.sha256 ? "local.sha256" : null,
            !Number.isInteger(source.local?.byteSize) ? "local.byteSize" : null,
            !Number.isInteger(source.local?.rowCount) ? "local.rowCount" : null,
            source.positiveEvidenceOnly !== true ? "positiveEvidenceOnly" : null,
        ].filter(Boolean);
        if (missingFields.length > 0) {
            throw new Error(`Support-fact word source ${sourceId} is missing required field(s): ${missingFields.join(", ")}.`);
        }
        const freshnessRequired = (source.supportEvidenceKinds || []).some((kind) => (
            kind === "exact-dictionary-entry" || kind === "dictionary-priority"
        ));
        if (freshnessRequired && !source.freshness) {
            throw new Error(`Support-fact word source ${sourceId} must declare freshness for dictionary evidence.`);
        }
    }
}

function resolveGovernedWordSourceDataPath({ manifestPath, relativePath, evidenceMode, sourceId } = {}) {
    const directoryName = evidenceMode === "support"
        ? "support"
        : evidenceMode === "placement"
            ? "assignments"
            : null;
    if (!directoryName) {
        throw new Error(`Unknown JLPT word source evidence mode: ${evidenceMode || "(blank)"}.`);
    }
    const manifestDirectory = path.dirname(path.resolve(manifestPath));
    return resolveGovernedDirectChildPath({
        baseDirectory: manifestDirectory,
        governedDirectory: path.join(manifestDirectory, "jlpt_word_source_evidence", directoryName),
        declaredPath: relativePath,
        extension: ".json",
        expectedBaseName: `${sourceId}.json`,
        label: `JLPT word ${evidenceMode} evidence data path`,
    });
}

function readVerifiedJsonFile(filePath, label) {
    const fileHandle = openVerifiedRegularFileSync(filePath, { label });
    try {
        return JSON.parse(fs.readFileSync(fileHandle, "utf8"));
    } finally {
        fs.closeSync(fileHandle);
    }
}

function readAssignmentFile({ manifestPath, relativePath, sourceId }) {
    const assignmentPath = resolveGovernedWordSourceDataPath({
        manifestPath,
        relativePath,
        evidenceMode: "placement",
        sourceId,
    });
    if (!fs.existsSync(assignmentPath)) {
        throw new Error(`Missing word source assignment file: ${assignmentPath}`);
    }
    return assignmentFileSchema.parse(readVerifiedJsonFile(assignmentPath, "Word source assignment file"));
}

function readSupportFile({ manifestPath, relativePath, sourceId }) {
    const supportPath = resolveGovernedWordSourceDataPath({
        manifestPath,
        relativePath,
        evidenceMode: "support",
        sourceId,
    });
    if (!fs.existsSync(supportPath)) {
        throw new Error(`Missing word source support file: ${supportPath}`);
    }
    return supportFileSchema.parse(readVerifiedJsonFile(supportPath, "Word source support file"));
}

function normalizeJlptWordSourceEvidence(value = {}, { manifestPath = "" } = {}) {
    const parsed = jlptWordSourceEvidenceSchema.parse(value);
    const assignments = { ...(parsed.assignments || {}) };
    const supportRecords = { ...(parsed.supportRecords || {}) };

    if (manifestPath) {
        for (const [sourceId, relativePath] of Object.entries(parsed.assignmentFiles || {})) {
            const assignmentFile = readAssignmentFile({ manifestPath, relativePath, sourceId });
            if (assignmentFile.sourceId !== sourceId) {
                throw new Error(`Word source assignment file ${relativePath} declares ${assignmentFile.sourceId}, not ${sourceId}.`);
            }
            assignments[sourceId] = {
                ...(assignments[sourceId] || {}),
                ...(assignmentFile.assignments || {}),
            };
        }
        for (const [sourceId, relativePath] of Object.entries(parsed.supportFiles || {})) {
            const supportFile = readSupportFile({ manifestPath, relativePath, sourceId });
            if (supportFile.sourceId !== sourceId) {
                throw new Error(`Word source support file ${relativePath} declares ${supportFile.sourceId}, not ${sourceId}.`);
            }
            supportRecords[sourceId] = {
                ...(supportRecords[sourceId] || {}),
                ...(supportFile.supportRecords || {}),
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

    const normalizedSupportRecords = {};
    for (const [sourceId, sourceSupportRecords] of Object.entries(supportRecords || {})) {
        if (!parsed.sources[sourceId]) {
            throw new Error(`Word support records reference unknown source ${sourceId}.`);
        }
        normalizedSupportRecords[sourceId] = {};
        for (const [identity, record] of Object.entries(sourceSupportRecords || {})) {
            normalizedSupportRecords[sourceId][identity] = normalizeWordSupportRecord(identity, record);
        }
    }

    return {
        ...parsed,
        assignments: normalizedAssignments,
        supportRecords: normalizedSupportRecords,
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

function formatWordSourceSupportFileJson({ sourceId, supportRecords = {} } = {}) {
    return formatWordSourceEvidenceJson({
        sourceId,
        supportRecords,
    });
}

module.exports = {
    DEFAULT_WORD_EVIDENCE_POLICY,
    assignmentFileSchema,
    supportFileSchema,
    buildWordIdentity,
    formatWordSourceAssignmentFileJson,
    formatWordSourceEvidenceJson,
    formatWordSourceSupportFileJson,
    jlptWordSourceEvidenceSchema,
    loadJlptWordSourceEvidence,
    normalizeJlptWordLevel,
    normalizeJlptWordSourceEvidence,
    normalizeWordSupportRecord,
    readJlptWordSourceEvidenceManifest,
    resolveGovernedWordSourceDataPath,
    wordAssignmentSchema,
    wordSourceReviewStatusSchema,
    wordSourceSupportClaimSchema,
    wordSupportEvidenceKindSchema,
    wordSupportEvidenceSchema,
    wordSupportRecordSchema,
};
