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
    buildTransformersEmbedTextFn,
    cosineSimilarity,
} = require("./nlpEmbeddingModelEvaluationService");
const { ensureDir } = require("../utils/fs");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";
const DEFAULT_LANE = "assistive-candidate-discovery";
const DEFAULT_CREATED_BY = "scripts/discoverNlpReadingGapCandidates.js";
const READING_GAP_CANDIDATE_LIMITATIONS = Object.freeze([
    "Reading-gap candidate discovery is an assistive review queue only and must not replace human Japanese/pedagogy review.",
    "Embedding similarity can prioritize candidates for review, but it does not prove commonness, level fit, naturalness, source truth, or card readiness.",
    "Candidate artifacts must not directly write tracked templates or certify Gold, Platinum, Obsidian, or release readiness.",
]);

function sha256TextWithSize(pathLabel, text) {
    const bytes = Buffer.from(String(text), "utf8");
    return {
        path: pathLabel,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function sha256FileWithSize(filePath) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: filePath,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function normalizeScore(score) {
    return Math.max(0, Math.min(1, score));
}

function normalizeCosineScore(cosine) {
    return normalizeScore((cosine + 1) / 2);
}

function normalizePlanScore(score) {
    if (!Number.isFinite(score)) {
        return 0;
    }
    return normalizeScore(score / 200);
}

function buildGapIntentInput(item = {}) {
    return [
        `reading gap kanji: ${item.kanji || ""}`,
        `display word: ${item.displayWord || item.kanji || ""}`,
        `reading type: ${item.readingType || ""}`,
        `target reading: ${item.reading || ""}`,
        item.priority ? `priority: ${item.priority}` : null,
        item.suggestedAction ? `current disposition: ${item.suggestedAction}` : null,
        item.reason ? `gap reason: ${item.reason}` : null,
        item.editorialNote ? `editorial note: ${item.editorialNote}` : null,
    ].filter(Boolean).join("\n");
}

function buildCandidateInput({ candidate = {} } = {}) {
    return [
        `candidate word: ${candidate.written || ""}`,
        `candidate reading: ${candidate.reading || ""}`,
        candidate.meaning ? `candidate meaning: ${candidate.meaning}` : null,
        candidate.source ? `candidate source: ${candidate.source}` : null,
        candidate.action ? `candidate action: ${candidate.action}` : null,
        candidate.reason ? `candidate reason: ${candidate.reason}` : null,
        Array.isArray(candidate.constituentKanji) && candidate.constituentKanji.length > 0
            ? `constituent kanji: ${candidate.constituentKanji.join(", ")}`
            : null,
    ].filter(Boolean).join("\n");
}

function assertReadingGapCandidateModel({ manifest, modelId, lane }) {
    const model = manifest.models?.[modelId];
    if (!model) {
        throw new Error(`NLP reading-gap candidate model ${modelId} is not declared in the manifest.`);
    }
    if (model.status !== "active") {
        throw new Error(`NLP reading-gap candidate model ${modelId} is ${model.status}; expected active.`);
    }
    if (model.task !== "embedding") {
        throw new Error(`NLP reading-gap candidate model ${modelId} task is ${model.task}; expected embedding.`);
    }
    if (!model.allowedUses.includes(lane)) {
        throw new Error(`NLP reading-gap candidate model ${modelId} does not allow lane ${lane}.`);
    }
    return model;
}

async function scoreReadingGapCandidate({ item, candidate, gapVector, embedTextFn }) {
    const candidateVector = await embedTextFn(buildCandidateInput({ candidate }));
    const cosine = cosineSimilarity(gapVector, candidateVector);
    const modelScore = normalizeCosineScore(cosine);
    const planScore = normalizePlanScore(candidate.score);
    const combinedScore = normalizeScore((planScore * 0.65) + (modelScore * 0.35));

    return {
        item,
        candidate,
        cosine,
        modelScore,
        planScore,
        combinedScore,
    };
}

function buildInputHashes({ gapPlan, level, inputHashes, manifestHash }) {
    const planText = `${JSON.stringify(gapPlan, null, 2)}\n`;
    return [
        sha256TextWithSize(`inline:word-reading-gap-plan:n${level}`, planText),
        ...inputHashes,
        manifestHash,
    ];
}

function mapCandidateSourceType(source) {
    if (source === "sentence_corpus") {
        return "corpus";
    }
    if (source === "kanjiapi_cache") {
        return "source-manifest";
    }
    return "tracked-source";
}

function buildScoreBreakdownNote(candidate) {
    const breakdown = Array.isArray(candidate.scoreBreakdown)
        ? candidate.scoreBreakdown.map((entry) => `${entry.key}=${entry.value}`).join(", ")
        : "";
    return breakdown ? `Gap-plan score breakdown: ${breakdown}.` : "No gap-plan score breakdown was provided.";
}

function buildReadingGapCandidateSuggestion({ scored, index, level, lane }) {
    const { item, candidate } = scored;
    const gapId = `${item.kanji}|${item.readingType || "reading"}|${item.reading}`;
    const candidateId = `${candidate.written}|${candidate.reading}`;
    const evidence = [
        {
            sourceType: "tracked-source",
            sourceId: gapId,
            excerpt: `${item.reason || ""} ${item.editorialNote || ""}`.trim() || `${item.kanji} ${item.reading}`,
            note: `Reading-gap plan item ${gapId}; disposition ${item.suggestedAction || "unknown"}; priority ${item.priority || "unknown"}; plan rank ${item.rank || "unranked"}.`,
        },
        {
            sourceType: mapCandidateSourceType(candidate.source),
            sourceId: candidateId,
            excerpt: `${candidate.written} / ${candidate.reading} / ${candidate.meaning || "no meaning"}`,
            note: `Candidate source ${candidate.source || "unknown"}; candidate action ${candidate.action || "unknown"}; candidate quality ${candidate.quality || "unknown"}; ${buildScoreBreakdownNote(candidate)}`,
        },
        {
            sourceType: "model-score",
            sourceId: `${gapId}:${candidateId}`,
            note: `Embedding cosine ${scored.cosine.toFixed(6)}; model score ${scored.modelScore.toFixed(6)}; normalized gap-plan score ${scored.planScore.toFixed(6)}; combined review score ${scored.combinedScore.toFixed(6)}.`,
        },
    ];

    if (item.editorialNote) {
        evidence.push({
            sourceType: "human-note",
            sourceId: gapId,
            excerpt: item.editorialNote,
            note: "Existing editorial note must be reviewed before any human promotion decision.",
        });
    }

    return {
        id: `n${level}-word-reading-gap-candidate-${String(index + 1).padStart(4, "0")}`,
        task: lane,
        action: "candidate",
        target: {
            deckKind: "word",
            level,
            written: candidate.written,
            reading: candidate.reading,
        },
        score: scored.combinedScore,
        rank: index + 1,
        summary: `Review ${candidateId} as a candidate for ${gapId}.`,
        rationale: "Existing reading-gap planning found this candidate, and the embedding lane rescored it as an assistive human-review queue item.",
        evidence,
        limitations: [...READING_GAP_CANDIDATE_LIMITATIONS],
        promotion: { ...NLP_SUGGESTION_PROMOTION_POLICY },
    };
}

async function collectScoredCandidates({
    gapPlan,
    embedTextFn,
    limit = null,
    maxCandidatesPerGap = 3,
    minModelScore = 0,
}) {
    const scored = [];
    const items = Number.isFinite(limit) ? (gapPlan.items || []).slice(0, limit) : (gapPlan.items || []);

    for (const item of items) {
        const candidates = (item.suggestedWordCandidates || [])
            .slice(0, maxCandidatesPerGap);
        if (candidates.length === 0) {
            continue;
        }

        const gapVector = await embedTextFn(buildGapIntentInput(item));
        for (const candidate of candidates) {
            const candidateScore = await scoreReadingGapCandidate({
                item,
                candidate,
                gapVector,
                embedTextFn,
            });
            if (candidateScore.modelScore < minModelScore) {
                continue;
            }
            scored.push(candidateScore);
        }
    }

    return scored.sort((a, b) => (
        b.combinedScore - a.combinedScore
        || b.planScore - a.planScore
        || a.item.rank - b.item.rank
        || a.candidate.written.localeCompare(b.candidate.written, "ja")
        || a.candidate.reading.localeCompare(b.candidate.reading, "ja")
    ));
}

async function buildNlpReadingGapCandidateArtifact({
    gapPlan,
    inputHashes = [],
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    level = 5,
    modelId = DEFAULT_MODEL_ID,
    lane = DEFAULT_LANE,
    limit = null,
    maxCandidatesPerGap = 3,
    minModelScore = 0,
    cacheDir = path.resolve("cache/nlp-models/transformers-js"),
    allowRemoteModels = false,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildEmbedTextFn = buildTransformersEmbedTextFn,
} = {}) {
    if (!gapPlan || typeof gapPlan !== "object") {
        throw new Error("gapPlan is required for NLP reading-gap candidate discovery.");
    }
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("NLP reading-gap candidate discovery level must be an integer from 1 to 5.");
    }
    if (!Number.isInteger(maxCandidatesPerGap) || maxCandidatesPerGap < 0) {
        throw new Error("NLP reading-gap maxCandidatesPerGap must be a non-negative integer.");
    }
    if (!Number.isFinite(minModelScore) || minModelScore < 0 || minModelScore > 1) {
        throw new Error("NLP reading-gap minModelScore must be a number from 0 to 1.");
    }

    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedManifestPath = path.resolve(manifestPath);
    const manifest = loadManifestFn(resolvedManifestPath);
    const model = assertReadingGapCandidateModel({ manifest, modelId, lane });
    const embedTextFn = await buildEmbedTextFn({
        model,
        cacheDir,
        allowRemoteModels,
    });
    const manifestHash = sha256FileWithSize(resolvedManifestPath);
    const allInputHashes = buildInputHashes({
        gapPlan,
        level,
        inputHashes,
        manifestHash,
    }).map((entry) => ({
        path: path.isAbsolute(entry.path)
            ? path.relative(resolvedWorkspaceRoot, entry.path).replace(/\\/g, "/")
            : entry.path,
        sha256: entry.sha256,
        byteSize: entry.byteSize,
    }));
    const scoredCandidates = await collectScoredCandidates({
        gapPlan,
        embedTextFn,
        limit,
        maxCandidatesPerGap,
        minModelScore,
    });
    const suggestions = scoredCandidates.map((scored, index) => buildReadingGapCandidateSuggestion({
        scored,
        index,
        level,
        lane,
    }));

    const artifact = {
        version: 1,
        artifactType: "nlp_suggestion_batch",
        generatedAt: now().toISOString(),
        generator: {
            modelId,
            runId: `${modelId}-reading-gap-candidates-n${level}-${allInputHashes[0].sha256.slice(0, 12)}`,
            manifestPath: path.relative(resolvedWorkspaceRoot, resolvedManifestPath).replace(/\\/g, "/"),
            createdBy,
            inputHashes: allInputHashes,
        },
        authority: { ...NLP_SUGGESTION_AUTHORITY },
        scope: {
            deckKind: "word",
            levels: [level],
            lane,
            description: `Assistive reading-gap candidate discovery for JLPT N${level} word review queues.`,
        },
        suggestions,
    };

    return parseNlpSuggestionArtifact(artifact);
}

async function writeNlpReadingGapCandidateArtifact({
    outPath,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP reading-gap candidate discovery.");
    }
    const artifact = await buildNlpReadingGapCandidateArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    return {
        outPath: resolvedOutPath,
        artifact,
    };
}

function formatNlpReadingGapCandidateSummary({ outPath, artifact }) {
    return [
        "Japanese Kanji Builder NLP Reading-Gap Candidate Discovery",
        "",
        `Artifact: ${outPath}`,
        `Model: ${artifact.generator.modelId}`,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.deckKind}`,
        `Candidates: ${artifact.suggestions.length}`,
        "",
        "Release boundary:",
        `- candidate suggestions certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- candidate suggestions may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].join("\n");
}

module.exports = {
    buildCandidateInput,
    buildGapIntentInput,
    buildNlpReadingGapCandidateArtifact,
    collectScoredCandidates,
    formatNlpReadingGapCandidateSummary,
    scoreReadingGapCandidate,
    writeNlpReadingGapCandidateArtifact,
};
