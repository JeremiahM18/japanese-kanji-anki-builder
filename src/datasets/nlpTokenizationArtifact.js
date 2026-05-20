const { z } = require("zod");

const NLP_TOKENIZATION_AUTHORITY = Object.freeze({
    outputAuthority: "assistive_only",
    promotionPolicy: "human_review_required",
    writesTrackedTemplates: false,
    certifiesCards: false,
});

const NLP_TOKENIZATION_TARGET_KINDS = [
    "word-card",
    "kanji-card",
    "example-sentence",
    "sentence-corpus",
];

const levelSchema = z.number().int().min(1).max(5);

const inputHashSchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
}).strict();

const deterministicSchema = z.object({
    requiresPinnedRuntime: z.literal(true),
    requiresPinnedDictionary: z.literal(true),
    requiresPinnedInputs: z.literal(true),
}).strict();

const generatorSchema = z.object({
    runtimeId: z.string().min(1).optional(),
    runId: z.string().min(1),
    manifestPath: z.string().min(1),
    createdBy: z.string().min(1),
    inputHashes: z.array(inputHashSchema).min(1),
}).strict();

const authoritySchema = z.object({
    outputAuthority: z.literal(NLP_TOKENIZATION_AUTHORITY.outputAuthority),
    promotionPolicy: z.literal(NLP_TOKENIZATION_AUTHORITY.promotionPolicy),
    writesTrackedTemplates: z.literal(false),
    certifiesCards: z.literal(false),
}).strict();

const runtimeEvidenceSchema = z.object({
    runtimeId: z.string().min(1),
    tokenizerKind: z.enum(["kuromoji-js", "sudachi-compatible", "fixture"]),
    packageName: z.string().min(1).optional(),
    packageVersion: z.string().min(1).optional(),
    dictionaryId: z.string().min(1),
    dictionaryPath: z.string().min(1).optional(),
    dictionarySha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    deterministic: deterministicSchema,
}).strict();

const scopeSchema = z.object({
    targetKind: z.enum(NLP_TOKENIZATION_TARGET_KINDS),
    levels: z.array(levelSchema).optional(),
    source: z.enum([
        "generated-word-rows",
        "generated-kanji-rows",
        "starter-word-study-data",
        "starter-sentence-corpus",
        "ad-hoc-review-packet",
    ]),
    description: z.string().min(1).optional(),
}).strict();

const targetSchema = z.object({
    kind: z.enum(NLP_TOKENIZATION_TARGET_KINDS),
    deckKind: z.enum(["kanji", "word"]).optional(),
    level: levelSchema.optional(),
    written: z.string().min(1).optional(),
    reading: z.string().min(1).optional(),
    cardId: z.string().min(1).optional(),
    sourceId: z.string().min(1).optional(),
}).strict();

const tokenSchema = z.object({
    surface: z.string().min(1),
    start: z.number().int().min(0),
    end: z.number().int().positive(),
    lemma: z.string().min(1).optional(),
    reading: z.string().min(1).optional(),
    pronunciation: z.string().min(1).optional(),
    partOfSpeech: z.array(z.string().min(1)).min(1),
    conjugationType: z.string().min(1).optional(),
    conjugationForm: z.string().min(1).optional(),
    known: z.boolean().optional(),
}).strict();

const itemSchema = z.object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    target: targetSchema,
    inputText: z.string().min(1),
    normalizedText: z.string().min(1).optional(),
    tokens: z.array(tokenSchema).min(1),
    warnings: z.array(z.string().min(1)).default([]),
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

const nlpTokenizationArtifactSchema = z.object({
    version: z.literal(1),
    artifactType: z.literal("nlp_tokenization_batch"),
    generatedAt: z.string().min(1),
    generator: generatorSchema,
    runtime: runtimeEvidenceSchema,
    authority: authoritySchema,
    scope: scopeSchema,
    items: z.array(itemSchema),
}).strict();

function assertTokenCoverage(item) {
    let cursor = 0;
    for (const token of item.tokens) {
        if (token.start !== cursor) {
            throw new Error(`NLP tokenization item ${item.id} has non-contiguous token start ${token.start}; expected ${cursor}.`);
        }
        if (token.end <= token.start) {
            throw new Error(`NLP tokenization item ${item.id} has invalid token span ${token.start}-${token.end}.`);
        }
        if (item.inputText.slice(token.start, token.end) !== token.surface) {
            throw new Error(`NLP tokenization item ${item.id} token span ${token.start}-${token.end} does not match surface ${token.surface}.`);
        }
        cursor = token.end;
    }
    if (cursor !== item.inputText.length) {
        throw new Error(`NLP tokenization item ${item.id} tokens stop at ${cursor}, but input length is ${item.inputText.length}.`);
    }
}

function parseNlpTokenizationArtifact(value) {
    const parsed = nlpTokenizationArtifactSchema.parse(value);
    const seenIds = new Set();

    if (parsed.items.length > 0 && !parsed.generator.runtimeId) {
        throw new Error("NLP tokenization artifacts with items must declare generator.runtimeId.");
    }
    if (parsed.generator.runtimeId && parsed.generator.runtimeId !== parsed.runtime.runtimeId) {
        throw new Error(`NLP tokenization generator runtime ${parsed.generator.runtimeId} does not match runtime evidence ${parsed.runtime.runtimeId}.`);
    }

    for (const item of parsed.items) {
        if (seenIds.has(item.id)) {
            throw new Error(`Duplicate NLP tokenization item id: ${item.id}.`);
        }
        seenIds.add(item.id);

        if (item.target.kind !== parsed.scope.targetKind) {
            throw new Error(`NLP tokenization item ${item.id} targets ${item.target.kind}, but artifact target kind is ${parsed.scope.targetKind}.`);
        }
        if (parsed.scope.levels && item.target.level && !parsed.scope.levels.includes(item.target.level)) {
            throw new Error(`NLP tokenization item ${item.id} targets N${item.target.level}, outside artifact levels ${parsed.scope.levels.map((level) => `N${level}`).join(", ")}.`);
        }
        if (item.target.kind === "word-card" && !item.target.reading) {
            throw new Error(`NLP word-card tokenization item ${item.id} must bind target.reading.`);
        }
        assertTokenCoverage(item);
    }

    return parsed;
}

module.exports = {
    NLP_TOKENIZATION_AUTHORITY,
    NLP_TOKENIZATION_TARGET_KINDS,
    nlpTokenizationArtifactSchema,
    parseNlpTokenizationArtifact,
};
