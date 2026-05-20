const { z } = require("zod");

const { ALLOWED_NLP_USES } = require("./nlpModelManifest");

const NLP_SUGGESTION_AUTHORITY = Object.freeze({
    outputAuthority: "assistive_only",
    promotionPolicy: "human_review_required",
    writesTrackedTemplates: false,
    certifiesCards: false,
});

const NLP_SUGGESTION_PROMOTION_POLICY = Object.freeze({
    humanReviewRequired: true,
    writesTrackedTemplates: false,
    certificationEvidence: false,
    releaseReadinessEvidence: false,
});

const deckKindSchema = z.enum(["kanji", "word"]);
const levelSchema = z.number().int().min(1).max(5);
const suggestionTaskSchema = z.enum(ALLOWED_NLP_USES);

const inputHashSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
}).strict();

const generatorSchema = z.object({
    modelId: z.string().min(1).optional(),
    runId: z.string().min(1),
    manifestPath: z.string().min(1),
    createdBy: z.string().min(1),
    inputHashes: z.array(inputHashSchema).min(1),
}).strict();

const authoritySchema = z.object({
    outputAuthority: z.literal(NLP_SUGGESTION_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(NLP_SUGGESTION_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
}).strict();

const scopeSchema = z.object({
    deckKind: deckKindSchema,
    levels: z.array(levelSchema).min(1),
    lane: suggestionTaskSchema,
    description: z.string().min(1).optional(),
}).strict();

const evidenceSchema = z.object({
    sourceType: z.enum([
        "generated-row",
        "tracked-source",
        "source-manifest",
        "corpus",
        "model-score",
        "runtime",
        "human-note",
    ]),
    sourceId: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    excerpt: z.string().min(1).optional(),
    note: z.string().min(1),
}).strict();

const promotionSchema = z.object({
    humanReviewRequired: z.literal(true),
    writesTrackedTemplates: z.literal(false),
    certificationEvidence: z.literal(false),
    releaseReadinessEvidence: z.literal(false),
}).strict();

const targetSchema = z.object({
    deckKind: deckKindSchema,
    level: levelSchema,
    written: z.string().min(1),
    reading: z.string().min(1).optional(),
    cardId: z.string().min(1).optional(),
}).strict();

const suggestionSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    task: suggestionTaskSchema,
    action: z.enum(["candidate", "rank", "warn", "cluster", "review"]),
    target: targetSchema,
    score: z.number().min(0).max(1).optional(),
    rank: z.number().int().positive().optional(),
    summary: z.string().min(1),
    rationale: z.string().min(1),
    evidence: z.array(evidenceSchema).min(1),
    limitations: z.array(z.string().min(1)).min(1),
    promotion: promotionSchema,
}).strict();

const nlpSuggestionArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_suggestion_batch"),
    generatedAt: z.string().min(1),
    generator: generatorSchema,
    authority: authoritySchema,
    scope: scopeSchema,
    suggestions: z.array(suggestionSchema),
}).strict();

function parseNlpSuggestionArtifact(value) {
    const parsed = nlpSuggestionArtifactSchema.parse(value);
    const seenIds = new Set();

    if (parsed.suggestions.length > 0 && !parsed.generator.modelId) {
        throw new Error("NLP suggestion artifacts with suggestions must declare generator.modelId.");
    }

    for (const suggestion of parsed.suggestions) {
        if (seenIds.has(suggestion.id)) {
            throw new Error(`Duplicate NLP suggestion id: ${suggestion.id}.`);
        }
        seenIds.add(suggestion.id);

        if (suggestion.task !== parsed.scope.lane) {
            throw new Error(`NLP suggestion ${suggestion.id} uses task ${suggestion.task}, but artifact lane is ${parsed.scope.lane}.`);
        }
        if (suggestion.target.deckKind !== parsed.scope.deckKind) {
            throw new Error(`NLP suggestion ${suggestion.id} targets ${suggestion.target.deckKind}, but artifact deck kind is ${parsed.scope.deckKind}.`);
        }
        if (!parsed.scope.levels.includes(suggestion.target.level)) {
            throw new Error(`NLP suggestion ${suggestion.id} targets N${suggestion.target.level}, outside artifact levels ${parsed.scope.levels.map((level) => `N${level}`).join(", ")}.`);
        }
        if (suggestion.target.deckKind === "word" && !suggestion.target.reading) {
            throw new Error(`NLP word suggestion ${suggestion.id} must bind target.reading.`);
        }
    }

    return parsed;
}

module.exports = {
    NLP_SUGGESTION_AUTHORITY,
    NLP_SUGGESTION_PROMOTION_POLICY,
    nlpSuggestionArtifactSchema,
    parseNlpSuggestionArtifact,
};
