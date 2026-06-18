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
    loadSentenceCorpus,
} = require("../datasets/sentenceCorpus");
const {
    buildTransformersEmbedTextFn,
    cosineSimilarity,
} = require("./nlpEmbeddingModelEvaluationService");
const {
    parseWordDeckEmbeddingRows,
} = require("./nlpEmbeddingGenerationService");
const {
    normalizeJapaneseReading,
} = require("../utils/japanese");
const { ensureDir } = require("../utils/fs");
const {
    buildArtifactInputHashes,
    buildReuseResult,
    inputHashesMatch,
    parametersMatch,
    tryReadReusableArtifact,
} = require("./nlpArtifactReuseService");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";
const DEFAULT_LANE = "assistive-example-reranking";
const DEFAULT_CREATED_BY = "scripts/rerankNlpExamples.js";
const REUSE_POLICY_VERSION = 1;
const EXAMPLE_RERANKING_LIMITATIONS = Object.freeze([
    "Example reranking is an assistive review signal only and must not replace human Japanese/pedagogy review.",
    "High semantic similarity does not prove naturalness, level fit, reading accuracy, translation quality, or source truth.",
    "Reranking artifacts must not directly write tracked templates or certify Gold, Sapphire, Platinum, Obsidian, or release readiness.",
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

function buildExampleCandidateInput({ row, candidate }) {
    return [
        `word: ${row.written}`,
        `reading: ${row.reading}`,
        row.meaning ? `meaning: ${row.meaning}` : null,
        `example: ${candidate.japanese}`,
        candidate.reading ? `example reading: ${candidate.reading}` : null,
        candidate.english ? `translation: ${candidate.english}` : null,
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

function candidateReadingMatches(row, candidate) {
    if (!candidate.reading) {
        return true;
    }
    const normalizedCandidateReading = normalizeJapaneseReading(candidate.reading);
    const normalizedRowReading = normalizeJapaneseReading(row.reading);
    return normalizedCandidateReading.includes(normalizedRowReading);
}

function collectExampleCandidates(row, sentenceCorpus = []) {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (candidate) => {
        if (!candidate.japanese || !candidate.english) {
            return;
        }
        const key = [candidate.japanese, candidate.reading || "", candidate.english].join("|");
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        candidates.push(candidate);
    };
    const current = parseCardExample(row.exampleSentence);

    addCandidate({
        id: "current-generated-example",
        sourceType: "generated-row",
        sourceId: `${row.written}|${row.reading}`,
        japanese: current.japanese,
        reading: current.reading,
        english: current.english,
        note: "Current generated card example.",
    });

    for (const entry of sentenceCorpus) {
        if (entry.written !== row.written) {
            continue;
        }
        if (!candidateReadingMatches(row, entry)) {
            continue;
        }
        addCandidate({
            id: `corpus:${entry.source || "local-corpus"}:${entry.japanese}`,
            sourceType: "corpus",
            sourceId: [entry.source || "local-corpus", entry.kanji, entry.written, entry.japanese].join("|"),
            japanese: entry.japanese,
            reading: entry.reading || "",
            english: entry.english,
            note: `Sentence corpus candidate from ${entry.source || "local-corpus"}.`,
        });
    }

    return candidates;
}

function normalizeScore(cosine) {
    return Math.max(0, Math.min(1, (cosine + 1) / 2));
}

async function rankExampleCandidates({ row, anchorVector, candidates, embedTextFn }) {
    const ranked = [];
    for (const candidate of candidates) {
        const vector = await embedTextFn(buildExampleCandidateInput({ row, candidate }));
        const cosine = cosineSimilarity(anchorVector, vector);
        ranked.push({
            ...candidate,
            cosine,
            score: normalizeScore(cosine),
        });
    }

    return ranked
        .sort((a, b) => (b.score - a.score)
            || (a.sourceType === "generated-row" ? -1 : 1)
            || a.japanese.localeCompare(b.japanese))
        .map((candidate, index) => ({
            ...candidate,
            rank: index + 1,
        }));
}

function assertExampleRerankingModel({ manifest, modelId, lane }) {
    const model = manifest.models?.[modelId];
    if (!model) {
        throw new Error(`NLP example reranking model ${modelId} is not declared in the manifest.`);
    }
    if (model.status !== "active") {
        throw new Error(`NLP example reranking model ${modelId} is ${model.status}; expected active.`);
    }
    if (model.task !== "embedding") {
        throw new Error(`NLP example reranking model ${modelId} task is ${model.task}; expected embedding.`);
    }
    if (!model.allowedUses.includes(lane)) {
        throw new Error(`NLP example reranking model ${modelId} does not allow lane ${lane}.`);
    }
    return model;
}

function buildExampleRerankingGeneratorParameters({ level, lane, limit, minCandidates }) {
    const fullScope = !Number.isFinite(limit);
    return {
        task: "word-example-reranking",
        reusePolicyVersion: REUSE_POLICY_VERSION,
        level,
        lane,
        fullScope,
        limit: fullScope ? null : limit,
        minCandidates,
    };
}

function buildExampleRerankingReuseContext({
    wordTsvPath,
    sentenceCorpusPath,
    embeddingArtifactPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    modelId = DEFAULT_MODEL_ID,
    lane = DEFAULT_LANE,
    limit = null,
    minCandidates = 2,
    loadManifestFn = loadNlpModelManifest,
} = {}) {
    if (!wordTsvPath) {
        throw new Error("wordTsvPath is required for NLP example reranking.");
    }
    if (!sentenceCorpusPath) {
        throw new Error("sentenceCorpusPath is required for NLP example reranking.");
    }
    if (!embeddingArtifactPath) {
        throw new Error("embeddingArtifactPath is required for NLP example reranking.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP example reranking level must be an integer from 1 to 5.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedWordTsvPath = path.resolve(wordTsvPath);
    const resolvedSentenceCorpusPath = path.resolve(sentenceCorpusPath);
    const resolvedEmbeddingArtifactPath = path.resolve(embeddingArtifactPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    assertExampleRerankingModel({ manifest, modelId, lane });
    const embeddingArtifact = parseNlpEmbeddingArtifact(JSON.parse(fs.readFileSync(resolvedEmbeddingArtifactPath, "utf8")));
    if (embeddingArtifact.model.modelId !== modelId) {
        throw new Error(`Embedding artifact model ${embeddingArtifact.model.modelId} does not match reranking model ${modelId}.`);
    }
    const wordTsvHash = sha256FileWithSize(resolvedWordTsvPath);
    const sentenceCorpusHash = sha256FileWithSize(resolvedSentenceCorpusPath);
    const embeddingArtifactHash = sha256FileWithSize(resolvedEmbeddingArtifactPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const inputHashes = buildArtifactInputHashes([
        wordTsvHash,
        sentenceCorpusHash,
        embeddingArtifactHash,
        manifestHash,
    ], resolvedWorkspaceRoot);
    const parameters = buildExampleRerankingGeneratorParameters({
        level,
        lane,
        limit,
        minCandidates,
    });

    return {
        inputHashes,
        lane,
        level,
        modelId,
        parameters,
        wordTsvHash,
    };
}

function findReusableExampleRerankingArtifact(outPath, context) {
    if (!context.parameters.fullScope) {
        return null;
    }
    const artifact = tryReadReusableArtifact(outPath, parseNlpSuggestionArtifact);
    if (!artifact) {
        return null;
    }
    if (artifact.generator.modelId !== context.modelId) {
        return null;
    }
    if (!parametersMatch(artifact.generator.parameters, context.parameters)) {
        return null;
    }
    if (!inputHashesMatch(artifact.generator.inputHashes, context.inputHashes)) {
        return null;
    }
    if (artifact.scope.deckKind !== "word"
        || artifact.scope.lane !== context.lane
        || artifact.scope.levels?.length !== 1
        || artifact.scope.levels[0] !== context.level) {
        return null;
    }
    return artifact;
}

function buildSuggestion({ row, topCandidate, rankedCandidates, index, level, lane, wordTsvPath, sentenceCorpusPath, embeddingArtifactPath, embeddingArtifactHash }) {
    const currentRank = rankedCandidates.find((candidate) => candidate.sourceType === "generated-row")?.rank || null;
    const rankText = currentRank ? `Current generated example rank: ${currentRank} of ${rankedCandidates.length}.` : "Current generated example was not rankable.";
    const targetId = `${row.written}|${row.reading}`;
    const candidatePath = topCandidate.sourceType === "corpus" ? sentenceCorpusPath : wordTsvPath;

    return {
        id: `n${level}-word-example-rerank-${String(index + 1).padStart(4, "0")}`,
        task: lane,
        action: "rank",
        target: {
            deckKind: "word",
            level,
            written: row.written,
            reading: row.reading,
        },
        score: topCandidate.score,
        rank: 1,
        summary: `Review top-ranked example candidate for ${targetId}: ${topCandidate.japanese}`,
        rationale: `Embedding similarity ranked this candidate first among ${rankedCandidates.length} exact written-reading candidates. ${rankText}`,
        evidence: [
            {
                sourceType: "generated-row",
                sourceId: targetId,
                path: wordTsvPath,
                note: `Generated row identity and current example checked for ${targetId}: ${row.exampleSentence}`,
            },
            {
                sourceType: topCandidate.sourceType,
                sourceId: topCandidate.sourceId,
                path: candidatePath,
                excerpt: `${topCandidate.japanese} / ${topCandidate.reading || "no reading"} / ${topCandidate.english}`,
                note: topCandidate.note,
            },
            {
                sourceType: "model-score",
                sourceId: `${targetId}:rank-1`,
                note: `Cosine similarity ${topCandidate.cosine.toFixed(6)}; normalized score ${topCandidate.score.toFixed(6)}; ${rankText}`,
            },
            {
                sourceType: "model-score",
                path: embeddingArtifactPath,
                sha256: embeddingArtifactHash.sha256,
                note: `Anchor word-card embedding artifact hash ${embeddingArtifactHash.sha256} bound to ${targetId}.`,
            },
        ],
        limitations: [...EXAMPLE_RERANKING_LIMITATIONS],
        promotion: { ...NLP_SUGGESTION_PROMOTION_POLICY },
    };
}

async function buildNlpExampleRerankingArtifact({
    wordTsvPath,
    sentenceCorpusPath,
    embeddingArtifactPath,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    modelId = DEFAULT_MODEL_ID,
    lane = DEFAULT_LANE,
    limit = null,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    minCandidates = 2,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    loadSentenceCorpusFn = loadSentenceCorpus,
    buildEmbedTextFn = buildTransformersEmbedTextFn,
} = {}) {
    if (!wordTsvPath) {
        throw new Error("wordTsvPath is required for NLP example reranking.");
    }
    if (!sentenceCorpusPath) {
        throw new Error("sentenceCorpusPath is required for NLP example reranking.");
    }
    if (!embeddingArtifactPath) {
        throw new Error("embeddingArtifactPath is required for NLP example reranking.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP example reranking level must be an integer from 1 to 5.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedWordTsvPath = path.resolve(wordTsvPath);
    const resolvedSentenceCorpusPath = path.resolve(sentenceCorpusPath);
    const resolvedEmbeddingArtifactPath = path.resolve(embeddingArtifactPath);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const model = assertExampleRerankingModel({ manifest, modelId, lane });
    const embeddingArtifact = parseNlpEmbeddingArtifact(JSON.parse(fs.readFileSync(resolvedEmbeddingArtifactPath, "utf8")));
    if (embeddingArtifact.model.modelId !== modelId) {
        throw new Error(`Embedding artifact model ${embeddingArtifact.model.modelId} does not match reranking model ${modelId}.`);
    }
    const embeddingLookup = buildEmbeddingLookup(embeddingArtifact);
    const rows = parseWordDeckEmbeddingRows(fs.readFileSync(resolvedWordTsvPath, "utf8"));
    const scopedRows = Number.isFinite(limit) ? rows.slice(0, limit) : rows;
    const sentenceCorpus = loadSentenceCorpusFn(resolvedSentenceCorpusPath);
    const embedTextFn = await buildEmbedTextFn({
        model,
        cacheDir,
        allowRemoteModels,
    });
    const wordTsvHash = sha256FileWithSize(resolvedWordTsvPath);
    const sentenceCorpusHash = sha256FileWithSize(resolvedSentenceCorpusPath);
    const embeddingArtifactHash = sha256FileWithSize(resolvedEmbeddingArtifactPath);
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const parameters = buildExampleRerankingGeneratorParameters({
        level,
        lane,
        limit,
        minCandidates,
    });
    const suggestions = [];

    for (const row of scopedRows) {
        const targetId = `${row.written}|${row.reading}`;
        const anchor = embeddingLookup.get(targetId);
        if (!anchor) {
            continue;
        }
        const candidates = collectExampleCandidates(row, sentenceCorpus);
        if (candidates.length < minCandidates) {
            continue;
        }
        const ranked = await rankExampleCandidates({
            row,
            anchorVector: anchor.embedding.vector,
            candidates,
            embedTextFn,
        });
        suggestions.push(buildSuggestion({
            row,
            topCandidate: ranked[0],
            rankedCandidates: ranked,
            index: suggestions.length,
            level,
            lane,
            wordTsvPath: path.relative(resolvedWorkspaceRoot, resolvedWordTsvPath).replace(/\\/g, "/"),
            sentenceCorpusPath: path.relative(resolvedWorkspaceRoot, resolvedSentenceCorpusPath).replace(/\\/g, "/"),
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
            runId: `${modelId}-example-rerank-n${level}-${wordTsvHash.sha256.slice(0, 12)}`,
            manifestPath: path.relative(resolvedWorkspaceRoot, resolvedManifestPath).replace(/\\/g, "/"),
            createdBy,
            parameters,
            inputHashes: [wordTsvHash, sentenceCorpusHash, embeddingArtifactHash, manifestHash].map((entry) => ({
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
            description: `Assistive example reranking for JLPT N${level} word-card review packets.`,
        },
        suggestions,
    };

    return parseNlpSuggestionArtifact(artifact);
}

async function writeNlpExampleRerankingArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP example reranking.");
    }
    const resolvedOutPath = path.resolve(outPath);
    const context = buildExampleRerankingReuseContext(options);
    const reusableArtifact = findReusableExampleRerankingArtifact(resolvedOutPath, context);
    if (reusableArtifact) {
        return buildReuseResult({
            outPath: resolvedOutPath,
            artifact: reusableArtifact,
        });
    }
    const artifact = await buildNlpExampleRerankingArtifact(options);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
        skipped: false,
    };
}

function formatNlpExampleRerankingSummary({ outPath, artifact, skipped = false }) {
    return [
        "Japanese Kanji Builder NLP Example Reranking",
        "",
        `Artifact: ${outPath}`,
        `Status: ${skipped ? "reused unchanged artifact" : "generated artifact"}`,
        `Model: ${artifact.generator.modelId}`,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.deckKind}`,
        `Suggestions: ${artifact.suggestions.length}`,
        "",
        "Release boundary:",
        `- reranking suggestions certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- reranking suggestions may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].join("\n");
}

module.exports = {
    buildExampleCandidateInput,
    buildNlpExampleRerankingArtifact,
    collectExampleCandidates,
    formatNlpExampleRerankingSummary,
    parseCardExample,
    rankExampleCandidates,
    writeNlpExampleRerankingArtifact,
};
