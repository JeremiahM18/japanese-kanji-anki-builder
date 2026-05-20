const { z } = require("zod");

const { ALLOWED_NLP_USES } = require("./nlpModelManifest");

const NLP_EMBEDDING_AUTHORITY = Object.freeze({
    outputAuthority: "assistive_only",
    promotionPolicy: "human_review_required",
    writesTrackedTemplates: false,
    certifiesCards: false,
});

const NLP_EMBEDDING_TARGET_KINDS = [
    "word-card",
    "kanji-card",
    "example-sentence",
    "sentence-corpus",
    "candidate-word",
];

const levelSchema = z.number().int().min(1).max(5);
const finiteNumberSchema = z.number().refine(Number.isFinite, {
    message: "Expected a finite number.",
});
const laneSchema = z.enum(ALLOWED_NLP_USES);

const inputHashSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
}).strict();

const deterministicSchema = z.object({
    requiresPinnedModel: z.literal(true),
    requiresPinnedRuntime: z.literal(true),
    requiresPinnedInputs: z.literal(true),
}).strict();

const generatorSchema = z.object({
    modelId: z.string().min(1).optional(),
    runId: z.string().min(1),
    manifestPath: z.string().min(1),
    createdBy: z.string().min(1),
    inputHashes: z.array(inputHashSchema).min(1),
}).strict();

const authoritySchema = z.object({
    outputAuthority: z.literal(NLP_EMBEDDING_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(NLP_EMBEDDING_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
}).strict();

const modelEvidenceSchema = z.object({
    modelId: z.string().min(1),
    runtimeId: z.string().min(1),
    modelFamily: z.string().min(1),
    modelVersion: z.string().min(1),
    embeddingDimension: z.number().int().positive(),
    pooling: z.enum(["model-default", "mean", "cls", "none"]),
    normalized: z.boolean(),
    distanceMetric: z.enum(["cosine", "dot-product", "euclidean"]),
    deterministic: deterministicSchema,
}).strict();

const scopeSchema = z.object({
    targetKind: z.enum(NLP_EMBEDDING_TARGET_KINDS),
    deckKind: z.enum(["kanji", "word"]).optional(),
    levels: z.array(levelSchema).optional(),
    source: z.enum([
        "generated-word-rows",
        "generated-kanji-rows",
        "starter-word-study-data",
        "starter-sentence-corpus",
        "word-reading-gap-plan",
        "ad-hoc-review-packet",
    ]),
    lane: laneSchema,
    description: z.string().min(1).optional(),
}).strict();

const targetSchema = z.object({
    kind: z.enum(NLP_EMBEDDING_TARGET_KINDS),
    deckKind: z.enum(["kanji", "word"]).optional(),
    level: levelSchema.optional(),
    written: z.string().min(1).optional(),
    reading: z.string().min(1).optional(),
    sentence: z.string().min(1).optional(),
    cardId: z.string().min(1).optional(),
    sourceId: z.string().min(1).optional(),
}).strict();

const embeddingSchema = z.object({
    vector: z.array(finiteNumberSchema).min(1),
    magnitude: finiteNumberSchema.optional(),
}).strict();

const itemSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    target: targetSchema,
    inputText: z.string().min(1),
    normalizedText: z.string().min(1).optional(),
    embedding: embeddingSchema,
    warnings: z.array(z.string().min(1)).default([]),
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

const nlpEmbeddingArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_embedding_batch"),
    generatedAt: z.string().min(1),
    generator: generatorSchema,
    model: modelEvidenceSchema,
    authority: authoritySchema,
    scope: scopeSchema,
    items: z.array(itemSchema),
}).strict();

function parseNlpEmbeddingArtifact(value) {
    const parsed = nlpEmbeddingArtifactSchema.parse(value);
    const seenIds = new Set();

    if (parsed.items.length > 0 && !parsed.generator.modelId) {
        throw new Error("NLP embedding artifacts with items must declare generator.modelId.");
    }
    if (parsed.generator.modelId && parsed.generator.modelId !== parsed.model.modelId) {
        throw new Error(`NLP embedding generator model ${parsed.generator.modelId} does not match model evidence ${parsed.model.modelId}.`);
    }

    for (const item of parsed.items) {
        if (seenIds.has(item.id)) {
            throw new Error(`Duplicate NLP embedding item id: ${item.id}.`);
        }
        seenIds.add(item.id);

        if (item.target.kind !== parsed.scope.targetKind) {
            throw new Error(`NLP embedding item ${item.id} targets ${item.target.kind}, but artifact target kind is ${parsed.scope.targetKind}.`);
        }
        if (parsed.scope.deckKind && item.target.deckKind && item.target.deckKind !== parsed.scope.deckKind) {
            throw new Error(`NLP embedding item ${item.id} targets ${item.target.deckKind}, but artifact deck kind is ${parsed.scope.deckKind}.`);
        }
        if (parsed.scope.levels && item.target.level && !parsed.scope.levels.includes(item.target.level)) {
            throw new Error(`NLP embedding item ${item.id} targets N${item.target.level}, outside artifact levels ${parsed.scope.levels.map((level) => `N${level}`).join(", ")}.`);
        }
        if ((item.target.kind === "word-card" || item.target.kind === "candidate-word") && !item.target.reading) {
            throw new Error(`NLP ${item.target.kind} embedding item ${item.id} must bind target.reading.`);
        }
        if (item.embedding.vector.length !== parsed.model.embeddingDimension) {
            throw new Error(`NLP embedding item ${item.id} vector length ${item.embedding.vector.length} does not match model embedding dimension ${parsed.model.embeddingDimension}.`);
        }
    }

    return parsed;
}

module.exports = {
    NLP_EMBEDDING_AUTHORITY,
    NLP_EMBEDDING_TARGET_KINDS,
    nlpEmbeddingArtifactSchema,
    parseNlpEmbeddingArtifact,
};
