const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    NLP_REVIEW_PACKET_AUTHORITY,
    parseNlpReviewPacketArtifact,
} = require("../datasets/nlpReviewPacketArtifact");
const {
    parseNlpSuggestionArtifact,
} = require("../datasets/nlpSuggestionArtifact");
const {
    buildDefaultNlpSuggestionDir,
    buildNlpSuggestionArtifactReport,
    resolveNlpSuggestionArtifactPaths,
} = require("./nlpSuggestionArtifactService");
const {
    buildDefaultNlpTokenizationDir,
} = require("./nlpTokenizationArtifactService");
const {
    buildNlpTokenizationAuditReport,
} = require("./nlpTokenizationAuditService");
const { ensureDir } = require("../utils/fs");
const { readJsonFile } = require("../utils/jsonFile");

const DEFAULT_CREATED_BY = "scripts/generateNlpReviewPackets.js";
const KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND = "kanji-card-tokenizer-coverage-gap";
const WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND = "word-card-tokenizer-segmentation-context";
const WORD_READING_EXCEPTION_SIGNAL_KIND = "word-card-tokenizer-reading-exception";
const REVIEW_PACKET_LIMITATIONS = Object.freeze([
    "Review packets aggregate assistive NLP signals only and must not replace human Japanese/pedagogy review.",
    "A packet can prioritize evidence for humans, but it does not certify card correctness, source truth, level fit, naturalness, pitch, audio, or release readiness.",
    "Accepted changes must be promoted through tracked data, tests, and the existing Gold/Sapphire/Platinum/Obsidian workflows.",
]);

function buildDefaultNlpReviewPacketDir() {
    return path.resolve(__dirname, "../../out/nlp-review-packets");
}

function buildDefaultNlpReviewPacketPath({ deckKind = "word", level = 5 } = {}) {
    return path.join(buildDefaultNlpReviewPacketDir(), `${deckKind}-n${level}-review-packets.json`);
}

function buildDefaultNlpReviewPacketMarkdownPath({ deckKind = "word", level = 5 } = {}) {
    return path.join(buildDefaultNlpReviewPacketDir(), `${deckKind}-n${level}-review-packets.md`);
}

function sha256FileWithSize(filePath, workspaceRoot) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: path.relative(workspaceRoot, filePath).replace(/\\/g, "/"),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function targetKey(target = {}) {
    return [
        target.deckKind || "unknown",
        Number.isInteger(target.level) ? `N${target.level}` : "N?",
        target.written || "",
        target.reading || "",
    ].join("|");
}

function packetIdFromIndex(index, target = {}) {
    const prefix = `${target.deckKind || "mixed"}-n${target.level || "x"}`;
    return `nlp-review-${prefix}-${String(index + 1).padStart(4, "0")}`;
}

function sourceRelativePath(filePath, workspaceRoot) {
    return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

function suggestionEvidenceDigest(suggestion = {}) {
    return (suggestion.evidence || []).slice(0, 4).map((entry) => {
        const source = entry.sourceType || "evidence";
        const sourceId = entry.sourceId ? ` ${entry.sourceId}` : "";
        const note = entry.note || entry.excerpt || "";
        return `${source}${sourceId}: ${note}`;
    });
}

function toSuggestionRef(suggestion, sourceArtifactPath, workspaceRoot) {
    const ref = {
        id: suggestion.id,
        task: suggestion.task,
        action: suggestion.action,
        summary: suggestion.summary,
        rationale: suggestion.rationale,
        sourceArtifactPath: sourceRelativePath(sourceArtifactPath, workspaceRoot),
        evidenceDigest: suggestionEvidenceDigest(suggestion),
        limitations: suggestion.limitations || [],
    };
    if (Number.isFinite(suggestion.score)) {
        ref.score = suggestion.score;
    }
    if (Number.isInteger(suggestion.rank)) {
        ref.rank = suggestion.rank;
    }
    return ref;
}

function toTokenizationSignalRef(signal, workspaceRoot) {
    return {
        id: signal.id,
        reviewPriority: signal.reviewPriority,
        signalKinds: signal.signalKinds || [],
        surface: signal.surface,
        tokenSurfaces: signal.tokenSurfaces || [],
        normalizedTokenReading: signal.normalizedTokenReading || null,
        normalizedCardReading: signal.normalizedCardReading || null,
        readingAlignment: signal.readingAlignment || {
            comparable: false,
            matches: false,
        },
        tokenizerException: signal.tokenizerException || null,
        sourceArtifactPath: sourceRelativePath(signal.evidence?.artifactPath || "", workspaceRoot),
        limitations: signal.limitations || [],
    };
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

function ensurePacketGroup(groups, target) {
    const key = targetKey(target);
    if (!groups.has(key)) {
        groups.set(key, {
            target: {
                deckKind: target.deckKind,
                level: target.level,
                written: target.written,
                ...(target.reading ? { reading: target.reading } : {}),
            },
            suggestionRefs: [],
            tokenizationSignalRefs: [],
        });
    }
    return groups.get(key);
}

function buildReviewChecklist(group) {
    const checklist = [
        "Verify exact written and reading identity against the live generated card before changing tracked data.",
        "Read every source evidence note, limitation, and current card surface before accepting or rejecting any suggestion.",
        "Do not promote any NLP suggestion without tracked human review evidence and the normal test gates.",
    ];

    if (group.tokenizationSignalRefs.some((signal) => signal.reviewPriority === "attention")) {
        checklist.push("Inspect tokenization attention signals, especially token/card reading alignment and unknown-token evidence.");
    }
    if (group.tokenizationSignalRefs.some((signal) => (signal.signalKinds || []).includes(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND))) {
        checklist.push("Treat kanji tokenizer coverage gaps as tokenizer/dictionary coverage evidence, not card-defect evidence by itself.");
    }
    if (group.tokenizationSignalRefs.some((signal) => (signal.signalKinds || []).includes(WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND))) {
        checklist.push("Treat exact-reading word segmentation context as tokenizer segmentation evidence, not card-defect evidence by itself.");
    }
    if (group.tokenizationSignalRefs.some((signal) => (signal.signalKinds || []).includes(WORD_READING_EXCEPTION_SIGNAL_KIND))) {
        checklist.push("For word tokenizer reading exceptions, verify the exception's exact word-reading identity, tokenizer output, evidence refs, and limitation note before treating it as routine context.");
    }
    if (group.suggestionRefs.some((suggestion) => suggestion.task === "assistive-candidate-discovery")) {
        checklist.push("For candidate-discovery suggestions, verify commonness, learner usefulness, source identity, and level fit before any data change.");
    }
    if (group.suggestionRefs.some((suggestion) => suggestion.task === "assistive-sense-fit-audit")) {
        checklist.push("For sense-fit warnings, inspect meaning, example sentence, reading, translation, and learner naturalness together.");
    }
    if (group.suggestionRefs.some((suggestion) => suggestion.task === "assistive-example-reranking")) {
        checklist.push("For example reranking, treat the model rank as a prompt to review examples, not proof that the top example is better.");
    }

    return checklist;
}

function packetPriority(group) {
    if (
        group.tokenizationSignalRefs.some((signal) => signal.reviewPriority === "attention")
        || group.suggestionRefs.some((suggestion) => suggestion.action === "warn")
    ) {
        return "attention";
    }
    if (group.suggestionRefs.length > 0) {
        return "review";
    }
    return "routine";
}

function buildPacketSummary(group) {
    const identity = [
        group.target.written,
        group.target.reading ? `(${group.target.reading})` : "",
    ].filter(Boolean).join(" ");
    return `Review ${identity}: ${group.suggestionRefs.length} suggestion(s), ${group.tokenizationSignalRefs.length} tokenization signal(s).`;
}

function sortPacketGroups(a, b) {
    const priorityRank = { attention: 0, review: 1, routine: 2 };
    const aPriority = packetPriority(a);
    const bPriority = packetPriority(b);
    return (
        priorityRank[aPriority] - priorityRank[bPriority]
        || (a.target.level || 99) - (b.target.level || 99)
        || a.target.written.localeCompare(b.target.written, "ja")
        || String(a.target.reading || "").localeCompare(String(b.target.reading || ""), "ja")
    );
}

function buildPacketCounts(packets) {
    return {
        packets: packets.length,
        suggestions: packets.reduce((sum, packet) => sum + packet.suggestionRefs.length, 0),
        tokenizationSignals: packets.reduce((sum, packet) => sum + packet.tokenizationSignalRefs.length, 0),
        attentionPackets: packets.filter((packet) => packet.priority === "attention").length,
        reviewPackets: packets.filter((packet) => packet.priority === "review").length,
        routinePackets: packets.filter((packet) => packet.priority === "routine").length,
    };
}

function formatTokenizationSignalDetail(signal = {}) {
    return [
        signal.id,
        signal.reviewPriority,
        (signal.signalKinds || []).join(", "),
        signal.tokenizerException?.exceptionKind ? `exception=${signal.tokenizerException.exceptionKind}` : "",
    ].filter(Boolean).join(": ");
}

function collectSuggestionRefs({ artifactPaths, workspaceRoot, deckKind, level }) {
    const refs = [];
    for (const artifactPath of artifactPaths) {
        const artifact = parseNlpSuggestionArtifact(readJsonFile(artifactPath, {
            label: "NLP suggestion artifact",
        }));
        for (const suggestion of artifact.suggestions || []) {
            if (!targetMatchesScope(suggestion.target, { deckKind, level })) {
                continue;
            }
            refs.push({
                target: suggestion.target,
                ref: toSuggestionRef(suggestion, artifactPath, workspaceRoot),
            });
        }
    }
    return refs;
}

function collectTokenizationSignalRefs({ tokenizationAuditReport, workspaceRoot, deckKind, level }) {
    return (tokenizationAuditReport.signals || [])
        .filter((signal) => targetMatchesScope(signal.target, { deckKind, level }))
        .map((signal) => ({
            target: signal.target,
            ref: toTokenizationSignalRef(signal, workspaceRoot),
        }));
}

function buildNlpReviewPacketArtifactFromSignals({
    suggestionRefs = [],
    tokenizationSignalRefs = [],
    inputHashes = [],
    deckKind = "word",
    level = 5,
    limit = null,
    createdBy = DEFAULT_CREATED_BY,
    now = () => new Date(),
} = {}) {
    const groups = new Map();

    for (const { target, ref } of suggestionRefs) {
        ensurePacketGroup(groups, target).suggestionRefs.push(ref);
    }
    for (const { target, ref } of tokenizationSignalRefs) {
        ensurePacketGroup(groups, target).tokenizationSignalRefs.push(ref);
    }

    const sourceGroups = [...groups.values()].sort(sortPacketGroups);
    const limitedGroups = Number.isFinite(limit) ? sourceGroups.slice(0, limit) : sourceGroups;
    const packets = limitedGroups.map((group, index) => {
        const priority = packetPriority(group);
        return {
            id: packetIdFromIndex(index, group.target),
            target: group.target,
            priority,
            summary: buildPacketSummary(group),
            reviewChecklist: buildReviewChecklist(group),
            suggestionRefs: group.suggestionRefs,
            tokenizationSignalRefs: group.tokenizationSignalRefs,
            limitations: [...REVIEW_PACKET_LIMITATIONS],
            authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        };
    });
    const levels = Number.isInteger(level)
        ? [level]
        : [...new Set(packets.map((packet) => packet.target.level).filter(Number.isInteger))].sort((a, b) => a - b);
    const artifact = {
        version: 1,
        artifactType: "nlp_review_packet_batch",
        generatedAt: now().toISOString(),
        generator: {
            createdBy,
            inputHashes: inputHashes.length > 0 ? inputHashes : [{
                path: "inline:empty-nlp-review-packet-inputs",
                sha256: crypto.createHash("sha256").update("empty").digest("hex"),
                byteSize: 5,
            }],
        },
        scope: {
            deckKind: deckKind === "all" ? "mixed" : deckKind,
            levels,
            description: "Assistive NLP human review packets assembled from validated suggestion artifacts and tokenization audit signals.",
        },
        authority: { ...NLP_REVIEW_PACKET_AUTHORITY },
        counts: buildPacketCounts(packets),
        packets,
    };

    return parseNlpReviewPacketArtifact(artifact);
}

function collectInputHashes({ suggestionArtifactPaths, tokenizationAuditReport, workspaceRoot }) {
    const paths = [
        ...suggestionArtifactPaths,
        ...(tokenizationAuditReport.artifacts || []).map((artifact) => artifact.path),
    ].filter(Boolean);
    const seen = new Set();
    return paths.filter((filePath) => {
        if (seen.has(filePath) || !fs.existsSync(filePath)) {
            return false;
        }
        seen.add(filePath);
        return true;
    }).map((filePath) => sha256FileWithSize(filePath, workspaceRoot));
}

function buildNlpReviewPacketArtifact({
    suggestionArtifactDir = buildDefaultNlpSuggestionDir(),
    suggestionArtifactPath = null,
    tokenizationArtifactDir = buildDefaultNlpTokenizationDir(),
    tokenizationArtifactPath = null,
    manifestPath,
    workspaceRoot = process.cwd(),
    deckKind = "word",
    level = 5,
    limit = null,
    now = () => new Date(),
    buildSuggestionReportFn = buildNlpSuggestionArtifactReport,
    buildTokenizationAuditReportFn = buildNlpTokenizationAuditReport,
    resolveSuggestionArtifactPathsFn = resolveNlpSuggestionArtifactPaths,
} = {}) {
    const resolvedWorkspaceRoot = path.resolve(workspaceRoot);
    const suggestionReport = buildSuggestionReportFn({
        artifactDir: suggestionArtifactDir,
        artifactPath: suggestionArtifactPath,
        manifestPath,
    });
    if (!suggestionReport.passed) {
        throw new Error(`Cannot build NLP review packets from failing suggestion artifacts: ${(suggestionReport.errors || []).join("; ")}`);
    }
    const tokenizationAuditReport = buildTokenizationAuditReportFn({
        artifactDir: tokenizationArtifactDir,
        artifactPath: tokenizationArtifactPath,
        manifestPath,
    });
    if (!tokenizationAuditReport.passed) {
        throw new Error(`Cannot build NLP review packets from failing tokenization audit: ${(tokenizationAuditReport.errors || []).join("; ")}`);
    }
    const suggestionResolution = resolveSuggestionArtifactPathsFn({
        artifactDir: suggestionArtifactDir,
        artifactPath: suggestionArtifactPath,
    });
    const suggestionRefs = collectSuggestionRefs({
        artifactPaths: suggestionResolution.artifactPaths,
        workspaceRoot: resolvedWorkspaceRoot,
        deckKind,
        level,
    });
    const tokenizationSignalRefs = collectTokenizationSignalRefs({
        tokenizationAuditReport,
        workspaceRoot: resolvedWorkspaceRoot,
        deckKind,
        level,
    });
    const inputHashes = collectInputHashes({
        suggestionArtifactPaths: suggestionResolution.artifactPaths,
        tokenizationAuditReport,
        workspaceRoot: resolvedWorkspaceRoot,
    });

    return buildNlpReviewPacketArtifactFromSignals({
        suggestionRefs,
        tokenizationSignalRefs,
        inputHashes,
        deckKind,
        level,
        limit,
        now,
    });
}

function writeNlpReviewPacketArtifact({
    outPath,
    markdownOutPath = null,
    ...options
} = {}) {
    if (!outPath) {
        throw new Error("outPath is required for NLP review packet generation.");
    }
    const artifact = buildNlpReviewPacketArtifact(options);
    const resolvedOutPath = path.resolve(outPath);
    ensureDir(path.dirname(resolvedOutPath));
    fs.writeFileSync(resolvedOutPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    if (markdownOutPath) {
        const resolvedMarkdownPath = path.resolve(markdownOutPath);
        ensureDir(path.dirname(resolvedMarkdownPath));
        fs.writeFileSync(resolvedMarkdownPath, formatNlpReviewPacketMarkdown(artifact), "utf8");
    }
    return {
        outPath: resolvedOutPath,
        markdownOutPath: markdownOutPath ? path.resolve(markdownOutPath) : null,
        artifact,
    };
}

function formatNlpReviewPacketMarkdown(artifact = {}) {
    const lines = [
        "# NLP Human Review Packets",
        "",
        `Generated: ${artifact.generatedAt}`,
        `Scope: ${artifact.scope?.deckKind || "unknown"} ${artifact.scope?.levels?.map((level) => `N${level}`).join(", ") || ""}`.trim(),
        "",
        "## Release Boundary",
        "",
        "- Review packets certify cards: no",
        "- Review packets may write tracked templates directly: no",
        "- Review packets claim release readiness: no",
        "- Human promotion required: yes",
        "",
        "## Counts",
        "",
        `- Packets: ${artifact.counts?.packets || 0}`,
        `- Suggestions: ${artifact.counts?.suggestions || 0}`,
        `- Tokenization signals: ${artifact.counts?.tokenizationSignals || 0}`,
        `- Attention packets: ${artifact.counts?.attentionPackets || 0}`,
        "",
    ];

    for (const packet of artifact.packets || []) {
        lines.push(
            `## ${packet.target.written}${packet.target.reading ? ` (${packet.target.reading})` : ""}`,
            "",
            `Priority: ${packet.priority}`,
            "",
            packet.summary,
            "",
            "Checklist:",
            ...packet.reviewChecklist.map((item) => `- ${item}`),
            "",
            `Suggestions: ${packet.suggestionRefs.length}`,
            `Tokenization signals: ${packet.tokenizationSignalRefs.length}`,
            ""
        );
        if (packet.tokenizationSignalRefs.length > 0) {
            lines.push(
                "Tokenization signal details:",
                ...packet.tokenizationSignalRefs.map((signal) => `- ${formatTokenizationSignalDetail(signal)}`),
                ""
            );
        }
    }

    return `${lines.join("\n")}\n`;
}

function formatNlpReviewPacketSummary({ outPath, markdownOutPath, artifact }) {
    return [
        "Japanese Kanji Builder NLP Human Review Packets",
        "",
        `Artifact: ${outPath}`,
        markdownOutPath ? `Markdown: ${markdownOutPath}` : null,
        `Scope: ${artifact.scope.levels.map((level) => `N${level}`).join(", ")} ${artifact.scope.deckKind}`,
        `Packets: ${artifact.counts.packets}`,
        `Suggestions: ${artifact.counts.suggestions}`,
        `Tokenization signals: ${artifact.counts.tokenizationSignals}`,
        "",
        "Release boundary:",
        `- review packets certify cards: ${artifact.authority.certifiesCards ? "yes" : "no"}`,
        `- review packets may write tracked templates directly: ${artifact.authority.writesTrackedTemplates ? "yes" : "no"}`,
        `- review packets claim release readiness: ${artifact.authority.claimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${artifact.authority.promotionPolicy === "human_review_required" ? "yes" : "no"}`,
        "",
    ].filter((line) => line !== null).join("\n");
}

module.exports = {
    buildDefaultNlpReviewPacketDir,
    buildDefaultNlpReviewPacketMarkdownPath,
    buildDefaultNlpReviewPacketPath,
    buildNlpReviewPacketArtifact,
    buildNlpReviewPacketArtifactFromSignals,
    formatNlpReviewPacketMarkdown,
    formatNlpReviewPacketSummary,
    writeNlpReviewPacketArtifact,
};
