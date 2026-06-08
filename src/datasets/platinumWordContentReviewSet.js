const { z } = require("zod");
const {
    ALLOWED_PLATINUM_CONTENT_STATUSES,
    CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD,
    REQUIRED_WORD_EVIDENCE_CHECKS,
    REQUIRED_WORD_EXPERT_REVIEW_FIELDS,
    REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../services/platinumWordContentReviewService");

const expertContentReviewSchema = z.object(Object.fromEntries(
    REQUIRED_WORD_EXPERT_REVIEW_FIELDS.map((field) => [field, z.string().min(1)])
));

const evidenceCheckedSchema = z.object(Object.fromEntries(
    REQUIRED_WORD_EVIDENCE_CHECKS.map((field) => [field, z.literal(true)])
));

const expertReviewEvidenceSchema = z.object({
    type: z.literal("expert-content-review"),
    reviewer: z.string().min(1),
    detail: z.string().min(1),
}).passthrough();

const platinumReviewAuditSchema = z.object({
    schemaVersion: z.number().int().positive(),
    auditType: z.literal("expert-content-platinum"),
    authority: z.string().min(1),
}).passthrough();

const sapphireBindingSchema = z.object({
    manifest: z.string().min(1),
    reviewStandard: z.literal(REQUIRED_WORD_SAPPHIRE_REVIEW_STANDARD),
}).passthrough();

const platinumWordContentReviewEntrySchema = z.object({
    word: z.string().min(1),
    readingIncludes: z.array(z.string().min(1)).optional(),
    status: z.enum([...ALLOWED_PLATINUM_CONTENT_STATUSES]),
    reviewStandard: z.string().optional(),
    reviewedAt: z.string().optional(),
    reviewer: z.string().optional(),
    sapphireBinding: sapphireBindingSchema.optional(),
    expertContentReview: expertContentReviewSchema.optional(),
    evidenceChecked: evidenceCheckedSchema.optional(),
    expertReviewEvidence: z.array(expertReviewEvidenceSchema).optional(),
    platinumReviewAudit: platinumReviewAuditSchema.optional(),
    fixSummary: z.string().optional(),
    decisionReason: z.string().optional(),
    sapphireReviewAudit: z.never().optional(),
    rereviewProvenance: z.never().optional(),
    sourceEvidence: z.never().optional(),
    internalChecks: z.never().optional(),
    reviewEvidence: z.never().optional(),
}).passthrough().superRefine((entry, ctx) => {
    if (!["platinum", "fixed_then_platinum"].includes(entry.status)) {
        return;
    }
    if (entry.reviewStandard !== CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviewStandard"],
            message: `reviewStandard must be ${CURRENT_WORD_PLATINUM_CONTENT_REVIEW_STANDARD}`,
        });
    }
    if (!Array.isArray(entry.readingIncludes) || entry.readingIncludes.length !== 1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["readingIncludes"],
            message: "readingIncludes must contain exactly one reviewed reading for active Platinum content entries",
        });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt || "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["reviewedAt"],
            message: "reviewedAt must be YYYY-MM-DD for active Platinum content entries",
        });
    }
    for (const field of ["reviewer", "sapphireBinding", "expertContentReview", "evidenceChecked", "expertReviewEvidence", "platinumReviewAudit"]) {
        if (!entry[field] || (Array.isArray(entry[field]) && entry[field].length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [field],
                message: `${field} is required for active Platinum content entries`,
            });
        }
    }
    if (entry.status === "fixed_then_platinum" && !entry.fixSummary) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["fixSummary"],
            message: "fixed_then_platinum entries must include fixSummary",
        });
    }
});

const platinumWordContentReviewSetSchema = z.array(platinumWordContentReviewEntrySchema);

function formatSchemaIssue(issue = {}) {
    const path = Array.isArray(issue.path) && issue.path.length > 0
        ? issue.path.join(".")
        : "(root)";
    return `${path}: ${issue.message}`;
}

function parsePlatinumWordContentReviewSet(value, label = "Platinum word content review set") {
    const result = platinumWordContentReviewSetSchema.safeParse(value);
    if (!result.success) {
        throw new Error(`${label} failed schema validation:\n${result.error.issues.map(formatSchemaIssue).join("\n")}`);
    }
    return result.data;
}

module.exports = {
    parsePlatinumWordContentReviewSet,
    platinumWordContentReviewEntrySchema,
    platinumWordContentReviewSetSchema,
};
