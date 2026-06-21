const fs = require("node:fs");
const path = require("node:path");

const {
    buildWordCandidateAgreementReport,
    buildSourceFileIntegrity,
    validateSourceIntegrity,
} = require("./wordCandidateAgreementService");
const {
    buildWordInventoryExpansionCandidateReport,
    classifyKanjiScope,
    normalizeMoveTargetLevel,
    parseCandidateSourceText,
} = require("./wordInventoryExpansionCandidateService");
const { normalizePlacementMode } = require("./wordCandidateAgreementService");

const SOURCE_UNIVERSE_WARNING = "Configured-source selector only; not an official or global JLPT vocabulary universe.";

const SELECTOR_STATUSES = [
    "ready_for_editorial_review",
    "queue_inactive_reading_expansion",
    "needs_triage",
    "blocked_identity",
    "blocked_missing_dictionary",
    "blocked_missing_commonness",
    "triaged_defer",
    "triaged_reject",
    "move_candidate",
    "already_governed",
    "already_excluded",
    "kana_only_out_of_scope",
];

const STATUS_ORDER = Object.fromEntries(SELECTOR_STATUSES.map((status, index) => [status, index]));
const HAN_CHARACTER_PATTERN = /^\p{Script=Han}$/u;

function isStandaloneKanjiWritten(value = "") {
    const chars = [...String(value || "")];
    return chars.length === 1 && HAN_CHARACTER_PATTERN.test(chars[0]);
}

function sourceAllows(source = {}, use) {
    return Array.isArray(source.allowedUse) && source.allowedUse.includes(use);
}

function getCandidateDiscoverySourcesForLevel(manifest = {}, level) {
    return Object.entries(manifest.sources || {})
        .filter(([, source]) => (
            source.status === "active"
            && sourceAllows(source, "candidate-discovery")
            && source.local?.path
            && (
                !Array.isArray(source.candidatePolicy?.levels)
                || source.candidatePolicy.levels.length === 0
                || source.candidatePolicy.levels.includes(level)
            )
        ));
}

function buildSourceUniverse({ sourceId = "", source = {}, sourceSummary = null } = {}) {
    const integrity = sourceSummary?.integrity || source.local || {};
    return {
        sourceId,
        name: source.name || "",
        sourceType: source.sourceType || "",
        status: source.status || "",
        allowedUse: source.allowedUse || [],
        sourceUrl: source.origin?.url || "",
        localPath: source.local?.path || source.origin?.localPath || sourceSummary?.localPath || "",
        checkedAt: source.checkedAt || "",
        licenseStatus: source.licenseUse?.status || "",
        license: source.licenseUse?.license || "",
        rowCount: Number.isInteger(sourceSummary?.rowCount)
            ? sourceSummary.rowCount
            : (Number.isInteger(source.local?.rowCount) ? source.local.rowCount : null),
        sha256: integrity.sha256 || "",
        byteSize: Number.isInteger(integrity.byteSize) ? integrity.byteSize : null,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
    };
}

function classifyCommonExpansionSelectorRow({ expansionRow = {}, agreementRow = null } = {}) {
    const triageDecision = expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null;
    const triageStatus = triageDecision?.decision || agreementRow?.triageStatus || "untriaged";

    if (expansionRow.disposition === "already_governed" || agreementRow?.contractStatus?.status === "already_governed") {
        return "already_governed";
    }
    if (expansionRow.disposition === "already_excluded" || agreementRow?.contractStatus?.status === "already_excluded") {
        return "already_excluded";
    }
    if (expansionRow.disposition === "kana_only") {
        return "kana_only_out_of_scope";
    }
    if (triageStatus === "move_candidate") {
        return "move_candidate";
    }
    if (triageStatus === "defer_candidate") {
        return "triaged_defer";
    }
    if (triageStatus === "reject_candidate") {
        return "triaged_reject";
    }
    if (expansionRow.readingExpansionQueueActive === false) {
        return "queue_inactive_reading_expansion";
    }
    if (expansionRow.disposition === "source_template") {
        const written = expansionRow.written || agreementRow?.written || "";
        return isStandaloneKanjiWritten(written)
            ? "needs_triage"
            : "blocked_identity";
    }
    if (
        expansionRow.disposition === "likely_phrase"
        || expansionRow.disposition === "source_level_mismatch"
        || expansionRow.disposition === "kanji_scope_mismatch"
        || agreementRow?.cleanIdentity === false
        || (agreementRow?.identityRisks || []).length > 0
    ) {
        return "blocked_identity";
    }
    if (expansionRow.disposition === "no_target_kanji") {
        return "needs_triage";
    }
    if (!agreementRow?.dictionaryVerified) {
        return "blocked_missing_dictionary";
    }
    if (!agreementRow?.frequencySupported) {
        return "blocked_missing_commonness";
    }
    if (triageStatus === "keep_candidate") {
        return "ready_for_editorial_review";
    }
    return "needs_triage";
}

function summarizeSelectorRows(rows = []) {
    const selectorStatusCounts = Object.fromEntries(SELECTOR_STATUSES.map((status) => [status, 0]));
    for (const row of rows) {
        const status = SELECTOR_STATUSES.includes(row.selectorStatus) ? row.selectorStatus : "needs_triage";
        selectorStatusCounts[status] += 1;
    }
    return {
        selectedRows: rows.length,
        selectorStatusCounts,
        readyForEditorialReviewRows: selectorStatusCounts.ready_for_editorial_review,
        inactiveReadingExpansionRows: selectorStatusCounts.queue_inactive_reading_expansion,
        needsTriageRows: selectorStatusCounts.needs_triage,
        blockedRows: selectorStatusCounts.blocked_identity
            + selectorStatusCounts.blocked_missing_dictionary
            + selectorStatusCounts.blocked_missing_commonness,
        preTrustRows: rows.length,
    };
}

function normalizeReportLevels(levels = [5, 4, 3, 2, 1]) {
    const normalized = [...new Set(
        (Array.isArray(levels) ? levels : [levels])
            .map((level) => Number(level))
            .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
    )];
    return normalized.length > 0 ? normalized : [5, 4, 3, 2, 1];
}

function collectRoutingSupportLevels({ levels = [], triageDecisionsByLevelSource = {} } = {}) {
    const targetLevels = new Set(normalizeReportLevels(levels));
    const supportLevels = new Set(targetLevels);

    for (const [sourceLevelLabel, bySource] of Object.entries(triageDecisionsByLevelSource || {})) {
        const sourceLevel = normalizeMoveTargetLevel(sourceLevelLabel);
        if (!Number.isInteger(sourceLevel)) {
            continue;
        }
        for (const decisions of Object.values(bySource || {})) {
            for (const decision of Object.values(decisions || {})) {
                if (decision?.decision !== "move_candidate") {
                    continue;
                }
                const targetLevel = normalizeMoveTargetLevel(
                    decision.targetLevel ?? decision.moveToLevel ?? decision.targetJlpt
                );
                if (targetLevels.has(targetLevel) && targetLevel !== sourceLevel) {
                    supportLevels.add(sourceLevel);
                }
            }
        }
    }

    return [5, 4, 3, 2, 1].filter((level) => supportLevels.has(level));
}

function buildReadingExpansionGate({ level, signal = null, enforceReadingExpansionGate = false } = {}) {
    if (!signal) {
        return {
            active: !enforceReadingExpansionGate,
            status: enforceReadingExpansionGate ? "inactive" : "not_evaluated",
            readingExhausted: enforceReadingExpansionGate ? false : null,
            fullyExpanded: false,
            readingStatus: "not_evaluated",
            enhancementStatus: "not_evaluated",
            placementStatus: "not_evaluated",
            activeItems: null,
            editorialReviewItems: null,
            promoteCuratedExampleItems: null,
            deferVariantItems: null,
            totalItems: null,
            reason: enforceReadingExpansionGate
                ? `N${level} common-word expansion is inactive until reading expansion is evaluated and exhausted.`
                : "Reading expansion gate was not provided to this in-memory report.",
            blockers: enforceReadingExpansionGate
                ? ["reading expansion gate was not provided."]
                : [],
        };
    }

    const fullSignal = signal.reading ? signal : null;
    const readingSignal = fullSignal ? fullSignal.reading : signal;
    const enhancementSignal = fullSignal?.enhancement || null;
    const placementSignal = fullSignal?.placement || null;
    const readingExhausted = readingSignal.status === "exhausted";
    const firstStageFullyExpanded = fullSignal
        ? fullSignal.fullyExpanded === true
        : readingExhausted;
    const active = readingExhausted;
    const gateReason = active
        ? "Reading expansion is exhausted; common-word expansion queue is active for this level. Enhancement and placement signals are reported as context, not activation blockers."
        : fullSignal
        ? [
            `N${level} reading expansion is not exhausted; common-word expansion queue is inactive.`,
            readingSignal.reason,
        ].filter(Boolean).join(" ")
        : (readingSignal.reason || `N${level} reading expansion is not exhausted; common-word expansion queue is inactive.`);

    return {
        active,
        status: active ? "active" : "inactive",
        readingExhausted,
        fullyExpanded: firstStageFullyExpanded,
        readingStatus: readingSignal.status || "unknown",
        enhancementStatus: enhancementSignal?.status || "not_evaluated",
        placementStatus: placementSignal?.status || "not_evaluated",
        activeItems: readingSignal.activeItems ?? null,
        editorialReviewItems: readingSignal.editorialReviewItems ?? null,
        promoteCuratedExampleItems: readingSignal.promoteCuratedExampleItems ?? null,
        deferVariantItems: readingSignal.deferVariantItems ?? null,
        totalItems: readingSignal.totalItems ?? null,
        enhancementKeepCandidates: enhancementSignal?.keepCandidates ?? null,
        enhancementUntriagedCandidates: enhancementSignal?.untriagedCandidateRows ?? null,
        enhancementMoveCandidates: enhancementSignal?.moveCandidates ?? null,
        enhancementCrossLevelRoutingRows: enhancementSignal?.crossLevelRoutingRows ?? null,
        placementViolationCount: placementSignal?.violationCount ?? null,
        reason: gateReason,
        blockers: readingSignal.blockers || [],
    };
}

function compareSelectorRows(a, b) {
    return (
        (STATUS_ORDER[a.selectorStatus] ?? 99) - (STATUS_ORDER[b.selectorStatus] ?? 99)
        || a.reviewReadiness.nextEvidenceCount - b.reviewReadiness.nextEvidenceCount
        || b.reviewReadiness.supportedEvidenceCount - a.reviewReadiness.supportedEvidenceCount
        || a.written.localeCompare(b.written, "ja")
        || a.reading.localeCompare(b.reading, "ja")
    );
}

function buildTargetLearnerFitRisks({ scope = {}, sameWrittenConflicts = [] } = {}) {
    const risks = [];
    if ((scope.harderKanji || []).length > 0) {
        risks.push(`harder support kanji ${scope.harderKanji.map((entry) => `${entry.kanji}=N${entry.level}`).join(", ")}`);
    }
    if ((scope.outsideJlptKanji || []).length > 0) {
        risks.push(`outside-JLPT kanji ${scope.outsideJlptKanji.map((entry) => entry.kanji).join(", ")}`);
    }
    if ((sameWrittenConflicts || []).length > 0) {
        risks.push("same-written alternate already tracked");
    }
    return risks;
}

function classifyRoutedMoveCandidateRow({ sourceRow = {}, targetGate = {} } = {}) {
    if (targetGate.active === false) {
        return "queue_inactive_reading_expansion";
    }
    if (sourceRow.cleanIdentity === false || (sourceRow.identityRisks || []).length > 0) {
        return "blocked_identity";
    }
    if (!sourceRow.dictionaryVerified) {
        return "blocked_missing_dictionary";
    }
    if (!sourceRow.frequencySupported) {
        return "blocked_missing_commonness";
    }
    return "needs_triage";
}

function buildRoutedMoveCandidateRow({ sourceRow = {}, targetLevel, targetGate = {}, jlptLevelContract = {} } = {}) {
    const scope = classifyKanjiScope(sourceRow, { targetLevel, jlptLevelContract });
    const triageDecision = sourceRow.triageDecision || null;
    const sameWrittenConflicts = sourceRow.sameWrittenConflicts || [];
    return {
        ...sourceRow,
        selectorStatus: classifyRoutedMoveCandidateRow({ sourceRow, targetGate }),
        sourceDisposition: "routed_move_candidate",
        sourceReason: `source-level move_candidate routed this row to N${targetLevel}; physical target-level starter/contract placement is still missing`,
        targetLevel,
        routedFromLevel: sourceRow.targetLevel || sourceRow.sourceLevel || null,
        routedFromSourceLevel: sourceRow.sourceLevel || null,
        routedFromSourceIds: sourceRow.sourceIds || [],
        targetKanji: scope.targetKanji.map((entry) => entry.kanji),
        constituentKanji: scope.constituentKanji,
        kanjiLevels: scope.kanjiLevels,
        learnerFitRisks: buildTargetLearnerFitRisks({ scope, sameWrittenConflicts }),
        triageDecision,
        sourceTriageDecision: triageDecision,
        routing: {
            type: "move_candidate_target_queue",
            sourceLevel: sourceRow.targetLevel || null,
            sourceJlptLevel: sourceRow.sourceLevel || null,
            targetLevel,
            decision: triageDecision?.decision || "",
            reason: triageDecision?.reason || "",
        },
    };
}

function mergeRoutedMoveCandidatesIntoTargetReport({
    targetReport,
    sourceReports = [],
    jlptLevelContract = {},
    limit = 40,
} = {}) {
    if (!targetReport) {
        return targetReport;
    }
    const targetLevel = targetReport.level;
    const rowsByKey = new Map((targetReport.rows || []).map((row) => [row.key, row]));
    const routedRows = [];
    const routedSummary = {
        totalMoveCandidatesToTarget: 0,
        alreadyGovernedOrExcluded: 0,
        alreadyVisibleInTargetRows: 0,
        targetQueueRows: 0,
        addedTargetQueueRows: 0,
    };

    for (const sourceReport of sourceReports || []) {
        if (!sourceReport || sourceReport.level === targetLevel) {
            continue;
        }
        for (const sourceRow of sourceReport.rows || []) {
            const triageDecision = sourceRow.triageDecision || null;
            if (triageDecision?.decision !== "move_candidate" || triageDecision.targetLevel !== targetLevel) {
                continue;
            }
            routedSummary.totalMoveCandidatesToTarget += 1;

            const contractStatus = sourceRow.contractStatus?.status || "not_governed";
            if (contractStatus === "already_governed" || contractStatus === "already_excluded") {
                routedSummary.alreadyGovernedOrExcluded += 1;
                continue;
            }
            if (rowsByKey.has(sourceRow.key)) {
                const existingRow = rowsByKey.get(sourceRow.key);
                existingRow.sourceTriageDecision = existingRow.sourceTriageDecision || triageDecision;
                existingRow.routing = existingRow.routing || {
                    type: "move_candidate_target_queue",
                    sourceLevel: sourceReport.level,
                    sourceJlptLevel: sourceRow.sourceLevel || null,
                    targetLevel,
                    decision: triageDecision.decision,
                    reason: triageDecision.reason || "",
                };
                routedSummary.alreadyVisibleInTargetRows += 1;
                routedSummary.targetQueueRows += 1;
                continue;
            }

            const routedRow = buildRoutedMoveCandidateRow({
                sourceRow,
                targetLevel,
                targetGate: targetReport.commonWordQueue || {},
                jlptLevelContract,
            });
            rowsByKey.set(routedRow.key, routedRow);
            routedRows.push(routedRow);
            routedSummary.targetQueueRows += 1;
            routedSummary.addedTargetQueueRows += 1;
        }
    }

    if (routedSummary.totalMoveCandidatesToTarget === 0) {
        return {
            ...targetReport,
            routedMoveCandidateSummary: routedSummary,
            routedMoveCandidateRows: [],
        };
    }

    const rows = [...rowsByKey.values()].sort(compareSelectorRows);
    return {
        ...targetReport,
        summary: {
            ...targetReport.summary,
            ...summarizeSelectorRows(rows),
            sourceRows: targetReport.summary.sourceRows,
            normalizedRows: targetReport.summary.normalizedRows,
            uniqueRows: targetReport.summary.uniqueRows,
            duplicateSourceRows: targetReport.summary.duplicateSourceRows,
            sourceDispositionCounts: {
                ...(targetReport.summary.sourceDispositionCounts || {}),
                routed_move_candidate: routedSummary.addedTargetQueueRows,
            },
            routedMoveCandidateRows: routedSummary.targetQueueRows,
            addedRoutedMoveCandidateRows: routedSummary.addedTargetQueueRows,
        },
        rows,
        shownRows: rows.slice(0, limit),
        routedMoveCandidateSummary: routedSummary,
        routedMoveCandidateRows: routedRows.sort(compareSelectorRows),
    };
}

function buildAgreementRowIndex(agreementLevelReport = {}) {
    return new Map((agreementLevelReport.rows || []).map((row) => [row.key, row]));
}

function buildSelectorRow({ expansionRow = {}, agreementRow = null, sourceUniverse = {} } = {}) {
    const selectorStatus = classifyCommonExpansionSelectorRow({ expansionRow, agreementRow });
    const sourceAppearance = (agreementRow?.sourceAppearances || [])
        .find((appearance) => appearance.sourceId === sourceUniverse.sourceId) || null;
    return {
        key: expansionRow.key,
        written: expansionRow.written,
        reading: expansionRow.reading,
        meaning: expansionRow.meaning || agreementRow?.meaning || "",
        selectorStatus,
        sourceDisposition: expansionRow.disposition,
        sourceReason: expansionRow.reason,
        targetLevel: expansionRow.targetLevel || agreementRow?.targetLevel || null,
        sourceLevel: expansionRow.sourceLevel ?? sourceAppearance?.sourceLevel ?? null,
        sourceIds: agreementRow?.sourceIds || [sourceUniverse.sourceId].filter(Boolean),
        sourceAppearances: agreementRow?.sourceAppearances || [],
        dictionaryVerified: Boolean(agreementRow?.dictionaryVerified),
        frequencySupported: Boolean(agreementRow?.frequencySupported),
        sentenceSupported: Boolean(agreementRow?.sentenceSupported),
        pitchSupported: Boolean(agreementRow?.pitchSupported),
        cleanIdentity: Boolean(agreementRow?.cleanIdentity) || expansionRow.disposition === "review_candidate",
        identityRisks: agreementRow?.identityRisks || [],
        learnerFitRisks: agreementRow?.learnerFitRisks || [],
        sameWrittenConflicts: agreementRow?.sameWrittenConflicts || expansionRow.sameWrittenContractEntries || [],
        triageDecision: expansionRow.triageDecision || agreementRow?.triageDecisions?.[0] || null,
        sourceTriageDecision: null,
        contractStatus: agreementRow?.contractStatus || null,
        targetKanji: expansionRow.targetKanji || agreementRow?.targetKanji || [],
        constituentKanji: expansionRow.constituentKanji || [],
        kanjiLevels: expansionRow.kanjiLevels || agreementRow?.kanjiLevels || [],
        reviewReadiness: agreementRow?.reviewReadiness || {
            supportedEvidenceCount: 0,
            supportedEvidenceTotal: 5,
            nextEvidenceCount: 0,
            learnerFitRiskCount: 0,
            sameWrittenConflictCount: 0,
            identityRiskCount: 0,
        },
        nextRequiredEvidence: agreementRow?.nextRequiredEvidence || [],
    };
}

function loadSourceRows({ sourceId, source, readFile = fs.readFileSync } = {}) {
    const sourcePath = path.resolve(process.cwd(), source.local?.path || "");
    if (!source.local?.path || !fs.existsSync(sourcePath)) {
        return {
            sourceRows: [],
            integrity: null,
            blockers: [`${sourceId}: missing local source file ${source.local?.path || "(missing path)"}`],
        };
    }

    const sourceBuffer = readFile(sourcePath);
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    const sourceRows = parseCandidateSourceText(buffer.toString("utf8"), {
        format: source.local.format || "auto",
    });
    const integrity = buildSourceFileIntegrity({ sourceBuffer: buffer, sourceRows });
    const blockers = validateSourceIntegrity(source, integrity).map((blocker) => `${sourceId}: ${blocker}`);

    return {
        sourceRows,
        integrity,
        blockers,
    };
}

function buildLevelSelectorReport({
    level,
    manifest,
    sourceSummariesById,
    agreementLevelReport,
    jlptLevelContract,
    jlptWordLevelContract,
    triageDecisionsByLevelSource = {},
    limit = 40,
    placementMode = "kanji-anchor",
    readingExpansionSignal = null,
    sourceAdequacy = null,
    enforceReadingExpansionGate = false,
    readFile = fs.readFileSync,
} = {}) {
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const candidateSources = getCandidateDiscoverySourcesForLevel(manifest, level);
    const blockers = [];
    const readingExpansionGate = buildReadingExpansionGate({
        level,
        signal: readingExpansionSignal,
        enforceReadingExpansionGate,
    });
    blockers.push(...readingExpansionGate.blockers.map((blocker) => `N${level}: ${blocker}`));
    if (candidateSources.length !== 1) {
        blockers.push(`N${level}: expected exactly one active candidate-discovery source, found ${candidateSources.length}.`);
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            sourceAdequacy,
            sourceUniverse: null,
            sourceCandidateSummary: null,
            summary: summarizeSelectorRows([]),
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const [sourceId, source] = candidateSources[0];
    const loadedSource = loadSourceRows({ sourceId, source, readFile });
    blockers.push(...loadedSource.blockers);
    const sourceUniverse = buildSourceUniverse({
        sourceId,
        source,
        sourceSummary: sourceSummariesById.get(sourceId) || null,
    });

    if (loadedSource.blockers.length > 0) {
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            sourceAdequacy,
            sourceUniverse,
            sourceCandidateSummary: null,
            summary: summarizeSelectorRows([]),
            rows: [],
            shownRows: [],
            blockers,
        };
    }

    const candidatePolicy = source.candidatePolicy || {};
    const expansionReport = buildWordInventoryExpansionCandidateReport({
        sourceRows: loadedSource.sourceRows,
        targetLevel: level,
        kanjiScope: candidatePolicy.kanjiScope || "known-jlpt",
        requireSourceLevel: Boolean(candidatePolicy.requireSourceLevel),
        sourceLabel: sourceId,
        limit: Number.MAX_SAFE_INTEGER,
        triageDecisions: triageDecisionsByLevelSource?.[`N${level}`]?.[sourceId] || {},
        jlptLevelContract,
        jlptWordLevelContract,
        placementMode: normalizedPlacementMode,
    });

    const agreementRowsByKey = buildAgreementRowIndex(agreementLevelReport);
    const rows = expansionReport.allRows
        .map((expansionRow) => buildSelectorRow({
            expansionRow: {
                ...expansionRow,
                readingExpansionQueueActive: readingExpansionGate.active,
            },
            agreementRow: agreementRowsByKey.get(expansionRow.key) || null,
            sourceUniverse,
        }))
        .sort(compareSelectorRows);
    const summary = {
        ...summarizeSelectorRows(rows),
        sourceRows: expansionReport.summary.sourceRows,
        normalizedRows: expansionReport.summary.normalizedRows,
        uniqueRows: expansionReport.summary.uniqueRows,
        duplicateSourceRows: expansionReport.summary.duplicateSourceRows,
        sourceDispositionCounts: expansionReport.summary.dispositions,
    };

    return {
        level,
        levelLabel: `N${level}`,
        commonWordQueue: readingExpansionGate,
        sourceAdequacy,
        sourceUniverse: {
            ...sourceUniverse,
            rowCount: loadedSource.integrity?.rowCount ?? sourceUniverse.rowCount,
            sha256: loadedSource.integrity?.sha256 || sourceUniverse.sha256,
            byteSize: loadedSource.integrity?.byteSize ?? sourceUniverse.byteSize,
        },
        sourceCandidateSummary: expansionReport.summary,
        summary,
        rows,
        shownRows: rows.slice(0, limit),
        blockers,
    };
}

function buildWordCommonExpansionSelectorReport({
    levels = [5, 4, 3, 2, 1],
    manifest,
    jlptLevelContract = {},
    jlptWordLevelContract = {},
    starterEntries = {},
    wordPitchAccentData = {},
    triageDecisionsByLevelSource = {},
    limit = 40,
    placementMode = "kanji-anchor",
    readingExpansionSignalsByLevel = {},
    sourceAdequacyByLevel = {},
    enforceReadingExpansionGate = false,
    readFile = fs.readFileSync,
} = {}) {
    const normalizedPlacementMode = normalizePlacementMode(placementMode);
    const reportLevels = normalizeReportLevels(levels);
    const analysisLevels = collectRoutingSupportLevels({
        levels: reportLevels,
        triageDecisionsByLevelSource,
    });
    const agreementReport = buildWordCandidateAgreementReport({
        levels: analysisLevels,
        manifest,
        jlptLevelContract,
        jlptWordLevelContract,
        starterEntries,
        wordPitchAccentData,
        triageDecisionsByLevelSource,
        limit: Number.MAX_SAFE_INTEGER,
        placementMode: normalizedPlacementMode,
        readFile,
    });
    const sourceSummariesById = new Map(agreementReport.sourceSummaries.map((summary) => [summary.sourceId, summary]));
    const agreementReportsByLevel = new Map(agreementReport.levelReports.map((levelReport) => [levelReport.level, levelReport]));
    const analysisLevelReports = analysisLevels.map((level) => buildLevelSelectorReport({
        level,
        manifest,
        sourceSummariesById,
        agreementLevelReport: agreementReportsByLevel.get(level) || null,
        jlptLevelContract,
        jlptWordLevelContract,
        triageDecisionsByLevelSource,
        limit,
        placementMode: normalizedPlacementMode,
        readingExpansionSignal: readingExpansionSignalsByLevel?.[level] || null,
        sourceAdequacy: sourceAdequacyByLevel?.[level] || null,
        enforceReadingExpansionGate: reportLevels.includes(level) ? enforceReadingExpansionGate : false,
        readFile,
    }));
    const analysisReportsByLevel = new Map(analysisLevelReports.map((levelReport) => [levelReport.level, levelReport]));
    const levelReports = reportLevels.map((level) => mergeRoutedMoveCandidatesIntoTargetReport({
        targetReport: analysisReportsByLevel.get(level),
        sourceReports: analysisLevelReports,
        jlptLevelContract,
        limit,
    }));
    const blockers = [
        ...agreementReport.sourceBlockers,
        ...analysisLevelReports.flatMap((levelReport) => levelReport.blockers || []),
    ];

    return {
        reportName: "word-common-expansion-selector",
        manifestVersion: agreementReport.manifestVersion,
        manifestCheckedAt: agreementReport.manifestCheckedAt,
        placementMode: normalizedPlacementMode,
        configuredSourceOnly: true,
        warning: SOURCE_UNIVERSE_WARNING,
        sourceAdequacyByLevel,
        levels: reportLevels,
        routingSupportLevels: analysisLevels.filter((level) => !reportLevels.includes(level)),
        placementAudit: agreementReport.placementAudit,
        sourceSummaries: agreementReport.sourceSummaries,
        sourceBlockers: agreementReport.sourceBlockers,
        blockers,
        summary: {
            levels: levelReports.length,
            rows: levelReports.reduce((total, levelReport) => total + levelReport.summary.selectedRows, 0),
            readyForEditorialReviewRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.readyForEditorialReviewRows, 0),
            inactiveReadingExpansionRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.inactiveReadingExpansionRows, 0),
            needsTriageRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.needsTriageRows, 0),
            blockedRows: levelReports.reduce((total, levelReport) => total + levelReport.summary.blockedRows, 0),
            routedMoveCandidateRows: levelReports.reduce((total, levelReport) => total + (levelReport.summary.routedMoveCandidateRows || 0), 0),
            inactiveReadingExpansionLevels: levelReports.filter((levelReport) => levelReport.commonWordQueue?.active === false).length,
            blockerCount: blockers.length,
        },
        levelReports,
    };
}

function formatBoolean(value) {
    return value ? "yes" : "no";
}

function formatSourceUniverse(sourceUniverse = {}) {
    if (!sourceUniverse) {
        return "none";
    }
    return [
        sourceUniverse.sourceId,
        sourceUniverse.localPath,
        `rows ${sourceUniverse.rowCount ?? "-"}`,
        sourceUniverse.sha256 ? `sha ${sourceUniverse.sha256.slice(0, 12)}` : "sha -",
        `license ${sourceUniverse.licenseStatus || "-"}`,
    ].join("; ");
}

function formatSourceAdequacy(sourceAdequacy = null) {
    if (!sourceAdequacy) {
        return "not evaluated";
    }
    return [
        sourceAdequacy.sourceDepthComplete ? "source-depth complete" : "source-depth incomplete",
        `checked ${sourceAdequacy.checked ?? 0}`,
        `universe ${sourceAdequacy.levelUniverseStandardRows ?? 0}`,
        `not evaluated ${sourceAdequacy.sourceOriginNotEvaluatedRows ?? 0}`,
        `single-family ${sourceAdequacy.singleSourceFamilyRows ?? 0}`,
        `multi-source ${sourceAdequacy.multiSourceSupportedRows ?? 0}`,
        `disputed ${sourceAdequacy.disputedLevelClaimRows ?? 0}`,
    ].join("; ");
}

function formatWordCommonExpansionSelectorReport(report = {}) {
    const lines = [
        "Japanese Kanji Builder Governed Common-Word Silver Selector",
        "",
        "Read-only report: this does not add Silver rows, change contracts, move denominators, approve cards, or certify review lanes.",
        `Source scope: ${report.warning}`,
        `Placement mode: ${report.placementMode || "kanji-anchor"}`,
        `Routing support levels: ${(report.routingSupportLevels || []).length > 0 ? report.routingSupportLevels.map((level) => `N${level}`).join(", ") : "none"}`,
        "",
        `Manifest: version ${report.manifestVersion}; checked ${report.manifestCheckedAt}`,
        `Placement gate: ${report.placementAudit?.violationCount || 0}/${report.placementAudit?.checked || 0} word-level placement violations`,
        "",
        "Level source universe:",
        "| Level | Configured source |",
        "| --- | --- |",
    ];

    for (const levelReport of report.levelReports || []) {
        lines.push(`| ${levelReport.levelLabel} | ${formatSourceUniverse(levelReport.sourceUniverse)} |`);
    }

    lines.push(
        "",
        "Level source adequacy:",
        "| Level | Source adequacy |",
        "| --- | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        lines.push(`| ${levelReport.levelLabel} | ${formatSourceAdequacy(levelReport.sourceAdequacy)} |`);
    }

    lines.push(
        "",
        "Selector summary:",
        "| Level | Queue | Rows | Ready | Inactive | Needs triage | Routed moves | Move | Defer | Reject | Blocked identity | Missing dictionary | Missing commonness | Already governed | Already excluded | Kana-only out of scope |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    );

    for (const levelReport of report.levelReports || []) {
        const counts = levelReport.summary.selectorStatusCounts || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            levelReport.commonWordQueue?.active ? "active" : "inactive",
            levelReport.summary.selectedRows,
            counts.ready_for_editorial_review || 0,
            counts.queue_inactive_reading_expansion || 0,
            counts.needs_triage || 0,
            levelReport.summary.routedMoveCandidateRows || 0,
            counts.move_candidate || 0,
            counts.triaged_defer || 0,
            counts.triaged_reject || 0,
            counts.blocked_identity || 0,
            counts.blocked_missing_dictionary || 0,
            counts.blocked_missing_commonness || 0,
            counts.already_governed || 0,
            counts.already_excluded || 0,
            counts.kana_only_out_of_scope || 0,
        ].join(" | ") + " |");
    }

    lines.push("", "Common-word queue gate:");
    for (const levelReport of report.levelReports || []) {
        const gate = levelReport.commonWordQueue || {};
        lines.push(`- ${levelReport.levelLabel}: ${gate.active ? "active" : "inactive"}; reading exhausted ${gate.readingExhausted ? "yes" : "no"}; first-stage fully expanded ${gate.fullyExpanded ? "yes" : "no"}; reading ${gate.readingStatus || "not_evaluated"} active ${gate.activeItems ?? "-"}; enhancement ${gate.enhancementStatus || "not_evaluated"} keep ${gate.enhancementKeepCandidates ?? "-"} untriaged ${gate.enhancementUntriagedCandidates ?? "-"}; placement ${gate.placementStatus || "not_evaluated"} violations ${gate.placementViolationCount ?? "-"}; ${gate.reason || ""}`);
    }

    const blockers = report.blockers || [];
    if (blockers.length > 0) {
        lines.push("", "Selector blockers:");
        for (const blocker of blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    for (const levelReport of report.levelReports || []) {
        lines.push("", `${levelReport.levelLabel} rows shown (${levelReport.shownRows.length}/${levelReport.summary.selectedRows}):`);
        if (levelReport.shownRows.length === 0) {
            lines.push("- none");
            continue;
        }
        levelReport.shownRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.written} (${row.reading})`);
            lines.push(`   status: ${row.selectorStatus}; source disposition: ${row.sourceDisposition}`);
            lines.push(`   support: dictionary ${formatBoolean(row.dictionaryVerified)}, commonness ${formatBoolean(row.frequencySupported)}, sentence ${formatBoolean(row.sentenceSupported)}, pitch ${formatBoolean(row.pitchSupported)}, clean identity ${formatBoolean(row.cleanIdentity)}`);
            if (row.triageDecision) {
                lines.push(`   triage: ${row.triageDecision.decision} [${row.triageDecision.priority || "normal"}] - ${row.triageDecision.reason}`);
                if (Number.isInteger(row.triageDecision.targetLevel)) {
                    lines.push(`   triage target level: N${row.triageDecision.targetLevel}`);
                }
            }
            if (row.sameWrittenConflicts.length > 0) {
                lines.push(`   same-written conflicts: ${row.sameWrittenConflicts.map((entry) => `${entry.reading} (${entry.status || entry.type}${entry.jlpt ? ` N${entry.jlpt}` : ""})`).join(", ")}`);
            }
            if (row.learnerFitRisks.length > 0) {
                lines.push(`   learner-fit risks: ${row.learnerFitRisks.join("; ")}`);
            }
            if (row.nextRequiredEvidence.length > 0) {
                lines.push(`   next evidence: ${row.nextRequiredEvidence.join("; ")}`);
            }
        });
    }

    return `${lines.join("\n")}\n`;
}

module.exports = {
    SELECTOR_STATUSES,
    SOURCE_UNIVERSE_WARNING,
    buildLevelSelectorReport,
    buildReadingExpansionGate,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
    getCandidateDiscoverySourcesForLevel,
    summarizeSelectorRows,
};
