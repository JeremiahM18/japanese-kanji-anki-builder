const fs = require("node:fs");
const { z } = require("zod");
const { wordSourceSupportClaimSchema } = require("./jlptWordSourceEvidence");

const wordSourceInputReviewStatusSchema = z.enum([
    "reviewed",
    "needs_review",
    "blocked",
    "source_access_gap",
    "license_blocked",
]);

const wordSourceInputReviewStatusCountsSchema = z.object({
    reviewed: z.number().int().nonnegative().optional(),
    needs_review: z.number().int().nonnegative().optional(),
    blocked: z.number().int().nonnegative().optional(),
    source_access_gap: z.number().int().nonnegative().optional(),
    license_blocked: z.number().int().nonnegative().optional(),
}).strict();

const wordSourceInputConfigSchema = z.object({
    sourceId: z.string().min(1),
    sourcePath: z.string().min(1),
    sourceLabel: z.string().min(1),
    sourceUrl: z.string().min(1).optional(),
    format: z.enum(["tsv", "csv", "json"]).default("tsv"),
    writtenColumn: z.string().min(1).default("written"),
    readingColumn: z.string().min(1).default("reading"),
    levelColumn: z.string().min(1).default("jlpt"),
    meaningColumn: z.string().min(1).optional(),
    reviewStatusColumn: z.string().min(1).optional(),
    citationColumn: z.string().min(1).optional(),
    evidenceRefColumn: z.string().min(1).optional(),
    notesColumn: z.string().min(1).optional(),
    defaultReviewStatus: wordSourceInputReviewStatusSchema.default("needs_review"),
    defaultCitation: z.string().min(1).optional(),
    defaultEvidenceRef: z.string().min(1).optional(),
    defaultNotes: z.string().min(1).optional(),
    defaultSupportClaims: z.array(wordSourceSupportClaimSchema).default([]),
    requireLevel: z.boolean().default(true),
    requireCitation: z.boolean().default(true),
    requireEvidenceRef: z.boolean().default(true),
    supportedLevels: z.array(z.number().int().min(1).max(5)).min(1).optional(),
    checkedAt: z.string().min(1).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    byteSize: z.number().int().nonnegative().optional(),
    rowCount: z.number().int().nonnegative().optional(),
    expectedReviewStatusCounts: wordSourceInputReviewStatusCountsSchema.optional(),
    integrityPolicy: z.string().min(1).optional(),
}).strict();

const wordSourceInputManifestSchema = z.object({
    version: z.number().int().min(1).default(1),
    policy: z.object({
        noDeckMutation: z.boolean().default(true),
        requirePinnedIntegrity: z.boolean().default(true),
        requireKnownEvidenceSource: z.boolean().default(true),
        notes: z.string().optional(),
    }).strict().default({}),
    inputs: z.record(z.string().min(1), wordSourceInputConfigSchema).default({}),
}).strict();

function normalizeJlptWordSourceInputs(value = {}) {
    const parsed = wordSourceInputManifestSchema.parse(value);
    const inputs = Object.fromEntries(
        Object.entries(parsed.inputs || {}).map(([inputId, input]) => {
            if (input.sourceId !== inputId) {
                throw new Error(`JLPT word source input id mismatch: ${inputId} declares ${input.sourceId}`);
            }
            if (input.expectedReviewStatusCounts && Number.isInteger(input.rowCount)) {
                const expectedRows = Object.values(input.expectedReviewStatusCounts)
                    .reduce((total, count) => total + count, 0);
                if (expectedRows !== input.rowCount) {
                    throw new Error(`JLPT word source input ${inputId} expected review status counts sum to ${expectedRows}, not rowCount ${input.rowCount}`);
                }
            }
            return [inputId, input];
        })
    );

    return {
        ...parsed,
        inputs,
    };
}

function loadJlptWordSourceInputs(filePath) {
    return normalizeJlptWordSourceInputs(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

module.exports = {
    loadJlptWordSourceInputs,
    normalizeJlptWordSourceInputs,
    wordSourceInputConfigSchema,
    wordSourceInputManifestSchema,
    wordSourceInputReviewStatusCountsSchema,
    wordSourceInputReviewStatusSchema,
};
