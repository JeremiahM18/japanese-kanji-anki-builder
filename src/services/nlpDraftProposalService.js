const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    NLP_DRAFT_PROPOSAL_AUTHORITY,
    parseNlpDraftProposalArtifact,
} = require("../datasets/nlpDraftProposalArtifact");
const {
    parseNlpReviewPacketArtifact,
} = require("../datasets/nlpReviewPacketArtifact");
const {
    parseNlpSuggestionArtifact,
} = require("../datasets/nlpSuggestionArtifact");
const {
    buildDefaultNlpReviewPacketDir,
} = require("./nlpReviewPacketService");
const {
    buildNlpReviewPacketArtifactReport,
    resolveNlpReviewPacketArtifactPaths,
} = require("./nlpReviewPacketArtifactService");
const {
    buildDefaultNlpSuggestionDir,
    buildNlpSuggestionArtifactReport,
    resolveNlpSuggestionArtifactPaths,
} = require("./nlpSuggestionArtifactService");
const { ensureDir } = require("../utils/fs");
const { readJsonFile } = require("../utils/jsonFile");

const DEFAULT_LANE = "assistive-draft-proposal";
const DEFAULT_CREATED_BY = "scripts/generateNlpDraftProposals.js";
const SUGGESTION_EVIDENCE_SOURCE_TYPES = new Set([
    "generated-row",
    "tracked-source",
    "source-manifest",
    "corpus",
    "model-score",
    "runtime",
    "human-note",
]);
const DRAFT_PROPOSAL_LIMITATIONS = Object.freeze([
    "Draft proposals are assistive review scaffolds only and must not replace human Japanese/pedagogy review.",
    "Drafted fields are not source truth, card certification, or release readiness evidence.",
    "Any accepted draft must be manually promoted through tracked data, tests, and the existing Gold/Sapphire/Platinum/Obsidian workflows.",
]);

function buildDefaultNlpDraftProposalDir() {
    return path.resolve(__dirname, "../../out/nlp-drafts");
}

function buildDefaultNlpDraftProposalPath({ deckKind = "word", level = 5 } = {}) {
    return path.join(buildDefaultNlpDraftProposalDir(), `${deckKind}-n${level}-draft-proposals.json`);
}

function buildDefaultNlpDraftProposalMarkdownPath({ deckKind = "word", level = 5 } = {}) {
    return path.join(buildDefaultNlpDraftProposalDir(), `${deckKind}-n${level}-draft-proposals.md`);
}

function sha256FileWithSize(filePath, workspaceRoot) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: path.relative(workspaceRoot, filePath).replace(/\\/g, "/"),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function targetMatchesScope(target = {}, { deckKind = "word", level = 5 } = {}) {
    if (deckKind !== "all" && target.deckKind !== deckKind) {
        return false;
    }
    if (Number.isInteger(level) && target.level !== level) {
        return false;
    }
    return true;
}

function sourceRelativePath(filePath, workspaceRoot) {
    return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

function assertDraftProposalModels({ manifest, modelIds, lane = DEFAULT_LANE }) {
    for (const modelId of modelIds) {
        const model = manifest.models?.[modelId];
        if (!model) {
            throw new Error(`NLP draft proposal source model ${modelId} is not declared in the manifest.`);
        }
        if (model.status !== "active") {
            throw new Error(`NLP draft proposal source model ${modelId} is ${model.status}; expected active.`);
        }
        if (model.outputAuthority !== "assistive_only") {
            throw new Error(`NLP draft proposal source model ${modelId} must declare assistive_only authority.`);
        }
        if (model.promotionPolicy !== "human_review_required") {
            throw new Error(`NLP draft proposal source model ${modelId} must require human review.`);
        }
        if (!model.allowedUses.includes(lane)) {
            throw new Error(`NLP draft proposal source model ${modelId} does not allow lane ${lane}.`);
        }
    }
}

function parseSlashExcerpt(excerpt = "") {
    const parts = String(excerpt || "")
        .split(/\s+\/\s+/)
        .map((part) => part.trim());
    return {
        first: parts[0] || "",
        second: parts[1] || "",
        third: parts.slice(2).join(" / ") || "",
    };
}

function findCandidateMeaning(suggestion = {}) {
    const target = suggestion.target || {};
    const candidateEvidence = (suggestion.evidence || []).find((entry) => {
        const parsed = parseSlashExcerpt(entry.excerpt || "");
        return parsed.first === target.written && parsed.second === target.reading && parsed.third;
    });
    return parseSlashExcerpt(candidateEvidence?.excerpt || "").third;
}

function findExampleCandidate(suggestion = {}) {
    const evidence = (suggestion.evidence || []).find((entry) => {
        if (!entry.excerpt) {
            return false;
        }
        const parsed = parseSlashExcerpt(entry.excerpt);
        return Boolean(parsed.first && parsed.third);
    });
    const parsed = parseSlashExcerpt(evidence?.excerpt || "");
    return {
        japanese: parsed.first,
        reading: parsed.second,
        english: parsed.third,
    };
}

function buildCommonPromotionChecklist() {
    return [
        "Inspect the live generated row and current tracked data before using this draft.",
        "Verify every source identity, example, reading, meaning, pitch/audio implication, and learner-fit claim manually.",
        "Promote accepted content only through tracked templates/contracts and the established tests and gates.",
        "Do not count this draft as Gold, Sapphire, Platinum, Obsidian, or release readiness evidence.",
    ];
}

function buildCommonBlockers() {
    return [
        "Needs human Japanese/pedagogy review before any tracked data change.",
        "Needs source-evidence verification independent of the model-assisted draft.",
        "Needs normal deck gates after any accepted tracked edit.",
    ];
}

function buildSuggestionSourceRefs({ suggestion, artifactPath, workspaceRoot }) {
    const refs = [{
        sourceType: "suggestion",
        sourceId: suggestion.id,
        path: sourceRelativePath(artifactPath, workspaceRoot),
        excerpt: suggestion.summary,
        note: `Validated NLP suggestion ${suggestion.id}; task ${suggestion.task}; action ${suggestion.action}.`,
    }];

    for (const evidence of (suggestion.evidence || []).slice(0, 4)) {
        refs.push({
            sourceType: SUGGESTION_EVIDENCE_SOURCE_TYPES.has(evidence.sourceType)
                ? evidence.sourceType
                : "generated-row",
            sourceId: evidence.sourceId || suggestion.id,
            ...(evidence.path ? { path: evidence.path } : {}),
            ...(evidence.excerpt ? { excerpt: evidence.excerpt } : {}),
            note: evidence.note,
        });
    }

    return refs;
}

function buildDraftFromSuggestion({ suggestion, artifactPath, workspaceRoot, index }) {
    const base = {
        id: `nlp-draft-${String(index + 1).padStart(4, "0")}`,
        target: {
            deckKind: suggestion.target.deckKind,
            level: suggestion.target.level,
            written: suggestion.target.written,
            ...(suggestion.target.reading ? { reading: suggestion.target.reading } : {}),
        },
        priority: suggestion.action === "warn" ? "attention" : "review",
        rationale: `Draft assembled from model-backed suggestion ${suggestion.id}: ${suggestion.rationale}`,
        blockers: buildCommonBlockers(),
        promotionChecklist: buildCommonPromotionChecklist(),
        sourceRefs: buildSuggestionSourceRefs({ suggestion, artifactPath, workspaceRoot }),
        limitations: [...DRAFT_PROPOSAL_LIMITATIONS],
        authority: { ...NLP_DRAFT_PROPOSAL_AUTHORITY },
    };

    if (suggestion.task === "assistive-candidate-discovery") {
        const meaning = findCandidateMeaning(suggestion);
        return {
            ...base,
            draftKind: "word-contract-candidate",
            title: `Draft governed word-candidate seed for ${suggestion.target.written}|${suggestion.target.reading}`,
            proposedFields: {
                written: suggestion.target.written,
                reading: suggestion.target.reading || "",
                meaningCandidate: meaning || "NEEDS_HUMAN_MEANING_REVIEW",
                reviewNoteDraft: "Candidate surfaced by assistive reading-gap discovery. Verify commonness, learner usefulness, source identity, level fit, and whether this should become a tracked word, coverage extension, or rejection.",
            },
        };
    }

    if (suggestion.task === "assistive-example-reranking") {
        const example = findExampleCandidate(suggestion);
        return {
            ...base,
            draftKind: "example-candidate",
            title: `Draft example-candidate review note for ${suggestion.target.written}|${suggestion.target.reading}`,
            proposedFields: {
                exampleSentenceCandidate: [example.japanese, example.reading, example.english].filter(Boolean).join(" ／ "),
                exampleJapanese: example.japanese || "NEEDS_HUMAN_EXAMPLE_REVIEW",
                exampleReading: example.reading || "NEEDS_HUMAN_READING_REVIEW",
                exampleEnglish: example.english || "NEEDS_HUMAN_TRANSLATION_REVIEW",
                reviewNoteDraft: "Example candidate ranked by the assistive embedding lane. Verify naturalness, reading alignment, translation quality, level fit, and source suitability before any card change.",
            },
        };
    }

    if (suggestion.task === "assistive-sense-fit-audit") {
        return {
            ...base,
            draftKind: "sense-fit-review-note",
            title: `Draft sense-fit review note for ${suggestion.target.written}|${suggestion.target.reading}`,
            proposedFields: {
                reviewNoteDraft: "Sense-fit audit flagged this card. Re-check the written/reading identity, meaning, example sentence, kana reading, English translation, and learner usefulness together before changing tracked data.",
                draftDecision: "NEEDS_HUMAN_REVIEW",
            },
        };
    }

    return {
        ...base,
        draftKind: "general-review-note",
        title: `Draft review note for ${suggestion.target.written}|${suggestion.target.reading || ""}`,
        proposedFields: {
            reviewNoteDraft: "Model-backed suggestion requires human review before any tracked data change.",
            draftDecision: "NEEDS_HUMAN_REVIEW",
        },
    };
}

function buildDraftFromTokenizationSignal({ packet, signal, index }) {
    return {
        id: `nlp-draft-tokenization-${String(index + 1).padStart(4, "0")}`,
        draftKind: "tokenization-review-note",
        target: packet.target,
        priority: signal.reviewPriority === "attention" ? "attention" : "routine",
        title: `Draft tokenization review note for ${packet.target.written}|${packet.target.reading || ""}`,
        rationale: "Draft assembled from validated tokenization audit signal inside an NLP human review packet.",
        proposedFields: {
            tokenizationReviewNoteDraft: `Tokenization signals: ${(signal.signalKinds || []).join(", ")}. Token surfaces: ${(signal.tokenSurfaces || []).join(" / ")}. Verify reading alignment before any tracked data change.`,
            normalizedTokenReading: signal.normalizedTokenReading || "none",
            normalizedCardReading: signal.normalizedCardReading || "none",
            readingAlignment: signal.readingAlignment?.matches ? "matches" : "needs-review",
        },
        blockers: buildCommonBlockers(),
        promotionChecklist: buildCommonPromotionChecklist(),
        sourceRefs: [{
            sourceType: "tokenization-signal",
            sourceId: signal.id,
            path: signal.sourceArtifactPath,
            excerpt: signal.surface,
            note: `Tokenization signal priority ${signal.reviewPriority}; kinds ${(signal.signalKinds || []).join(", ")}.`,
        }, {
            sourceType: "review-packet",
            sourceId: packet.id,
            excerpt: packet.summary,
            note: "Validated NLP review packet used as drafting context.",
        }],
        limitations: [...DRAFT_PROPOSAL_LIMITATIONS],
        authority: { ...NLP_DRAFT_PROPOSAL_AUTHORITY },
    };
}

function countProposals({ proposals, sourceSuggestionCount, sourcePacketCount }) {
    const proposalsByKind = {};
    const proposalsByPriority = {};
    for (const proposal of proposals) {
        incrementCount(proposalsByKind, proposal.draftKind);
        incrementCount(proposalsByPriority, proposal.priority);
    }
    return {
        proposals: proposals.length,
        proposalsByKind,
        proposalsByPriority,
        sourceSuggestions: sourceSuggestionCount,
        sourcePackets: sourcePacketCount,
    };
}

function collectInputHashes({ suggestionArtifactPaths, reviewPacketArtifactPaths, manifestPath, workspaceRoot }) {
    const seen = new Set();
    return [...suggestionArtifactPaths, ...reviewPacketArtifactPaths, manifestPath]
        .filter((filePath) => filePath && fs.existsSync(filePath))
        .filter((filePath) => {
            if (seen.has(filePath)) {
                return false;
            }
            seen.add(filePath);
            return true;
        })
        .map((filePath) => sha256FileWithSize(filePath, workspaceRoot));
}

function loadScopedSuggestions({ artifactPaths, workspaceRoot, deckKind, level }) {
    const suggestions = [];
    const modelIds = new Set();
    for (const artifactPath of artifactPaths) {
        const artifact = parseNlpSuggestionArtifact(readJsonFile(artifactPath, {
            label: "NLP suggestion artifact",
        }));
        for (const suggestion of artifact.suggestions || []) {
            if (!targetMatchesScope(suggestion.target, { deckKind, level })) {
                continue;
            }
            if (artifact.generator.modelId) {
                modelIds.add(artifact.generator.modelId);
            }
            suggestions.push({
                suggestion,
                artifactPath,
                workspaceRoot,
            });
        }
    }
    return {
        suggestions,
        modelIds: [...modelIds].sort(),
    };
}

function loadScopedReviewPackets({ artifactPaths, deckKind, level }) {
    const packets = [];
    for (const artifactPath of artifactPaths) {
        const artifact = parseNlpReviewPacketArtifact(readJsonFile(artifactPath, {
            label: "NLP review packet artifact",
        }));
        for (const packet of artifact.packets || []) {
            if (!targetMatchesScope(packet.target, { deckKind, level })) {
                continue;
            }
            packets.push(packet);
        }
    }
    return packets;
}

function buildNlpDraftProposalArtifact({
    suggestionArtifactDir = buildDefaultNlpSuggestionDir(),
    suggestionArtifactPath = null,
    reviewPacketArtifactDir = buildDefaultNlpReviewPacketDir(),
    reviewPacketArtifactPath = null,
    manifestPath = buildDefaultNlpModelManifestPath(),
    workspaceRoot = process.cwd(),
    deckKind = "word",
    level = 5,
    limit = null,
    includeTokenizationDrafts = true,
    now = () => new Date(),
    loadManifestFn = loadNlpModelManifest,
    buildSuggestionReportFn = buildNlpSuggestionArtifactReport,
    buildReviewPacketReportFn = buildNlpReviewPacketArtifactReport,
    resolveSuggestionArtifactPathsFn = resolveNlpSuggestionArtifactPaths,
    resolveReviewPacketArtifactPathsFn = resolveNlpReviewPacketArtifactPaths,
} = {}) {
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const resolvedManifestPath = path.resolve(manifestPath);
    const suggestionReport = buildSuggestionReportFn({
        artifactDir: suggestionArtifactDir,
        artifactPath: suggestionArtifactPath,
        manifestPath: resolvedManifestPath,
    });
    if (!suggestionReport.passed) {
        throw new Error(`Cannot build NLP draft proposals from failing suggestion artifacts: ${(suggestionReport.errors || []).join("; ")}`);
    }
    const reviewPacketReport = buildReviewPacketReportFn({
        artifactDir: reviewPacketArtifactDir,
        artifactPath: reviewPacketArtifactPath,
    });
    if (!reviewPacketReport.passed) {
        throw new Error(`Cannot build NLP draft proposals from failing review packets: ${(reviewPacketReport.errors || []).join("; ")}`);
    }
    const suggestionResolution = resolveSuggestionArtifactPathsFn({
        artifactDir: suggestionArtifactDir,
        artifactPath: suggestionArtifactPath,
    });
    const reviewPacketResolution = resolveReviewPacketArtifactPathsFn({
        artifactDir: reviewPacketArtifactDir,
        artifactPath: reviewPacketArtifactPath,
    });
    const { suggestions, modelIds } = loadScopedSuggestions({
        artifactPaths: suggestionResolution.artifactPaths,
        workspaceRoot: resolvedWorkspaceRoot,
        deckKind,
        level,
    });
    const reviewPackets = loadScopedReviewPackets({
        artifactPaths: reviewPacketResolution.artifactPaths,
        deckKind,
        level,
    });
    const manifest = loadManifestFn(resolvedManifestPath);
    assertDraftProposalModels({ manifest, modelIds });

    const proposals = [];
    for (const item of suggestions) {
        proposals.push(buildDraftFromSuggestion({
            ...item,
            index: proposals.length,
        }));
    }

    if (includeTokenizationDrafts) {
        for (const packet of reviewPackets) {
            for (const signal of packet.tokenizationSignalRefs || []) {
                if (signal.reviewPriority !== "attention") {
                    continue;
                }
                proposals.push(buildDraftFromTokenizationSignal({
                    packet,
                    signal,
                    index: proposals.length,
                }));
            }
        }
    }

    const sortedProposals = proposals.sort((a, b) => {
        const priorityRank = { attention: 0, review: 1, routine: 2 };
        return (
            priorityRank[a.priority] - priorityRank[b.priority]
            || a.target.written.localeCompare(b.target.written, "ja")
            || String(a.target.reading || "").localeCompare(String(b.target.reading || ""), "ja")
            || a.id.localeCompare(b.id)
        );
    });
    const limitedProposals = Number.isFinite(limit) ? sortedProposals.slice(0, limit) : sortedProposals;
    if (
        modelIds.length === 0
        && limitedProposals.some((proposal) => proposal.draftKind !== "tokenization-review-note")
    ) {
        throw new Error("Cannot build model-backed NLP draft proposals without validated source model IDs.");
    }
    const inputHashes = collectInputHashes({
        suggestionArtifactPaths: suggestionResolution.artifactPaths,
        reviewPacketArtifactPaths: reviewPacketResolution.artifactPaths,
        manifestPath: resolvedManifestPath,
        workspaceRoot: resolvedWorkspaceRoot,
    });
    const artifact = {
        version: 1,
        artifactType: "nlp_draft_proposal_batch",
        generatedAt: now().toISOString(),
        generator: {
            modelIds,
            runId: `${DEFAULT_LANE}-n${level}-${inputHashes.map((entry) => entry.sha256.slice(0, 8)).join("-") || "empty"}`,
            manifestPath: sourceRelativePath(resolvedManifestPath, resolvedWorkspaceRoot),
            createdBy: DEFAULT_CREATED_BY,
            inputHashes,
        },
        scope: {
            deckKind: deckKind === "all" ? "mixed" : deckKind,
            levels: [level],
            lane: DEFAULT_LANE,
            description: "Assistive model-backed draft proposals assembled from validated suggestions and human review packets.",
        },
        authority: { ...NLP_DRAFT_PROPOSAL_AUTHORITY },
        counts: countProposals({
            proposals: limitedProposals,
            sourceSuggestionCount: suggestions.length,
            sourcePacketCount: reviewPackets.length,
        }),
        proposals: limitedProposals,
    };

    return parseNlpDraftProposalArtifact(artifact);
}

function writeNlpDraftProposalArtifact({
    outPath,
    markdownOutPath = null,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP draft proposal generation.");
    }
    const artifact = buildNlpDraftProposalArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    if (markdownOutPath) {
        const resolvedMarkdownPath = path.resolve(markdownOutPath);
        ensureDir(path.dirname(resolvedMarkdownPath));
        fs.writeFileSync(resolvedMarkdownPath, formatNlpDraftProposalMarkdown(artifact), "utf8");
    }
    return {
        outPath: resolvedOutPath,
        markdownOutPath: markdownOutPath ? path.resolve(markdownOutPath) : null,
        artifact,
    };
}

function formatNlpDraftProposalMarkdown(artifact = {}) {
    const lines = [
        "# NLP Draft Proposals",
        "",
        `Generated: ${artifact.generatedAt}`,
        `Lane: ${artifact.scope?.lane || DEFAULT_LANE}`,
        "",
        "## Release Boundary",
        "",
        "- Draft proposals certify cards: no",
        "- Draft proposals may write tracked templates directly: no",
        "- Draft proposals claim release readiness: no",
        "- Human promotion required: yes",
        "",
        "## Counts",
        "",
        `- Proposals: ${artifact.counts?.proposals || 0}`,
        `- Source suggestions: ${artifact.counts?.sourceSuggestions || 0}`,
        `- Source packets: ${artifact.counts?.sourcePackets || 0}`,
        "",
    ];

    for (const proposal of artifact.proposals || []) {
        lines.push(
            `## ${proposal.title}`,
            "",
            `Priority: ${proposal.priority}`,
            `Draft kind: ${proposal.draftKind}`,
            "",
            proposal.rationale,
            "",
            "Proposed fields:",
            ...Object.entries(proposal.proposedFields || {}).map(([key, value]) => `- ${key}: ${value}`),
            "",
            "Blockers:",
            ...proposal.blockers.map((item) => `- ${item}`),
            ""
        );
    }

    return `${lines.join("\n")}\n`;
}

function formatNlpDraftProposalSummary({ outPath, markdownOutPath, artifact }) {
    return [
        "Japanese Kanji Builder NLP Draft Proposals",
        "",
        `Artifact: ${outPath}`,
        markdownOutPath ? `Markdown: ${markdownOutPath}` : null,
        `Scope: ${artifact.scope.levels.map((item) => `N${item}`).join(", ")} ${artifact.scope.deckKind}`,
        `Models: ${artifact.generator.modelIds.join(", ") || "none"}`,
        `Proposals: ${artifact.counts.proposals}`,
        `Source suggestions: ${artifact.counts.sourceSuggestions}`,
        `Source packets: ${artifact.counts.sourcePackets}`,
        "",
        "Release boundary:",
        `- draft proposals certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- draft proposals may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- draft proposals claim release readiness: ${artifact.authority.claimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].filter((line) => line !== null).join("\n");
}

module.exports = {
    buildDefaultNlpDraftProposalDir,
    buildDefaultNlpDraftProposalMarkdownPath,
    buildDefaultNlpDraftProposalPath,
    buildDraftFromSuggestion,
    buildNlpDraftProposalArtifact,
    findCandidateMeaning,
    findExampleCandidate,
    formatNlpDraftProposalMarkdown,
    formatNlpDraftProposalSummary,
    writeNlpDraftProposalArtifact,
};
