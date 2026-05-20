const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const ALLOWED_NLP_USES = [
    "assistive-candidate-discovery",
    "assistive-example-reranking",
    "assistive-sense-fit-audit",
    "assistive-duplicate-clustering",
    "assistive-level-fit-audit",
    "assistive-review-prioritization",
    "assistive-draft-proposal",
];

const DISALLOWED_NLP_USES = [
    "direct-template-write",
    "gold-approval",
    "platinum-approval",
    "obsidian-certification",
    "release-readiness-claim",
];

const NLP_RUNTIME_TASKS = [
    "tokenization",
    "embedding",
    "classification",
    "reranking",
];

const allowedUseSchema = z.enum(ALLOWED_NLP_USES);
const disallowedUseSchema = z.enum(DISALLOWED_NLP_USES);
const runtimeTaskSchema = z.enum(NLP_RUNTIME_TASKS);

const modelStatusSchema = z.enum(["registered", "active", "blocked", "retired"]);
const runtimeStatusSchema = z.enum(["registered", "active", "blocked", "retired"]);

const originSchema = z.object({
    url: z.string().url().optional(),
    localPath: z.string().min(1).optional(),
    huggingFaceModelId: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
}).strict();

const licenseUseSchema = z.object({
    status: z.enum(["approved", "needs_review", "blocked"]),
    license: z.string().min(1).optional(),
    notes: z.string().min(1),
}).strict();

const localArtifactSchema = z.object({
    artifactKind: z.enum(["file", "directory"]).default("file"),
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
    fileCount: z.number().int().positive().optional(),
}).strict();

const runtimeDictionarySchema = z.object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    byteSize: z.number().int().positive(),
    fileCount: z.number().int().positive(),
}).strict();

const runtimeSchema = z.object({
    name: z.string().min(1),
    status: runtimeStatusSchema,
    runtimeType: z.enum(["javascript", "external-worker"]),
    packageName: z.string().min(1).optional(),
    packageVersion: z.string().min(1).optional(),
    packageIntegrity: z.string().min(1).optional(),
    origin: originSchema,
    licenseUse: licenseUseSchema,
    allowedTasks: z.array(runtimeTaskSchema).min(1),
    dictionary: runtimeDictionarySchema.optional(),
    checkedAt: z.string().min(1),
}).strict();

const modelEvaluationSchema = z.object({
    benchmarkId: z.string().min(1),
    benchmarkPath: z.string().min(1),
    evaluatedAt: z.string().min(1),
    metrics: z.record(z.string().min(1), z.number()),
    limitations: z.array(z.string().min(1)).min(1),
}).strict();

const modelDeterminismSchema = z.object({
    requiresPinnedModel: z.literal(true),
    requiresPinnedInputs: z.literal(true),
    requiresPinnedRuntime: z.literal(true),
    seedPolicy: z.enum(["not-applicable", "fixed-seed-required"]),
}).strict();

const embeddingConfigSchema = z.object({
    embeddingDimension: z.number().int().positive(),
    pooling: z.enum(["model-default", "mean", "cls", "none"]),
    normalized: z.boolean(),
    distanceMetric: z.enum(["cosine", "dot-product", "euclidean"]),
    dtype: z.string().min(1).optional(),
}).strict();

const modelSchema = z.object({
    name: z.string().min(1),
    status: modelStatusSchema,
    runtimeId: z.string().min(1),
    task: runtimeTaskSchema,
    modelFamily: z.string().min(1),
    modelVersion: z.string().min(1),
    origin: originSchema,
    licenseUse: licenseUseSchema,
    allowedUses: z.array(allowedUseSchema).default([]),
    disallowedUses: z.array(disallowedUseSchema).default([]),
    outputAuthority: z.literal("assistive_only"),
    promotionPolicy: z.literal("human_review_required"),
    deterministic: modelDeterminismSchema,
    embeddingConfig: embeddingConfigSchema.optional(),
    checkedAt: z.string().min(1),
    localArtifact: localArtifactSchema.optional(),
    evaluation: modelEvaluationSchema.optional(),
}).strict();

const nlpModelManifestSchema = z.object({
    version: z.literal(1),
    checkedAt: z.string().min(1),
    policy: z.object({
        authority: z.literal("assistive_only"),
        description: z.string().min(1),
        allowedUses: z.array(allowedUseSchema).min(1),
        disallowedUses: z.array(disallowedUseSchema).min(1),
        promotionPolicy: z.literal("human_review_required"),
    }).strict(),
    runtimes: z.record(z.string().min(1), runtimeSchema),
    models: z.record(z.string().min(1), modelSchema),
}).strict();

function buildDefaultNlpModelManifestPath() {
    return path.resolve(__dirname, "../../templates/nlp_model_manifest.json");
}

function assertNoOverlap(label, valuesA = [], valuesB = []) {
    const bSet = new Set(valuesB);
    const overlap = valuesA.filter((value) => bSet.has(value));
    if (overlap.length > 0) {
        throw new Error(`${label} cannot both allow and disallow: ${overlap.join(", ")}.`);
    }
}

function parseNlpModelManifest(value) {
    const parsed = nlpModelManifestSchema.parse(value);
    assertNoOverlap("NLP model policy", parsed.policy.allowedUses, parsed.policy.disallowedUses);

    const policyAllowedUses = new Set(parsed.policy.allowedUses);
    const policyDisallowedUses = new Set(parsed.policy.disallowedUses);

    for (const [runtimeId, runtime] of Object.entries(parsed.runtimes)) {
        if (runtime.status === "active" && runtime.licenseUse.status !== "approved") {
            throw new Error(`Active NLP runtime ${runtimeId} must have approved license/use status.`);
        }
        if (runtime.status === "active" && runtime.runtimeType === "javascript") {
            if (!runtime.packageName) {
                throw new Error(`Active JavaScript NLP runtime ${runtimeId} must declare packageName.`);
            }
            if (!runtime.packageVersion) {
                throw new Error(`Active JavaScript NLP runtime ${runtimeId} must declare packageVersion.`);
            }
            if (!runtime.packageIntegrity) {
                throw new Error(`Active JavaScript NLP runtime ${runtimeId} must declare packageIntegrity.`);
            }
        }
        if (runtime.status === "active" && runtime.allowedTasks.includes("tokenization") && !runtime.dictionary) {
            throw new Error(`Active tokenization NLP runtime ${runtimeId} must pin dictionary evidence.`);
        }
        if (runtime.status === "blocked" && runtime.allowedTasks.length > 0) {
            throw new Error(`Blocked NLP runtime ${runtimeId} must not allow tasks.`);
        }
    }

    for (const [modelId, model] of Object.entries(parsed.models)) {
        const runtime = parsed.runtimes[model.runtimeId];
        if (!runtime) {
            throw new Error(`NLP model ${modelId} references missing runtime ${model.runtimeId}.`);
        }
        if (!runtime.allowedTasks.includes(model.task)) {
            throw new Error(`NLP model ${modelId} uses task ${model.task}, but runtime ${model.runtimeId} does not allow it.`);
        }
        assertNoOverlap(`NLP model ${modelId}`, model.allowedUses, model.disallowedUses);
        for (const use of model.allowedUses) {
            if (!policyAllowedUses.has(use)) {
                throw new Error(`NLP model ${modelId} allows ${use}, but the global NLP policy does not allow it.`);
            }
        }
        for (const use of model.disallowedUses) {
            if (!policyDisallowedUses.has(use)) {
                throw new Error(`NLP model ${modelId} disallows ${use}, but the global NLP policy does not track that disallowed use.`);
            }
        }
        if (model.status === "blocked" && model.allowedUses.length > 0) {
            throw new Error(`Blocked NLP model ${modelId} must not allow active use.`);
        }
        if (model.status === "active") {
            if (runtime.status !== "active") {
                throw new Error(`Active NLP model ${modelId} requires active runtime ${model.runtimeId}.`);
            }
            if (model.licenseUse.status !== "approved") {
                throw new Error(`Active NLP model ${modelId} must have approved license/use status.`);
            }
            if (!model.localArtifact) {
                throw new Error(`Active NLP model ${modelId} must pin a local model artifact.`);
            }
            if (model.localArtifact.artifactKind === "directory" && !model.localArtifact.fileCount) {
                throw new Error(`Active NLP model ${modelId} directory artifact must pin fileCount.`);
            }
            if (!model.evaluation) {
                throw new Error(`Active NLP model ${modelId} must include tracked evaluation evidence.`);
            }
            if (model.task === "embedding" && !model.embeddingConfig) {
                throw new Error(`Active embedding NLP model ${modelId} must declare embeddingConfig.`);
            }
            if (model.allowedUses.length === 0) {
                throw new Error(`Active NLP model ${modelId} must declare at least one allowed assistive use.`);
            }
        }
    }

    return parsed;
}

function loadNlpModelManifest(manifestPath = buildDefaultNlpModelManifestPath()) {
    const resolvedPath = path.resolve(manifestPath);
    return {
        ...parseNlpModelManifest(JSON.parse(fs.readFileSync(resolvedPath, "utf8"))),
        manifestPath: resolvedPath,
    };
}

module.exports = {
    ALLOWED_NLP_USES,
    buildDefaultNlpModelManifestPath,
    DISALLOWED_NLP_USES,
    loadNlpModelManifest,
    NLP_RUNTIME_TASKS,
    nlpModelManifestSchema,
    parseNlpModelManifest,
};
