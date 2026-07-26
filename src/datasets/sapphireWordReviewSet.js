const { z } = require("zod");
const {
    ACTIVE_WORD_SAPPHIRE_STATUSES,
    ALLOWED_WORD_SAPPHIRE_STATUSES,
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
    NON_SHIPPING_STATUSES,
} = require("../services/sapphireWordReviewService");
const {
    wordSapphireVerificationLimitationSchema,
} = require("./sapphireVerificationLimitations");

const nonEmptyStringArraySchema = z.array(z.string().min(1));
const evidenceEntrySchema = z.object({
    type: z.string().min(1),
    source: z.string().min(1),
    detail: z.string().min(1),
}).passthrough();
const migrationProvenanceSchema = z.object({
    migratedAt: z.string().min(1).optional(),
    migratedFrom: z.string().min(1).optional(),
    migrationType: z.string().min(1).optional(),
    previousStatus: z.string().min(1).optional(),
    previousReviewStandard: z.string().optional(),
    newStatus: z.string().min(1).optional(),
    newReviewStandard: z.string().optional(),
    authority: z.string().min(1).optional(),
}).passthrough();

const sapphireWordReviewEntrySchema = z.object({
    word: z.string().min(1),
    status: z.enum([...ALLOWED_WORD_SAPPHIRE_STATUSES]),
    readingIncludes: nonEmptyStringArraySchema.optional(),
    meaningIncludes: nonEmptyStringArraySchema.optional(),
    jlptLevelIncludes: nonEmptyStringArraySchema.optional(),
    coverageRoleIncludes: nonEmptyStringArraySchema.optional(),
    focusIncludes: nonEmptyStringArraySchema.optional(),
    coversReadingIncludes: nonEmptyStringArraySchema.optional(),
    breakdownIncludes: nonEmptyStringArraySchema.optional(),
    exampleIncludes: nonEmptyStringArraySchema.optional(),
    pitchAccentIncludes: nonEmptyStringArraySchema.optional(),
    notesIncludes: nonEmptyStringArraySchema.optional(),
    selectionRationale: z.string().optional(),
    levelPlacementReason: z.string().optional(),
    reviewedAt: z.string().optional(),
    reviewer: z.string().optional(),
    reviewStandard: z.string().optional(),
    revalidatedAt: z.string().optional(),
    revalidationSummary: z.string().optional(),
    sourceEvidence: z.array(evidenceEntrySchema).optional(),
    internalChecks: z.array(evidenceEntrySchema).optional(),
    reviewEvidence: z.array(evidenceEntrySchema).optional(),
    qualityGates: z.never().optional(),
    verificationLimitations: z.array(wordSapphireVerificationLimitationSchema).optional(),
    decisionReason: z.string().optional(),
    fixSummary: z.string().optional(),
    migrationProvenance: migrationProvenanceSchema.optional(),
    platinumReviewAudit: z.never().optional(),
    rereviewProvenance: z.never().optional(),
}).passthrough().superRefine((entry, ctx) => {
    if (ACTIVE_WORD_SAPPHIRE_STATUSES.includes(entry.status)) {
        const requiredArrayFields = [
            "readingIncludes",
            "pitchAccentIncludes",
            "sourceEvidence",
            "internalChecks",
            "reviewEvidence",
        ];
        for (const field of requiredArrayFields) {
            if (!Array.isArray(entry[field]) || entry[field].length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: [field],
                    message: `${field} is required for active Sapphire word entries`,
                });
            }
        }
        if (entry.reviewStandard !== CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reviewStandard"],
                message: `reviewStandard must be ${CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD}`,
            });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || "")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reviewedAt"],
                message: "reviewedAt must be YYYY-MM-DD for active Sapphire word entries",
            });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.revalidatedAt || "")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["revalidatedAt"],
                message: "revalidatedAt must be YYYY-MM-DD for active Sapphire word entries",
            });
        }
        if (!entry.reviewer) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reviewer"],
                message: "reviewer is required for active Sapphire word entries",
            });
        }
        if (!entry.selectionRationale) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["selectionRationale"],
                message: "selectionRationale is required for active Sapphire word entries",
            });
        }
        if (!entry.revalidationSummary) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["revalidationSummary"],
                message: "revalidationSummary is required for active Sapphire word entries",
            });
        }
        if (!entry.migrationProvenance) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["migrationProvenance"],
                message: "migrationProvenance is required for active Sapphire word entries",
            });
        }
        if (entry.status === "fixed_then_sapphire" && !entry.fixSummary) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["fixSummary"],
                message: "fixed_then_sapphire entries must include fixSummary",
            });
        }
        return;
    }

    if (NON_SHIPPING_STATUSES.includes(entry.status)) {
        if (!Array.isArray(entry.readingIncludes) || entry.readingIncludes.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["readingIncludes"],
                message: "readingIncludes must identify deferred or removed Sapphire word entries",
            });
        }
        if (!entry.reviewedAt) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reviewedAt"],
                message: "reviewedAt is required for deferred and removed Sapphire word entries",
            });
        }
        if (!entry.reviewer) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["reviewer"],
                message: "reviewer is required for deferred and removed Sapphire word entries",
            });
        }
        if (!entry.decisionReason) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["decisionReason"],
                message: "decisionReason is required for deferred and removed Sapphire word entries",
            });
        }
    }
});

const sapphireWordReviewSetSchema = z.array(sapphireWordReviewEntrySchema);

function formatSchemaIssue(issue = {}) {
    const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join(".")
        : "(root)";
    return `${path}: ${issue.message}`;
}

function parseSapphireWordReviewSet(value, label = "Sapphire word review set") {
    const result = sapphireWordReviewSetSchema.safeParse(value);
    if (!result.success) {
        throw new Error(`${label} failed schema validation:\n${result.error.issues.map(formatSchemaIssue).join("\n")}`);
    }
    return result.data;
}

module.exports = {
    parseSapphireWordReviewSet,
    sapphireWordReviewEntrySchema,
    sapphireWordReviewSetSchema,
};
