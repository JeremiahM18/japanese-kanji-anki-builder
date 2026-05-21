const path = require("node:path");

const {
    buildDefaultNlpModelManifestPath,
    loadNlpModelManifest,
} = require("../datasets/nlpModelManifest");
const {
    NLP_TOKENIZATION_AUTHORITY,
    parseNlpTokenizationArtifact,
} = require("../datasets/nlpTokenizationArtifact");
const {
    buildDefaultNlpTokenizationDir,
    buildNlpTokenizationArtifactReport,
} = require("./nlpTokenizationArtifactService");
const {
    normalizeJapaneseReading,
} = require("../utils/japanese");
const {
    readJsonFile,
} = require("../utils/jsonFile");

const ROUTINE_SIGNAL_KIND = "routine-tokenization-review";
const MULTI_TOKEN_SIGNAL_KIND = "multi-token-surface";
const UNKNOWN_TOKEN_SIGNAL_KIND = "unknown-token";
const MISSING_READING_SIGNAL_KIND = "missing-token-reading";
const READING_MISMATCH_SIGNAL_KIND = "token-reading-card-reading-mismatch";
const KANJI_READING_VARIANT_SIGNAL_KIND = "kanji-card-tokenizer-reading-variant";
const KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND = "kanji-card-tokenizer-coverage-gap";
const ARTIFACT_WARNING_SIGNAL_KIND = "artifact-warning";

function incrementCount(counts, key) {
    counts[key] = (counts[key] || 0) + 1;
}

function formatTargetIdentity(target = {}) {
    return [
        target.kind || "unknown-target",
        Number.isInteger(target.level) ? `N${target.level}` : "",
        target.written || "",
        target.reading || "",
    ].filter(Boolean).join("|");
}

function normalizeTokenReading(token = {}) {
    return normalizeJapaneseReading(token.reading || token.pronunciation || "");
}

function buildTokenReadingSummary(tokens = []) {
    return tokens.map(normalizeTokenReading).join("");
}

function isKanjiCardTarget(item = {}) {
    return item.target?.kind === "kanji-card";
}

function isKanjiTokenizerCoverageWarning(warning = "") {
    return /UNKNOWN/i.test(warning)
        && /bare kanji anchor|coverage gap|at least one token/i.test(warning);
}

function isKanjiTokenizerCoverageGap({ item, signalKinds }) {
    return isKanjiCardTarget(item)
        && Boolean(item.target?.reading)
        && (
            signalKinds.includes(UNKNOWN_TOKEN_SIGNAL_KIND)
            || signalKinds.includes(MISSING_READING_SIGNAL_KIND)
        );
}

function signalKindsRequireAttention({ item, signalKinds }) {
    const ignoredKinds = new Set([
        ROUTINE_SIGNAL_KIND,
        KANJI_READING_VARIANT_SIGNAL_KIND,
    ]);

    if (signalKinds.includes(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND)) {
        ignoredKinds.add(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND);
        ignoredKinds.add(UNKNOWN_TOKEN_SIGNAL_KIND);
        ignoredKinds.add(MISSING_READING_SIGNAL_KIND);
        if ((item.warnings || []).every(isKanjiTokenizerCoverageWarning)) {
            ignoredKinds.add(ARTIFACT_WARNING_SIGNAL_KIND);
        }
    }

    return signalKinds.some((kind) => !ignoredKinds.has(kind));
}

function buildSignalKinds({ item, joinedTokenReading, normalizedCardReading }) {
    const kinds = [ROUTINE_SIGNAL_KIND];
    if ((item.tokens || []).length > 1) {
        kinds.push(MULTI_TOKEN_SIGNAL_KIND);
    }
    if ((item.tokens || []).some((token) => token.known === false)) {
        kinds.push(UNKNOWN_TOKEN_SIGNAL_KIND);
    }
    if ((item.tokens || []).some((token) => !normalizeTokenReading(token))) {
        kinds.push(MISSING_READING_SIGNAL_KIND);
    }
    const hasReadingDifference = normalizedCardReading
        && joinedTokenReading
        && joinedTokenReading !== normalizedCardReading;
    if (hasReadingDifference && isKanjiCardTarget(item)) {
        kinds.push(KANJI_READING_VARIANT_SIGNAL_KIND);
    } else if (hasReadingDifference) {
        kinds.push(READING_MISMATCH_SIGNAL_KIND);
    }
    if (isKanjiTokenizerCoverageGap({ item, signalKinds: kinds })) {
        kinds.push(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND);
    }
    if ((item.warnings || []).length > 0) {
        kinds.push(ARTIFACT_WARNING_SIGNAL_KIND);
    }
    return kinds;
}

function summarizeToken(token = {}) {
    return {
        surface: token.surface,
        reading: token.reading || null,
        normalizedReading: normalizeTokenReading(token) || null,
        partOfSpeech: token.partOfSpeech || [],
        known: token.known ?? null,
    };
}

function buildReviewSignal({ artifactPath, artifact, item }) {
    const normalizedCardReading = normalizeJapaneseReading(item.target?.reading || "");
    const joinedTokenReading = buildTokenReadingSummary(item.tokens);
    const signalKinds = buildSignalKinds({
        item,
        joinedTokenReading,
        normalizedCardReading,
    });
    const requiresAttention = signalKindsRequireAttention({ item, signalKinds });

    return {
        id: item.id,
        targetIdentity: formatTargetIdentity(item.target),
        target: item.target,
        reviewPriority: requiresAttention ? "attention" : "routine",
        signalKinds,
        surface: item.inputText,
        tokenCount: item.tokens.length,
        tokenSurfaces: item.tokens.map((token) => token.surface),
        tokenReadings: item.tokens.map((token) => token.reading || token.pronunciation || ""),
        normalizedTokenReading: joinedTokenReading || null,
        normalizedCardReading: normalizedCardReading || null,
        readingAlignment: {
            comparable: Boolean(normalizedCardReading && joinedTokenReading),
            matches: Boolean(normalizedCardReading && joinedTokenReading && joinedTokenReading === normalizedCardReading),
        },
        tokens: item.tokens.map(summarizeToken),
        warnings: item.warnings || [],
        limitations: item.limitations || [],
        evidence: {
            artifactPath,
            artifactGeneratedAt: artifact.generatedAt,
            runtimeId: artifact.runtime.runtimeId,
            tokenizerKind: artifact.runtime.tokenizerKind,
            dictionaryId: artifact.runtime.dictionaryId,
            inputHashes: artifact.generator.inputHashes,
        },
        authority: { ...NLP_TOKENIZATION_AUTHORITY },
        humanReviewRequired: true,
    };
}

function countSignal(reportCounts, signal) {
    reportCounts.signals += 1;
    incrementCount(reportCounts.signalsByKind, ROUTINE_SIGNAL_KIND);
    if (signal.reviewPriority === "attention") {
        reportCounts.attentionSignals += 1;
    } else {
        reportCounts.routineSignals += 1;
    }
    if (Number.isInteger(signal.target?.level)) {
        incrementCount(reportCounts.signalsByLevel, `N${signal.target.level}`);
    }
    for (const kind of signal.signalKinds.filter((kind) => kind !== ROUTINE_SIGNAL_KIND)) {
        incrementCount(reportCounts.signalsByKind, kind);
    }
}

function buildEmptyCounts() {
    return {
        artifacts: 0,
        items: 0,
        signals: 0,
        routineSignals: 0,
        attentionSignals: 0,
        multiTokenItems: 0,
        unknownTokenItems: 0,
        missingTokenReadingItems: 0,
        readingMismatchItems: 0,
        kanjiReadingVariantItems: 0,
        kanjiTokenizerCoverageGapItems: 0,
        warningItems: 0,
        signalsByKind: {},
        signalsByLevel: {},
    };
}

function buildNlpTokenizationAuditReport({
    artifactPath = null,
    artifactDir = buildDefaultNlpTokenizationDir(),
    manifestPath = buildDefaultNlpModelManifestPath(),
    loadManifestFn = loadNlpModelManifest,
} = {}) {
    const validationReport = buildNlpTokenizationArtifactReport({
        artifactPath,
        artifactDir,
        manifestPath,
        loadManifestFn,
    });
    const counts = buildEmptyCounts();

    if (!validationReport.passed) {
        return {
            generatedAt: new Date().toISOString(),
            passed: false,
            manifestPath: validationReport.manifestPath || path.resolve(manifestPath),
            artifactDir: validationReport.artifactDir,
            artifactPath: validationReport.artifactPath,
            missingArtifactDir: validationReport.missingArtifactDir,
            counts,
            artifacts: [],
            signals: [],
            errors: validationReport.errors || [],
            validationReport,
            releaseBoundary: {
                tokenizationAuditCertifiesCards: false,
                tokenizationAuditMayWriteTrackedTemplatesDirectly: false,
                tokenizationAuditClaimsReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

    const artifacts = [];
    const signals = [];
    const errors = [];

    for (const artifactSummary of validationReport.artifacts || []) {
        try {
            const artifact = parseNlpTokenizationArtifact(readJsonFile(artifactSummary.path, {
                label: "NLP tokenization artifact",
            }));
            const artifactSignals = artifact.items.map((item) => buildReviewSignal({
                artifactPath: artifactSummary.path,
                artifact,
                item,
            }));

            artifacts.push({
                path: artifactSummary.path,
                generatedAt: artifact.generatedAt,
                runtimeId: artifact.runtime.runtimeId,
                tokenizerKind: artifact.runtime.tokenizerKind,
                signalCount: artifactSignals.length,
                attentionSignalCount: artifactSignals.filter((signal) => signal.reviewPriority === "attention").length,
            });
            signals.push(...artifactSignals);
        } catch (error) {
            errors.push(`${artifactSummary.path}: ${error.message}`);
        }
    }

    counts.artifacts = artifacts.length;
    counts.items = signals.length;
    for (const signal of signals) {
        countSignal(counts, signal);
        if (signal.signalKinds.includes(MULTI_TOKEN_SIGNAL_KIND)) {
            counts.multiTokenItems += 1;
        }
        if (signal.signalKinds.includes(UNKNOWN_TOKEN_SIGNAL_KIND)) {
            counts.unknownTokenItems += 1;
        }
        if (signal.signalKinds.includes(MISSING_READING_SIGNAL_KIND)) {
            counts.missingTokenReadingItems += 1;
        }
        if (signal.signalKinds.includes(READING_MISMATCH_SIGNAL_KIND)) {
            counts.readingMismatchItems += 1;
        }
        if (signal.signalKinds.includes(KANJI_READING_VARIANT_SIGNAL_KIND)) {
            counts.kanjiReadingVariantItems += 1;
        }
        if (signal.signalKinds.includes(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND)) {
            counts.kanjiTokenizerCoverageGapItems += 1;
        }
        if (signal.signalKinds.includes(ARTIFACT_WARNING_SIGNAL_KIND)) {
            counts.warningItems += 1;
        }
    }

    return {
        generatedAt: new Date().toISOString(),
        passed: errors.length === 0,
        manifestPath: validationReport.manifestPath || path.resolve(manifestPath),
        artifactDir: validationReport.artifactDir,
        artifactPath: validationReport.artifactPath,
        missingArtifactDir: validationReport.missingArtifactDir,
        counts,
        artifacts,
        signals,
        errors,
        validationReport,
        releaseBoundary: {
            tokenizationAuditCertifiesCards: false,
            tokenizationAuditMayWriteTrackedTemplatesDirectly: false,
            tokenizationAuditClaimsReleaseReadiness: false,
            promotionRequiresHumanReview: true,
        },
    };
}

function formatCountMap(counts = {}) {
    const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
        return "none";
    }
    return entries.map(([key, count]) => `${key}=${count}`).join(", ");
}

function formatNlpTokenizationAuditReport(report = {}, { signalLimit = 20 } = {}) {
    const lines = [
        "Japanese Kanji Builder NLP Tokenization Audit",
        "",
        `Result: ${report.passed ? "passing" : "failing"}`,
        `Manifest: ${report.manifestPath || "unknown"}`,
        report.artifactPath
            ? `Artifact: ${report.artifactPath}`
            : `Artifact directory: ${report.artifactDir || "unknown"}`,
    ];

    if (report.missingArtifactDir) {
        lines.push("Artifact directory present: no (no tokenization artifacts to audit)");
    }

    lines.push(
        "",
        "Counts:",
        `- artifacts: ${report.counts?.artifacts || 0}`,
        `- review signals: ${report.counts?.signals || 0}`,
        `- attention signals: ${report.counts?.attentionSignals || 0}`,
        `- routine signals: ${report.counts?.routineSignals || 0}`,
        `- multi-token items: ${report.counts?.multiTokenItems || 0}`,
        `- unknown-token items: ${report.counts?.unknownTokenItems || 0}`,
        `- missing token-reading items: ${report.counts?.missingTokenReadingItems || 0}`,
        `- token/card reading mismatch items: ${report.counts?.readingMismatchItems || 0}`,
        `- kanji tokenizer reading variant items: ${report.counts?.kanjiReadingVariantItems || 0}`,
        `- kanji tokenizer coverage-gap items: ${report.counts?.kanjiTokenizerCoverageGapItems || 0}`,
        `- warning items: ${report.counts?.warningItems || 0}`,
        `- signals by kind: ${formatCountMap(report.counts?.signalsByKind)}`,
        `- signals by level: ${formatCountMap(report.counts?.signalsByLevel)}`,
        "",
        "Release boundary:",
        `- tokenization audit certifies cards: ${report.releaseBoundary?.tokenizationAuditCertifiesCards ? "yes" : "no"}`,
        `- tokenization audit may write tracked templates directly: ${report.releaseBoundary?.tokenizationAuditMayWriteTrackedTemplatesDirectly ? "yes" : "no"}`,
        `- tokenization audit claims release readiness: ${report.releaseBoundary?.tokenizationAuditClaimsReleaseReadiness ? "yes" : "no"}`,
        `- human promotion required: ${report.releaseBoundary?.promotionRequiresHumanReview ? "yes" : "no"}`
    );

    const signals = report.signals || [];
    if (signals.length > 0) {
        const shown = signals.slice(0, signalLimit);
        lines.push("", `Review signals (showing ${shown.length}/${signals.length}):`);
        for (const signal of shown) {
            lines.push(`- ${signal.targetIdentity}: ${signal.reviewPriority}; ${signal.tokenSurfaces.join(" / ")}; ${signal.signalKinds.join(", ")}`);
        }
    }

    if ((report.errors || []).length > 0) {
        lines.push("", "Errors:");
        for (const error of report.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    ARTIFACT_WARNING_SIGNAL_KIND,
    KANJI_READING_VARIANT_SIGNAL_KIND,
    KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND,
    MISSING_READING_SIGNAL_KIND,
    MULTI_TOKEN_SIGNAL_KIND,
    READING_MISMATCH_SIGNAL_KIND,
    ROUTINE_SIGNAL_KIND,
    UNKNOWN_TOKEN_SIGNAL_KIND,
    buildNlpTokenizationAuditReport,
    buildReviewSignal,
    formatNlpTokenizationAuditReport,
};
