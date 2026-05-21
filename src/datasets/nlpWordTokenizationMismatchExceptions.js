const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const WORD_TOKENIZATION_EXCEPTION_AUTHORITY = Object.freeze({
    outputAuthority: "assistive_only",
    promotionPolicy: "human_review_required",
    writesTrackedTemplates: false,
    certifiesCards: false,
    claimsReleaseReadiness: false,
});

const WORD_TOKENIZATION_EXCEPTION_KINDS = Object.freeze([
    "counter-sound-change-reading",
    "date-counter-irregular-reading",
    "fixed-expression-reading-assimilation",
    "formal-compound-alternate-reading",
    "lexical-alternate-reading",
    "modern-kana-tokenizer-reading-variant",
    "orthographic-function-word-reading",
    "proper-noun-reading-variant",
]);

const SIGNAL_KINDS_ALLOWED_FOR_EXCEPTIONS = Object.freeze([
    "artifact-warning",
    "missing-token-reading",
    "multi-token-surface",
    "token-reading-card-reading-mismatch",
    "unknown-token",
]);

function buildDefaultNlpWordTokenizationMismatchExceptionPath() {
    return path.resolve(__dirname, "../../templates/nlp_word_tokenization_mismatch_exceptions.json");
}

function exceptionKey(entry = {}) {
    return [
        Number.isInteger(entry.level) ? `N${entry.level}` : "N?",
        entry.written,
        entry.reading,
    ].join("|");
}

const authoritySchema = z.object({
    outputAuthority: z.literal(WORD_TOKENIZATION_EXCEPTION_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(WORD_TOKENIZATION_EXCEPTION_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
    claimsReleaseReadiness: z.literal(false),
}).strict();

const evidenceRefSchema = z.object({
    type: z.enum([
        "generated-row",
        "tracked-source",
        "source-manifest",
        "human-review",
    ]),
    source: z.string().min(1),
    detail: z.string().min(1),
}).strict();

const exceptionEntrySchema = z.object({
    written: z.string().min(1),
    reading: z.string().min(1),
    level: z.number().int().min(1).max(5),
    tokenizerReading: z.string().min(1),
    tokenSurfaces: z.array(z.string().min(1)).min(1),
    exceptionKind: z.enum(WORD_TOKENIZATION_EXCEPTION_KINDS),
    appliesToSignalKinds: z.array(z.enum(SIGNAL_KINDS_ALLOWED_FOR_EXCEPTIONS)).min(1),
    evidence: z.array(evidenceRefSchema).min(2),
    reviewNote: z.string().min(1),
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

const exceptionArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_word_tokenization_mismatch_exceptions"),
    reviewedAt: z.string().min(1),
    reviewer: z.string().min(1),
    reviewStandard: z.string().min(1),
    authority: authoritySchema,
    entries: z.array(exceptionEntrySchema),
}).strict();

function parseNlpWordTokenizationMismatchExceptions(value) {
    const parsed = exceptionArtifactSchema.parse(value);
    const seen = new Set();

    for (const entry of parsed.entries) {
        const key = exceptionKey(entry);
        if (seen.has(key)) {
            throw new Error(`Duplicate NLP word tokenization mismatch exception: ${key}.`);
        }
        seen.add(key);
        if (!entry.appliesToSignalKinds.includes("token-reading-card-reading-mismatch")) {
            throw new Error(`NLP word tokenization mismatch exception ${key} must apply to token-reading-card-reading-mismatch.`);
        }
        if (entry.appliesToSignalKinds.includes("artifact-warning")) {
            const hasTokenizerLimitation = entry.limitations.some((limitation) => /tokenizer|dictionary/i.test(limitation));
            if (!hasTokenizerLimitation) {
                throw new Error(`NLP word tokenization mismatch exception ${key} cannot ignore artifact warnings without a tokenizer/dictionary limitation.`);
            }
        }
        if (!entry.evidence.some((evidence) => evidence.type === "generated-row")) {
            throw new Error(`NLP word tokenization mismatch exception ${key} must include generated-row evidence.`);
        }
        if (!entry.evidence.some((evidence) => evidence.type === "tracked-source" || evidence.type === "human-review")) {
            throw new Error(`NLP word tokenization mismatch exception ${key} must include tracked-source or human-review evidence.`);
        }
    }

    return parsed;
}

function loadNlpWordTokenizationMismatchExceptions(
    filePath = buildDefaultNlpWordTokenizationMismatchExceptionPath()
) {
    return parseNlpWordTokenizationMismatchExceptions(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

function buildNlpWordTokenizationMismatchExceptionMap(artifact) {
    const parsed = parseNlpWordTokenizationMismatchExceptions(artifact);
    return new Map(parsed.entries.map((entry) => [exceptionKey(entry), entry]));
}

module.exports = {
    SIGNAL_KINDS_ALLOWED_FOR_EXCEPTIONS,
    WORD_TOKENIZATION_EXCEPTION_AUTHORITY,
    WORD_TOKENIZATION_EXCEPTION_KINDS,
    buildDefaultNlpWordTokenizationMismatchExceptionPath,
    buildNlpWordTokenizationMismatchExceptionMap,
    loadNlpWordTokenizationMismatchExceptions,
    parseNlpWordTokenizationMismatchExceptions,
};
