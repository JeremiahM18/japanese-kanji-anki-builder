const path = require("node:path");
const { z } = require("zod");

const triageOverrideSchema = z.object({
    suggestedAction: z.enum(["editorial_review", "promote_curated_example", "defer_variant"]),
    priority: z.enum(["high", "medium", "low"]).optional(),
    note: z.string().min(1).optional(),
}).strict();

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
