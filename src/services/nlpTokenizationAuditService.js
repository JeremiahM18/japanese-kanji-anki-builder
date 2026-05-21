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
    buildDefaultNlpWordTokenizationMismatchExceptionPath,
    buildNlpWordTokenizationMismatchExceptionMap,
    loadNlpWordTokenizationMismatchExceptions,
} = require("../datasets/nlpWordTokenizationMismatchExceptions");
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
const WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND = "word-card-tokenizer-segmentation-context";
const WORD_READING_EXCEPTION_SIGNAL_KIND = "word-card-tokenizer-reading-exception";
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

function isWordCardTarget(item = {}) {
    return item.target?.kind === "word-card";
}

function isKanjiTokenizerCoverageWarning(warning = "") {
    return /UNKNOWN/i.test(warning)
        && /bare kanji anchor|coverage gap|at least one token/i.test(warning);
}

function isWordSegmentationContext({ item, signalKinds, joinedTokenReading, normalizedCardReading }) {
    return isWordCardTarget(item)
        && signalKinds.includes(MULTI_TOKEN_SIGNAL_KIND)
        && !signalKinds.includes(UNKNOWN_TOKEN_SIGNAL_KIND)
        && !signalKinds.includes(MISSING_READING_SIGNAL_KIND)
        && Boolean(normalizedCardReading && joinedTokenReading)
        && joinedTokenReading === normalizedCardReading;
}

function findWordTokenizerReadingException({
    item,
    signalKinds,
    joinedTokenReading,
    exceptionMap,
}) {
    if (!isWordCardTarget(item) || !exceptionMap || !signalKinds.includes(READING_MISMATCH_SIGNAL_KIND)) {
        return null;
    }
    const key = [
        Number.isInteger(item.target?.level) ? `N${item.target.level}` : "N?",
        item.target?.written,
        item.target?.reading,
    ].join("|");
    const entry = exceptionMap.get(key);
    if (!entry || item.target?.level !== entry.level) {
        return null;
    }
    if (joinedTokenReading !== entry.tokenizerReading) {
        return null;
    }
    const tokenSurfaces = (item.tokens || []).map((token) => token.surface);
    if (tokenSurfaces.join("\u0000") !== entry.tokenSurfaces.join("\u0000")) {
        return null;
    }
    const uncoveredKinds = signalKinds
        .filter((kind) => kind !== ROUTINE_SIGNAL_KIND)
        .filter((kind) => !entry.appliesToSignalKinds.includes(kind));
    if (uncoveredKinds.length > 0) {
        return null;
    }
    return entry;
}

function isKanjiTokenizerCoverageGap({ item, signalKinds }) {
    return isKanjiCardTarget(item)
        && Boolean(item.target?.reading)
        && (
            signalKinds.includes(UNKNOWN_TOKEN_SIGNAL_KIND)
            || signalKinds.includes(MISSING_READING_SIGNAL_KIND)
        );
}

function signalKindsRequireAttention({ item, signalKinds, wordTokenizerException }) {
    const ignoredKinds = new Set([
        ROUTINE_SIGNAL_KIND,
        WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND,
        KANJI_READING_VARIANT_SIGNAL_KIND,
    ]);

    if (signalKinds.includes(WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND)) {
        ignoredKinds.add(MULTI_TOKEN_SIGNAL_KIND);
    }

    if (wordTokenizerException) {
        ignoredKinds.add(WORD_READING_EXCEPTION_SIGNAL_KIND);
        for (const kind of wordTokenizerException.appliesToSignalKinds || []) {
            ignoredKinds.add(kind);
        }
    }

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

function buildSignalKinds({ item, joinedTokenReading, normalizedCardReading, exceptionMap }) {
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
    if (isWordSegmentationContext({
        item,
        signalKinds: kinds,
        joinedTokenReading,
        normalizedCardReading,
    })) {
        kinds.push(WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND);
    }
    if (isKanjiTokenizerCoverageGap({ item, signalKinds: kinds })) {
        kinds.push(KANJI_TOKENIZER_COVERAGE_GAP_SIGNAL_KIND);
    }
    if ((item.warnings || []).length > 0) {
        kinds.push(ARTIFACT_WARNING_SIGNAL_KIND);
    }
    const wordTokenizerException = findWordTokenizerReadingException({
        item,
        signalKinds: kinds,
        joinedTokenReading,
        exceptionMap,
    });
    if (wordTokenizerException) {
        kinds.push(WORD_READING_EXCEPTION_SIGNAL_KIND);
    }
    return {
        signalKinds: kinds,
        wordTokenizerException,
    };
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

function summarizeWordTokenizerException(exception) {
    if (!exception) {
        return null;
    }
    return {
        exceptionKind: exception.exceptionKind,
        tokenizerReading: exception.tokenizerReading,
        appliesToSignalKinds: exception.appliesToSignalKinds,
        reviewNote: exception.reviewNote,
        evidence: exception.evidence,
        limitations: exception.limitations,
    };
}

function buildReviewSignal({ artifactPath, artifact, item, exceptionMap = new Map() }) {
    const normalizedCardReading = normalizeJapaneseReading(item.target?.reading || "");
    const joinedTokenReading = buildTokenReadingSummary(item.tokens);
    const {
        signalKinds,
        wordTokenizerException,
    } = buildSignalKinds({
        item,
        joinedTokenReading,
        normalizedCardReading,
        exceptionMap,
    });
    const requiresAttention = signalKindsRequireAttention({ item, signalKinds, wordTokenizerException });

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
        tokenizerException: summarizeWordTokenizerException(wordTokenizerException),
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
        wordSegmentationContextItems: 0,
        wordTokenizerReadingExceptionItems: 0,
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
    wordTokenizerExceptionPath = buildDefaultNlpWordTokenizationMismatchExceptionPath(),
    loadManifestFn = loadNlpModelManifest,
    loadWordTokenizerExceptionsFn = loadNlpWordTokenizationMismatchExceptions,
} = {}) {
    const validationReport = buildNlpTokenizationArtifactReport({
        artifactPath,
        artifactDir,
        manifestPath,
        loadManifestFn,
    });
    const counts = buildEmptyCounts();
    let wordTokenizerExceptionMap = new Map();
    try {
        wordTokenizerExceptionMap = buildNlpWordTokenizationMismatchExceptionMap(
            loadWordTokenizerExceptionsFn(wordTokenizerExceptionPath)
        );
    } catch (error) {
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
            errors: [`${wordTokenizerExceptionPath}: ${error.message}`],
            validationReport,
            releaseBoundary: {
                tokenizationAuditCertifiesCards: false,
                tokenizationAuditMayWriteTrackedTemplatesDirectly: false,
                tokenizationAuditClaimsReleaseReadiness: false,
                promotionRequiresHumanReview: true,
            },
        };
    }

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
                exceptionMap: wordTokenizerExceptionMap,
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
        if (signal.signalKinds.includes(WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND)) {
            counts.wordSegmentationContextItems += 1;
        }
        if (signal.signalKinds.includes(WORD_READING_EXCEPTION_SIGNAL_KIND)) {
            counts.wordTokenizerReadingExceptionItems += 1;
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
        `- word tokenizer segmentation context items: ${report.counts?.wordSegmentationContextItems || 0}`,
        `- word tokenizer reading exception items: ${report.counts?.wordTokenizerReadingExceptionItems || 0}`,
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
    WORD_READING_EXCEPTION_SIGNAL_KIND,
    WORD_SEGMENTATION_CONTEXT_SIGNAL_KIND,
    buildNlpTokenizationAuditReport,
    buildReviewSignal,
    formatNlpTokenizationAuditReport,
};
