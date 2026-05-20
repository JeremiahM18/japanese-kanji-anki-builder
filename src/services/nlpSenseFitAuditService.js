const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    NLP_SUGGESTION_AUTHORITY,
    NLP_SUGGESTION_PROMOTION_POLICY,
    parseNlpSuggestionArtifact,
} = require("../datasets/nlpSuggestionArtifact");
const {
    parseNlpEmbeddingArtifact,
} = require("../datasets/nlpEmbeddingArtifact");
const {
    buildTransformersEmbedTextFn,
    cosineSimilarity,
} = require("./nlpEmbeddingModelEvaluationService");
const {
    parseWordDeckEmbeddingRows,
} = require("./nlpEmbeddingGenerationService");
const { ensureDir } = require("../utils/fs");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";
const DEFAULT_LANE = "assistive-sense-fit-audit";
const DEFAULT_CREATED_BY = "scripts/auditNlpSenseFit.js";
const SENSE_FIT_LIMITATIONS = Object.freeze([
    "Sense-fit warnings are assistive review signals only and must not replace human Japanese/pedagogy review.",
    "Embedding similarity can miss correct examples and can over-warn short, concrete, or culturally specific sentences.",
    "Warnings must not directly write tracked templates or certify Gold, Platinum, Obsidian, or release readiness.",
]);

function sha256FileWithSize(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: filePath,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function parseCardExample(exampleSentence) {
    const [japanese = "", reading = "", english = ""] = String(exampleSentence || "")
        .split(/\s*／\s*/)
        .map((part) => part.trim());
    return {
        japanese,
        reading,
        english,
    };
}

function buildMeaningFitInput(row) {
    return [
        `word: ${row.written}`,
        `reading: ${row.reading}`,
        `meaning: ${row.meaning}`,
    ].join("\n");
}

function buildExampleFitInput(row) {
    const example = parseCardExample(row.exampleSentence);
    return [
        `word: ${row.written}`,
        `reading: ${row.reading}`,
        example.japanese ? `example: ${example.japanese}` : null,
        example.reading ? `example reading: ${example.reading}` : null,
        example.english ? `translation: ${example.english}` : null,
    ].filter(Boolean).join("\n");
}

function buildEmbeddingLookup(embeddingArtifact) {
    const lookup = new Map();
    for (const item of embeddingArtifact.items || []) {
        if (item.target.kind === "word-card" && item.target.written && item.target.reading) {
            lookup.set(`${item.target.written}|${item.target.reading}`, item);
        }
    }
    return lookup;
}

function normalizeScore(cosine) {
    return Math.max(0, Math.min(1, (cosine + 1) / 2));
}

function assertSenseFitModel({ manifest, modelId, lane }) {
    const model = manifest.models?.[modelId];
    if (!model) {
        throw new Error(`NLP sense-fit model ${modelId} is not declared in the manifest.`);
    }
    if (model.status !== "active") {
        throw new Error(`NLP sense-fit model ${modelId} is ${model.status}; expected active.`);
    }
    if (model.task !== "embedding") {
        throw new Error(`NLP sense-fit model ${modelId} task is ${model.task}; expected embedding.`);
    }
    if (!model.allowedUses.includes(lane)) {
        throw new Error(`NLP sense-fit model ${modelId} does not allow lane ${lane}.`);
    }
    return model;
}

async function scoreSenseFitRow({ row, anchorVector, embedTextFn }) {
    const meaningVector = await embedTextFn(buildMeaningFitInput(row));
    const exampleVector = await embedTextFn(buildExampleFitInput(row));
    const meaningExampleCosine = cosineSimilarity(meaningVector, exampleVector);
    const anchorExampleCosine = cosineSimilarity(anchorVector, exampleVector);
    const example = parseCardExample(row.exampleSentence);
    const parseWarnings = [];

    if (!example.japanese || !example.reading || !example.english) {
        parseWarnings.push("Generated example field is missing Japanese, reading, or English translation segment.");
    }

    return {
        targetId: `${row.written}|${row.reading}`,
        example,
        meaningExampleCosine,
        anchorExampleCosine,
        normalizedMeaningExampleScore: normalizeScore(meaningExampleCosine),
        normalizedAnchorExampleScore: normalizeScore(anchorExampleCosine),
        parseWarnings,
    };
}

function shouldWarnSenseFit(score, threshold) {
    return score.normalizedMeaningExampleScore < threshold
        || score.normalizedAnchorExampleScore < threshold
        || score.parseWarnings.length > 0;
}

function buildSenseFitSuggestion({ row, score, index, level, lane, threshold, wordTsvPath, embeddingArtifactPath, embeddingArtifactHash }) {
    const riskScore = Math.max(
        1 - score.normalizedMeaningExampleScore,
        1 - score.normalizedAnchorExampleScore,
        score.parseWarnings.length > 0 ? 1 : 0
    );
    const warningText = score.parseWarnings.length > 0
        ? score.parseWarnings.join(" ")
        : `Meaning/example semantic score ${score.normalizedMeaningExampleScore.toFixed(6)} or anchor/example score ${score.normalizedAnchorExampleScore.toFixed(6)} fell below threshold ${threshold}.`;

    return {
        id: `n${level}-word-sense-fit-${String(index + 1).padStart(4, "0")}`,
        task: lane,
        action: "warn",
        target: {
            deckKind: "word",
            level,
            written: row.written,
            reading: row.reading,
        },
        score: riskScore,
        summary: `Review possible sense-fit issue for ${score.targetId}: ${warningText}`,
        rationale: "Embedding similarity flagged this generated word card for human review of meaning, example sentence, reading, and translation alignment.",
        evidence: [
            {
                sourceType: "generated-row",
                sourceId: score.targetId,
                path: wordTsvPath,
                excerpt: `${row.meaning} / ${row.exampleSentence}`,
                note: `Generated row meaning and example checked for ${score.targetId}.`,
            },
            {
                sourceType: "model-score",
                sourceId: `${score.targetId}:sense-fit`,
                note: `meaning/example cosine ${score.meaningExampleCosine.toFixed(6)} normalized ${score.normalizedMeaningExampleScore.toFixed(6)}; anchor/example cosine ${score.anchorExampleCosine.toFixed(6)} normalized ${score.normalizedAnchorExampleScore.toFixed(6)}; threshold ${threshold}.`,
            },
            {
                sourceType: "model-score",
                path: embeddingArtifactPath,
                sha256: embeddingArtifactHash.sha256,
                note: `Anchor word-card embedding artifact hash ${embeddingArtifactHash.sha256} bound to ${score.targetId}.`,
            },
        ],
        limitations: [...SENSE_FIT_LIMITATIONS],
        promotion: { ...NLP_SUGGESTION_PROMOTION_POLICY },
    };
}

async function buildNlpSenseFitArtifact({
    wordTsvPath,
    embeddingArtifactPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    modelId = DEFAULT_MODEL_ID,
    lane = DEFAULT_LANE,
    limit = null,
    threshold = 0.8,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildEmbedTextFn = buildTransformersEmbedTextFn,
} = {}) {
    if (!wordTsvPath) {
        throw new Error("wordTsvPath is required for NLP sense-fit audit.");
    }
    if (!embeddingArtifactPath) {
        throw new Error("embeddingArtifactPath is required for NLP sense-fit audit.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP sense-fit level must be an integer from 1 to 5.");
    }
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
        throw new Error("NLP sense-fit threshold must be a number from 0 to 1.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedWordTsvPath = path.resolve(wordTsvPath);
    const resolvedEmbeddingArtifactPath = path.resolve(embeddingArtifactPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const model = assertSenseFitModel({ manifest, modelId, lane });
    const embeddingArtifact = parseNlpEmbeddingArtifact(JSON.parse(fs.readFileSync(resolvedEmbeddingArtifactPath, "utf8")));
    if (embeddingArtifact.model.modelId !== modelId) {
        throw new Error(`Embedding artifact model ${embeddingArtifact.model.modelId} does not match sense-fit model ${modelId}.`);
    }
    const embeddingLookup = buildEmbeddingLookup(embeddingArtifact);
    const rows = parseWordDeckEmbeddingRows(fs.readFileSync(resolvedWordTsvPath, "utf8"));
    const scopedRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    const embedTextFn = await buildEmbedTextFn({
        model,
        cacheDir,
        allowRemoteModels,
    });
    const wordTsvHash = sha256FileWithSize(resolvedWordTsvPath);
    const embeddingArtifactHash = sha256FileWithSize(resolvedEmbeddingArtifactPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const suggestions = [];

    for (const row of scopedRows) {
        const targetId = `${row.written}|${row.reading}`;
        const anchor = embeddingLookup.get(targetId);
        if (!anchor) {
            continue;
        }
        const score = await scoreSenseFitRow({
            row,
            anchorVector: anchor.embedding.vector,
            embedTextFn,
        });
        if (!shouldWarnSenseFit(score, threshold)) {
            continue;
        }
        suggestions.push(buildSenseFitSuggestion({
            row,
            score,
            index: suggestions.length,
            level,
            lane,
            threshold,
            wordTsvPath: path.relative(resolvedWorkspaceRoot, resolvedWordTsvPath).replace(/\\/g, "/"),
            embeddingArtifactPath: path.relative(resolvedWorkspaceRoot, resolvedEmbeddingArtifactPath).replace(/\\/g, "/"),
            embeddingArtifactHash,
        }));
    }

    const artifact = {
        version: 1,
        artifactType: "nlp_suggestion_batch",
        generatedAt: now().toISOString(),
        generator: {
            modelId,
            runId: `${modelId}-sense-fit-n${level}-${wordTsvHash.sha256.slice(0, 12)}`,
            manifestPath: path.relative(resolvedWorkspaceRoot, resolvedManifestPath).replace(/\\/g, "/"),
            createdBy,
            inputHashes: [wordTsvHash, embeddingArtifactHash, manifestHash].map((entry) => ({
                path: path.relative(resolvedWorkspaceRoot, entry.path).replace(/\\/g, "/"),
                sha256: entry.sha256,
                byteSize: entry.byteSize,
            })),
        },
        authority: { ...NLP_SUGGESTION_AUTHORITY },
        scope: {
            deckKind: "word",
            levels: [level],
            lane,
            description: `Assistive sense-fit warning audit for JLPT N${level} word-card review packets.`,
        },
        suggestions,
    };

    return parseNlpSuggestionArtifact(artifact);
}

async function writeNlpSenseFitArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP sense-fit audit.");
    }
    const artifact = await buildNlpSenseFitArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
    };
}

function formatNlpSenseFitSummary({ outPath, artifact }) {
    return [
        "Japanese Kanji Builder NLP Sense-Fit Audit",
        "",
        `Artifact: ${outPath}`,
        `Model: ${artifact.generator.modelId}`,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.deckKind}`,
        `Warnings: ${artifact.suggestions.length}`,
        "",
        "Release boundary:",
        `- sense-fit warnings certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- sense-fit warnings may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].join("\n");
}

module.exports = {
    buildExampleFitInput,
    buildMeaningFitInput,
    buildNlpSenseFitArtifact,
    formatNlpSenseFitSummary,
    parseCardExample,
    scoreSenseFitRow,
    shouldWarnSenseFit,
    writeNlpSenseFitArtifact,
};
