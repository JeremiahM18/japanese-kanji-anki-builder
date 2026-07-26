const { z } = require("zod");

const SAPPHIRE_VERIFICATION_LIMITATION_STATUSES = Object.freeze([
    "externally_unverified",
    "limited_source",
    "manual_review_only",
]);

const WORD_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "pitchAccent",
    "sourceAvailability",
    "sourcePriority",
]);

const KANJI_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS = Object.freeze([
    "audioNaturalness",
    "exampleSupportNuance",
    "notesSupportNuance",
    "sourceAvailability",
    "strokeOrderSequence",
    "strokeOrderSourceDepth",
]);

const WORD_SAPPHIRE_BLOCKED_CORE_LIMITATION_FIELDS = Object.freeze([
    "word",
    "writtenForm",
    "reading",
    "meaning",
    "exampleSentence",
    "productFit",
]);

const KANJI_SAPPHIRE_BLOCKED_CORE_LIMITATION_FIELDS = Object.freeze([
    "kanji",
    "displayWord",
    "primaryReading",
    "meaningJP",
    "kanjiMeanings",
    "exampleSentence",
    "productFit",
]);

const limitationBaseSchema = z.object({
    field: z.string().min(1),
    status: z.enum(SAPPHIRE_VERIFICATION_LIMITATION_STATUSES),
    label: z.string().min(1),
    reviewNote: z.string().min(1),
}).strict();

function buildSapphireVerificationLimitationSchema(allowedFields) {
    return limitationBaseSchema.extend({
        field: z.enum(allowedFields),
    });
}

const wordSapphireVerificationLimitationSchema = buildSapphireVerificationLimitationSchema(
    WORD_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS
);
const kanjiSapphireVerificationLimitationSchema = buildSapphireVerificationLimitationSchema(
    KANJI_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS
);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeLimitations(value) {
    return (Array.isArray(value) ? value : [])
        .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
        .map((entry) => ({
            field: normalizeText(entry.field),
            status: normalizeText(entry.status),
            label: normalizeText(entry.label),
            reviewNote: normalizeText(entry.reviewNote),
        }));
}

function labelDisclosesLimitation(label) {
    return /\b(?:unverified|not verified|limited|manual review|unavailable|no |absent|not .*evidence)\b/iu.test(label);
}

function reviewEvidenceDisclosesField(entry, field) {
    const manualEvidence = (Array.isArray(entry?.reviewEvidence) ? entry.reviewEvidence : [])
        .filter((evidence) => evidence?.type === "manual-review")
        .map((evidence) => `${evidence.source || ""} ${evidence.detail || ""}`)
        .join(" ");
    if (/verification limitation/iu.test(manualEvidence)) {
        return true;
    }
    if (field === "pitchAccent") {
        return /pitch/iu.test(manualEvidence);
    }
    if (["sourceAvailability", "sourcePriority"].includes(field)) {
        return /source|priority|JMdict/iu.test(manualEvidence);
    }
    return new RegExp(field, "iu").test(manualEvidence);
}

function validateWordSapphireVerificationLimitations(entry = {}, row = {}) {
    const failures = [];
    const limitations = normalizeLimitations(entry.verificationLimitations);
    for (const limitation of limitations) {
        const parsed = wordSapphireVerificationLimitationSchema.safeParse(limitation);
        if (!parsed.success) {
            failures.push(
                `verification limitation is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
            );
            continue;
        }
        if (!labelDisclosesLimitation(limitation.label)) {
            failures.push(`verification limitation label must visibly disclose limited or unverified status: ${limitation.label}`);
        }
        if (!reviewEvidenceDisclosesField(entry, limitation.field)) {
            failures.push(`verification limitation ${limitation.field} must bind to manual-review evidence`);
        }
        if (limitation.field === "pitchAccent") {
            if (!["externally_unverified", "manual_review_only"].includes(limitation.status)) {
                failures.push("pitchAccent verification limitations must be externally_unverified or manual_review_only");
            }
            if (!/generated pitch\s*\(unverified\)|pitch(?: accent)?[^<]{0,80}(?:unverified|not verified)/iu.test(normalizeText(row.pitchAccent))) {
                failures.push("pitchAccent verification limitation must remain visibly labeled as unverified in the generated pitch field");
            }
        }
        if (["sourceAvailability", "sourcePriority"].includes(limitation.field)) {
            if (limitation.status !== "limited_source") {
                failures.push(`${limitation.field} verification limitations must use limited_source status`);
            }
        }
    }
    return failures;
}

function validateKanjiSapphireVerificationLimitations(entry = {}, _row = {}) {
    const failures = [];
    const limitations = normalizeLimitations(entry.verificationLimitations);
    for (const limitation of limitations) {
        const parsed = kanjiSapphireVerificationLimitationSchema.safeParse(limitation);
        if (!parsed.success) {
            failures.push(
                `verification limitation is invalid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`
            );
            continue;
        }
        if (!labelDisclosesLimitation(limitation.label)) {
            failures.push(`verification limitation label must visibly disclose limited or unverified status: ${limitation.label}`);
        }
        if (!reviewEvidenceDisclosesField(entry, limitation.field)) {
            failures.push(`verification limitation ${limitation.field} must bind to manual-review evidence`);
        }
    }
    return failures;
}

function canonicalizeLegacyWordSapphireVerificationLimitation(limitation = {}) {
    const field = normalizeText(limitation.field);
    const sourcePriority = field === "source-priority"
        || (
            field === "sourceAvailability"
            && /priority marker/iu.test(`${limitation.label || ""} ${limitation.reviewNote || ""}`)
        );
    if (["pitch-accent-source", "PitchAccent", "pitchAccent"].includes(field)) {
        return {
            field: "pitchAccent",
            status: normalizeText(limitation.status) === "manual_review_only"
                ? "manual_review_only"
                : "externally_unverified",
            label: "Generated pitch (unverified)",
            reviewNote: normalizeText(limitation.reviewNote),
        };
    }
    if (sourcePriority) {
        return {
            field: "sourcePriority",
            status: "limited_source",
            label: "JMdict priority marker absent (limited source)",
            reviewNote: normalizeText(limitation.reviewNote),
        };
    }
    if (field === "sourceAvailability") {
        return {
            field: "sourceAvailability",
            status: "limited_source",
            label: /(?:not JMdict-priority evidence|JMdict-priority evidence unavailable)/iu.test(normalizeText(limitation.label))
                ? "Curated source only; JMdict-priority evidence unavailable"
                : "JMdict priority marker absent (limited source)",
            reviewNote: normalizeText(limitation.reviewNote),
        };
    }
    return {
        field,
        status: normalizeText(limitation.status),
        label: normalizeText(limitation.label),
        reviewNote: normalizeText(limitation.reviewNote),
    };
}

module.exports = {
    KANJI_SAPPHIRE_BLOCKED_CORE_LIMITATION_FIELDS,
    KANJI_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS,
    SAPPHIRE_VERIFICATION_LIMITATION_STATUSES,
    WORD_SAPPHIRE_BLOCKED_CORE_LIMITATION_FIELDS,
    WORD_SAPPHIRE_VERIFICATION_LIMITATION_FIELDS,
    canonicalizeLegacyWordSapphireVerificationLimitation,
    kanjiSapphireVerificationLimitationSchema,
    normalizeLimitations,
    validateKanjiSapphireVerificationLimitations,
    validateWordSapphireVerificationLimitations,
    wordSapphireVerificationLimitationSchema,
};
