const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    NLP_EMBEDDING_AUTHORITY,
    parseNlpEmbeddingArtifact,
} = require("../datasets/nlpEmbeddingArtifact");
const {
    buildTransformersEmbedTextFn,
} = require("./nlpEmbeddingModelEvaluationService");
const { ensureDir } = require("../utils/fs");
const {
    buildArtifactInputHashes,
    buildReuseResult,
    inputHashesMatch,
    modelEvidenceMatches,
    parametersMatch,
    tryReadReusableArtifact,
} = require("./nlpArtifactReuseService");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";
const DEFAULT_CREATED_BY = "scripts/generateNlpEmbeddings.js";
const DEFAULT_LANE = "assistive-example-reranking";
const REUSE_POLICY_VERSION = 1;
const EMBEDDING_LIMITATIONS = Object.freeze([
    "Embedding artifacts are assistive-only review signals and must be human-reviewed before any learner-facing card change.",
    "Embedding artifacts are not source evidence and do not certify Gold, Platinum, Obsidian, or release readiness.",
    "Semantic similarity can miss Japanese sense, register, level-fit, and example-naturalness problems.",
]);

function sha256FileWithSize(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: filePath,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function parseTsv(tsvText) {
    const lines = String(tsvText || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) {
        return {
            header: [],
            rows: [],
        };
    }

    const header = lines[0].split("\t");
    const rows = lines.slice(1).map((line) => {
        const columns = line.split("\t");
        return Object.fromEntries(header.map((name, index) => [name, columns[index] || ""]));
    });

    return { header, rows };
}

function parseWordDeckEmbeddingRows(tsvText) {
    const { header, rows } = parseTsv(tsvText);
    for (const fieldName of ["Word", "Reading", "Meaning", "ExampleSentence"]) {
        if (!header.includes(fieldName)) {
            throw new Error(`Word embedding TSV is missing required ${fieldName} column.`);
        }
    }

    return rows
        .map((row, index) => ({
            rowNumber: index + 2,
            written: String(row.Word || "").trim(),
            reading: String(row.Reading || "").trim(),
            meaning: String(row.Meaning || "").trim(),
            exampleSentence: String(row.ExampleSentence || "").trim(),
            jlptLevel: String(row.JLPTLevel || "").trim(),
            notes: String(row.Notes || "").trim(),
        }))
        .filter((row) => row.written && row.reading);
}

function assertEmbeddingModel({ manifest, modelId, lane }) {
    const model = manifest.models?.[modelId];
    if (!model) {
        throw new Error(`NLP embedding model ${modelId} is not declared in the manifest.`);
    }
    if (model.status !== "active") {
        throw new Error(`NLP embedding model ${modelId} is ${model.status}; expected active.`);
    }
    if (model.licenseUse?.status !== "approved") {
        throw new Error(`NLP embedding model ${modelId} does not have approved license/use status.`);
    }
    if (model.task !== "embedding") {
        throw new Error(`NLP model ${modelId} task is ${model.task}; expected embedding.`);
    }
    if (!model.allowedUses.includes(lane)) {
        throw new Error(`NLP embedding model ${modelId} does not allow lane ${lane}.`);
    }
    if (!model.embeddingConfig) {
        throw new Error(`NLP embedding model ${modelId} must declare embeddingConfig.`);
    }
    return model;
}

function normalizeExampleForEmbedding(exampleSentence) {
    return String(exampleSentence || "")
        .replace(/\s*／\s*/g, " / ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildWordEmbeddingInput(row) {
    const parts = [
        `word: ${row.written}`,
        `reading: ${row.reading}`,
        row.meaning ? `meaning: ${row.meaning}` : null,
        row.exampleSentence ? `example: ${normalizeExampleForEmbedding(row.exampleSentence)}` : null,
        row.notes ? `notes: ${row.notes}` : null,
    ].filter(Boolean);
    return parts.join("\n");
}

function buildWordEmbeddingGeneratorParameters({ level, lane, limit }) {
    const fullScope = !Number.isFinite(limit);
    return {
        task: "word-embedding-generation",
        reusePolicyVersion: REUSE_POLICY_VERSION,
        level,
        lane,
        fullScope,
        limit: fullScope ? null : limit,
    };
}

function buildNlpWordEmbeddingRunContext({
    wordTsvPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    modelId = DEFAULT_MODEL_ID,
    lane = DEFAULT_LANE,
    limit = null,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildEmbedTextFn = buildTransformersEmbedTextFn,
} = {}) {
    if (!wordTsvPath) {
        throw new Error("wordTsvPath is required for NLP word embedding generation.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP word embedding level must be an integer from 1 to 5.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedWordTsvPath = path.resolve(wordTsvPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const model = assertEmbeddingModel({ manifest, modelId, lane });
    const rows = parseWordDeckEmbeddingRows(fs.readFileSync(resolvedWordTsvPath, "utf8"));
    const scopedRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    const wordTsvHash = sha256FileWithSize(resolvedWordTsvPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const inputHashes = buildArtifactInputHashes([wordTsvHash, manifestHash], resolvedWorkspaceRoot);
    const parameters = buildWordEmbeddingGeneratorParameters({ level, lane, limit });

    return {
        allowRemoteModels,
        buildEmbedTextFn,
        cacheDir,
        createdBy,
        inputHashes,
        lane,
        level,
        manifest,
        manifestPath: resolvedManifestPath,
        model,
        modelId,
        now,
        parameters,
        rows,
        scopedRows,
        wordTsvHash,
        workspaceRoot: resolvedWorkspaceRoot,
    };
}

function wordEmbeddingItemsMatchRows(artifact, rows, level) {
    if (!Array.isArray(artifact.items) || artifact.items.length !== rows.length) {
        return false;
    }
    return rows.every((row, index) => {
        const item = artifact.items[index];
        const expectedInput = buildWordEmbeddingInput(row);
        return item
            && item.id === `n${level}-word-embedding-${String(index + 1).padStart(4, "0")}`
            && item.target?.kind === "word-card"
            && item.target?.deckKind === "word"
            && item.target?.level === level
            && item.target?.written === row.written
            && item.target?.reading === row.reading
            && item.inputText === expectedInput
            && item.normalizedText === expectedInput;
    });
}

function findReusableWordEmbeddingArtifact(outPath, context) {
    if (!context.parameters.fullScope) {
        return null;
    }
    const artifact = tryReadReusableArtifact(outPath, parseNlpEmbeddingArtifact);
    if (!artifact) {
        return null;
    }
    if (!parametersMatch(artifact.generator.parameters, context.parameters)) {
        return null;
    }
    if (!inputHashesMatch(artifact.generator.inputHashes, context.inputHashes)) {
        return null;
    }
    if (!modelEvidenceMatches(artifact.model, context.model, context.modelId)) {
        return null;
    }
    if (artifact.scope.targetKind !== "word-card"
        || artifact.scope.deckKind !== "word"
        || artifact.scope.source !== "generated-word-rows"
        || artifact.scope.lane !== context.lane
        || artifact.scope.levels?.length !== 1
        || artifact.scope.levels[0] !== context.level) {
        return null;
    }
    if (!wordEmbeddingItemsMatchRows(artifact, context.rows, context.level)) {
        return null;
    }
    return artifact;
}

function vectorMagnitude(vector = []) {
    return Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
}

async function buildEmbeddingItems({ rows, level, embedTextFn }) {
    const items = [];
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const inputText = buildWordEmbeddingInput(row);
        const vector = await embedTextFn(inputText);
        items.push({
            id: `n${level}-word-embedding-${String(index + 1).padStart(4, "0")}`,
            target: {
                kind: "word-card",
                deckKind: "word",
                level,
                written: row.written,
                reading: row.reading,
            },
            inputText,
            normalizedText: inputText,
            embedding: {
                vector,
                magnitude: vectorMagnitude(vector),
            },
            warnings: [],
            limitations: [...EMBEDDING_LIMITATIONS],
        });
    }
    return items;
}

async function buildNlpWordEmbeddingArtifact({
    context = null,
    ...options
} = {}) {
    const runContext = context || buildNlpWordEmbeddingRunContext(options);
    const embedTextFn = await runContext.buildEmbedTextFn({
        model: runContext.model,
        cacheDir: runContext.cacheDir,
        allowRemoteModels: runContext.allowRemoteModels,
    });
    const artifact = {
        version: 1,
        artifactType: "nlp_embedding_batch",
        generatedAt: runContext.now().toISOString(),
        generator: {
            modelId: runContext.modelId,
            runId: `${runContext.modelId}-word-n${runContext.level}-${runContext.wordTsvHash.sha256.slice(0, 12)}`,
            manifestPath: path.relative(runContext.workspaceRoot, runContext.manifestPath).replace(/\\/g, "/"),
            createdBy: runContext.createdBy,
            parameters: runContext.parameters,
            inputHashes: runContext.inputHashes,
        },
        model: {
            modelId: runContext.modelId,
            runtimeId: runContext.model.runtimeId,
            modelFamily: runContext.model.modelFamily,
            modelVersion: runContext.model.modelVersion,
            embeddingDimension: runContext.model.embeddingConfig.embeddingDimension,
            pooling: runContext.model.embeddingConfig.pooling,
            normalized: runContext.model.embeddingConfig.normalized,
            distanceMetric: runContext.model.embeddingConfig.distanceMetric,
            deterministic: {
                requiresPinnedModel: true,
                requiresPinnedRuntime: true,
                requiresPinnedInputs: true,
            },
        },
        authority: { ...NLP_EMBEDDING_AUTHORITY },
        scope: {
            targetKind: "word-card",
            deckKind: "word",
            levels: [runContext.level],
            source: "generated-word-rows",
            lane: runContext.lane,
            description: `Generated word TSV embeddings for JLPT N${runContext.level} word-card review signals.`,
        },
        items: await buildEmbeddingItems({
            rows: runContext.scopedRows,
            level: runContext.level,
            embedTextFn,
        }),
    };

    return parseNlpEmbeddingArtifact(artifact);
}

async function writeNlpWordEmbeddingArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP word embedding generation.");
    }
    const resolvedOutPath = path.resolve(outPath);
    const context = buildNlpWordEmbeddingRunContext(options);
    const reusableArtifact = findReusableWordEmbeddingArtifact(resolvedOutPath, context);
    if (reusableArtifact) {
        return buildReuseResult({
            outPath: resolvedOutPath,
            artifact: reusableArtifact,
        });
    }
    const artifact = await buildNlpWordEmbeddingArtifact({
        ...options,
        context,
    });
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
        skipped: false,
    };
}

function formatNlpEmbeddingGenerationSummary({ outPath, artifact, skipped = false }) {
    return [
        "Japanese Kanji Builder NLP Embedding Generation",
        "",
        `Artifact: ${outPath}`,
        `Status: ${skipped ? "reused unchanged artifact" : "generated artifact"}`,
        `Model: ${artifact.model.modelId}`,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.targetKind}`,
        `Lane: ${artifact.scope.lane}`,
        `Items: ${artifact.items.length}`,
        `Dimension: ${artifact.model.embeddingDimension}`,
        "",
        "Release boundary:",
        `- embedding artifacts certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- embedding artifacts may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].join("\n");
}

module.exports = {
    buildNlpWordEmbeddingArtifact,
    buildWordEmbeddingInput,
    formatNlpEmbeddingGenerationSummary,
    parseWordDeckEmbeddingRows,
    writeNlpWordEmbeddingArtifact,
};
