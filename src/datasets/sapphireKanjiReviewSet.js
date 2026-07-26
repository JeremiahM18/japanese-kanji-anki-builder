const { z } = require("zod");
const {
    ACTIVE_SAPPHIRE_STATUSES,
    ALLOWED_SAPPHIRE_STATUSES,
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
} = require("../services/sapphireKanjiReviewService");
const {
    kanjiSapphireVerificationLimitationSchema,
} = require("./sapphireVerificationLimitations");

const SINGLE_KANJI_RE = /^\p{Script=Han}$/u;

const nonEmptyStringArraySchema = z.array(z.string().min(1));
const evidenceEntrySchema = z.object({
    type: z.string().min(1),
    source: z.string().min(1),
    detail: z.string().min(1),
}).passthrough();
const sapphireReviewAuditSchema = z.object({
    schemaVersion: z.number().int().positive().optional(),
    auditType: z.string().min(1).optional(),
    migrationBoundary: z.object({
        migratedAt: z.string().min(1).optional(),
        migratedFrom: z.string().min(1).optional(),
        migrationType: z.string().min(1).optional(),
        legacyCommandNamesPreserved: z.boolean().optional(),
        authority: z.string().min(1).optional(),
    }).passthrough().optional(),
}).passthrough();

const sapphireKanjiReviewEntrySchema = z.object({
    kanji: z.string().regex(SINGLE_KANJI_RE),
    status: z.enum([...ALLOWED_SAPPHIRE_STATUSES]),
    reviewStandard: z.string().optional(),
    reviewedAt: z.string().optional(),
    reviewer: z.string().optional(),
    readingIncludes: nonEmptyStringArraySchema.optional(),
    meaningIncludes: nonEmptyStringArraySchema.optional(),
    kanjiMeaningsIncludes: nonEmptyStringArraySchema.optional(),
    levelIncludes: nonEmptyStringArraySchema.optional(),
    exampleIncludes: nonEmptyStringArraySchema.optional(),
    notesIncludes: nonEmptyStringArraySchema.optional(),
    primaryReadingRationale: z.string().optional(),
    sourceEvidence: z.array(evidenceEntrySchema).optional(),
    internalChecks: z.array(evidenceEntrySchema).optional(),
    reviewEvidence: z.array(evidenceEntrySchema).optional(),
    qualityGates: z.never().optional(),
    verificationLimitations: z.array(kanjiSapphireVerificationLimitationSchema).optional(),
    fixSummary: z.string().optional(),
    sapphireReviewAudit: sapphireReviewAuditSchema.optional(),
    migrationProvenance: z.object({
        migratedAt: z.string().min(1).optional(),
        migratedFrom: z.string().min(1).optional(),
        migrationType: z.string().min(1).optional(),
        authority: z.string().min(1).optional(),
    }).passthrough().optional(),
    platinumReviewAudit: z.never().optional(),
    rereviewProvenance: z.never().optional(),
}).passthrough().superRefine((entry, ctx) => {
    if (!ACTIVE_SAPPHIRE_STATUSES.includes(entry.status)) {
        return;
    }

    const requiredArrayFields = [
        "kanjiMeaningsIncludes",
        "levelIncludes",
        "sourceEvidence",
        "internalChecks",
        "reviewEvidence",
    ];
    for (const field of requiredArrayFields) {
        if (!Array.isArray(entry[field]) || entry[field].length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `${field} is required for active Sapphire entries`,
            });
        }
    }
    if (entry.reviewStandard !== CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviewStandard"],
            message: `reviewStandard must be ${CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD}`,
        });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviewedAt"],
            message: "reviewedAt must be YYYY-MM-DD for active Sapphire entries",
        });
    }
    if (!entry.reviewer) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviewer"],
            message: "reviewer is required for active Sapphire entries",
        });
    }
    if (!entry.primaryReadingRationale) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["primaryReadingRationale"],
            message: "primaryReadingRationale is required for active Sapphire entries",
        });
    }
    if (!entry.sapphireReviewAudit) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sapphireReviewAudit"],
            message: "sapphireReviewAudit is required for active Sapphire entries",
        });
    }
    if (entry.status === "fixed_then_sapphire" && !entry.fixSummary) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fixSummary"],
            message: "fixed_then_sapphire entries must include fixSummary",
        });
    }
});

const sapphireKanjiReviewSetSchema = z.array(sapphireKanjiReviewEntrySchema);

function formatSchemaIssue(issue = {}) {
    const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join(".")
        : "(root)";
    return `${path}: ${issue.message}`;
}

function parseSapphireKanjiReviewSet(value, label = "Sapphire kanji review set") {
    const result = sapphireKanjiReviewSetSchema.safeParse(value);
    if (!result.success) {
        throw new Error(`${label} failed schema validation:\n${result.error.issues.map(formatSchemaIssue).join("\n")}`);
    }
    return result.data;
}

module.exports = {
    sapphireKanjiReviewEntrySchema,
    sapphireKanjiReviewSetSchema,
    parseSapphireKanjiReviewSet,
};
