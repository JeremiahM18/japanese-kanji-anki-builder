const path = require("node:path");
const { z } = require("zod");

const triageOverrideSchema = z.object({
    suggestedAction: z.enum(["editorial_review", "promote_curated_example", "defer_variant"]),
    priority: z.enum(["high", "medium", "low"]).optional(),
    targetLevel: z.number().int().min(1).max(5).optional(),
    targetLevelReason: z.string().min(1).optional(),
    note: z.string().min(1).optional(),
}).strict().superRefine((override, ctx) => {
    if (Number.isInteger(override.targetLevel) && override.suggestedAction !== "defer_variant") {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetLevel is only supported for defer_variant overrides.",
            path: ["targetLevel"],
        });
    }

    if (Number.isInteger(override.targetLevel) && !override.targetLevelReason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetLevelReason is required when targetLevel is present.",
            path: ["targetLevelReason"],
        });
    }

    if (!Number.isInteger(override.targetLevel) && override.targetLevelReason) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "targetLevelReason requires targetLevel.",
            path: ["targetLevelReason"],
        });
    }
});

const triageOverridesSchema = z.record(
    z.string().min(1),
    z.record(z.string().min(1), triageOverrideSchema)
);

function loadWordReadingGapTriageOverrides({
    contractPath = path.resolve(process.cwd(), "templates", "word_reading_gap_triage_overrides.json"),
} = {}) {
    // `require` is enough here because the contract is tracked JSON and only loaded once per process.
    // The schema still guards against stale or malformed editorial dispositions.
    delete require.cache[require.resolve(contractPath)];
    const contract = require(contractPath);
    return triageOverridesSchema.parse(contract);
}

function buildGapOverrideKey({ kanji, readingType, reading }) {
    return `${String(kanji || "").trim()}|${String(readingType || "").trim()}|${String(reading || "").trim()}`;
}

module.exports = {
    buildGapOverrideKey,
    loadWordReadingGapTriageOverrides,
    triageOverrideSchema,
    triageOverridesSchema,
};
