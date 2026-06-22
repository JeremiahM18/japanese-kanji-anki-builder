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
const SOURCE_LEVEL_CLAIM_STATUS = "source_level_claim_unverified";
const SOURCE_LEVEL_CLAIM_LABEL = "Source level claim unverified";
const SOURCE_LEVEL_CLAIM_WARNING = "Source JLPT level is a discovery hint from a free/permitted source, not official or verified JLPT truth.";

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
        levelClaimStatus: SOURCE_LEVEL_CLAIM_STATUS,
        levelClaimLabel: SOURCE_LEVEL_CLAIM_LABEL,
        levelClaimWarning: SOURCE_LEVEL_CLAIM_WARNING,
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

function buildFallbackSourceGate({ level, commonWordQueue = {}, summary = {}, sourceBlockers = [] } = {}) {
    const counts = summary.selectorStatusCounts || {};
    const readyRows = counts.ready_for_editorial_review || 0;
    const needsTriageRows = counts.needs_triage || 0;
    const moveCandidateRows = counts.move_candidate || 0;
    const blockers = [];

    if (commonWordQueue.active !== true) {
        blockers.push(`N${level} reading expansion is not exhausted.`);
    }
    if ((sourceBlockers || []).length > 0) {
        blockers.push("Current source selector has unresolved blockers.");
    }
    if (readyRows > 0) {
        blockers.push(`Current new-word selector still has ${readyRows} ready row(s).`);
    }
    if (needsTriageRows > 0) {
        blockers.push(`Current new-word selector still has ${needsTriageRows} needs-triage row(s).`);
    }
    if (moveCandidateRows > 0) {
        blockers.push(`Current new-word selector still has ${moveCandidateRows} move-candidate row(s) to resolve in target levels.`);
    }

    const active = blockers.length === 0;
    return {
        active,
        status: active ? "active_after_current_selector_exhausted" : "inactive_prior_work_remaining",
        prerequisite: "after_reading_expansion_and_current_new_word_selector_exhausted",
        readyRows,
        needsTriageRows,
        moveCandidateRows,
        blockers,
        reason: active
            ? "Reading expansion and the current new-word selector are exhausted; the extra free/permitted source-family lane is READY for source-access/input work. Work is not done: imported extra rows must keep explicit unverified source-level labels."
            : "Fallback/free-source expansion is closed until reading expansion and the current new-word selector are exhausted.",
    };
}

function countValue(value) {
    return Number.isInteger(value) ? value : 0;
}

function buildWorkOrderItem({
    rank,
    lane,
    label,
    count = 0,
    status,
    blocksExtraLane = false,
    command = "",
    reason = "",
} = {}) {
    return {
        rank,
        lane,
        label,
        count,
        status,
        active: status === "active" || status === "ready" || status === "ready_no_actionable_source",
        blocksExtraLane,
        command,
        reason,
    };
}

function sourceSupportsLevel(source = {}, level) {
    const levels = Array.isArray(source.levels) ? source.levels : [];
    return levels.length === 0 || levels.includes(level);
}

function sourceIsCandidateDiscoveryLike(source = {}) {
    if (["candidate-discovery", "textbook-word-list"].includes(source.sourceKind)) {
        return true;
    }
    const allowedUse = source.allowedUse || [];
    return allowedUse.includes("candidate-discovery")
        || allowedUse.includes("level-hint")
        || allowedUse.includes("learner-fit-support");
}

function getActiveConfiguredDiscoverySourceIdsForLevel({ manifest = {}, level } = {}) {
    return new Set(Object.entries(manifest.sources || {})
        .filter(([, source]) => source.status === "active")
        .filter(([, source]) => (source.allowedUse || []).includes("candidate-discovery"))
        .filter(([, source]) => {
            const levels = source.candidatePolicy?.levels || source.levels || [];
            return levels.includes(level);
        })
        .map(([sourceId]) => sourceId));
}

function buildExtraSourceAccessByLevel({ sourceAccessReport = null, manifest = {}, levels = [5, 4, 3, 2, 1] } = {}) {
    const sources = sourceAccessReport?.sources || [];
    const result = {};

    for (const level of levels) {
        const currentConfiguredSourceIds = getActiveConfiguredDiscoverySourceIdsForLevel({ manifest, level });
        const levelCandidateSources = sources
            .filter((source) => sourceSupportsLevel(source, level))
            .filter((source) => sourceIsCandidateDiscoveryLike(source));
        const extraCandidateSources = levelCandidateSources
            .filter((source) => !currentConfiguredSourceIds.has(source.sourceId));
        const actionableSources = extraCandidateSources
            .filter((source) => [
                "review_source_access_and_pin_input",
                "import_reviewed_word_assignments",
                "resolve_license_before_voting",
            ].includes(source.recommendedAction));
        const registeredNoCurrentAccessSources = extraCandidateSources
            .filter((source) => source.recommendedAction === "registered_no_current_source_access");
        const blockedSources = extraCandidateSources
            .filter((source) => source.recommendedAction === "keep_blocked");
        const currentConfiguredPendingSources = levelCandidateSources
            .filter((source) => currentConfiguredSourceIds.has(source.sourceId))
            .filter((source) => source.recommendedAction && source.recommendedAction !== "no_action");

        result[level] = {
            hasSourceAccessContext: true,
            currentConfiguredSourceIds: [...currentConfiguredSourceIds].sort(),
            actionableExtraSourceCount: actionableSources.length,
            actionableExtraSourceIds: actionableSources.map((source) => source.sourceId).sort(),
            registeredNoCurrentAccessSourceCount: registeredNoCurrentAccessSources.length,
            registeredNoCurrentAccessSourceIds: registeredNoCurrentAccessSources.map((source) => source.sourceId).sort(),
            blockedExtraSourceCount: blockedSources.length,
            blockedExtraSourceIds: blockedSources.map((source) => source.sourceId).sort(),
            currentConfiguredSourcePendingCount: currentConfiguredPendingSources.length,
            currentConfiguredSourcePendingIds: currentConfiguredPendingSources.map((source) => source.sourceId).sort(),
        };
    }

    return result;
}

function buildExpansionWorkOrder(levelReport = {}) {
    const level = levelReport.level;
    const levelLabel = levelReport.levelLabel || `N${level}`;
    const counts = levelReport.summary?.selectorStatusCounts || {};
    const gate = levelReport.commonWordQueue || {};
    const fallbackGate = levelReport.fallbackSourceGate || {};
    const extraSourceAccess = levelReport.extraSourceAccess || {};
    const hasSourceAccessContext = extraSourceAccess.hasSourceAccessContext === true;
    const actionableExtraSourceCount = countValue(extraSourceAccess.actionableExtraSourceCount);
    const readingFastPromotions = countValue(gate.promoteCuratedExampleItems);
    const readingEditorialResearch = countValue(gate.editorialReviewItems);
    const readingDeferredVariants = countValue(gate.deferVariantItems);
    const readyRows = countValue(counts.ready_for_editorial_review);
    const needsTriageRows = countValue(counts.needs_triage);
    const moveRows = countValue(counts.move_candidate) + countValue(levelReport.summary?.routedMoveCandidateRows);
    const blockedRows = countValue(counts.blocked_identity)
        + countValue(counts.blocked_missing_dictionary)
        + countValue(counts.blocked_missing_commonness);
    const selectorDeferredRows = countValue(counts.triaged_defer);
    const rejectedRows = countValue(counts.triaged_reject);
    const gapPlanCommand = `npm run deck:words:gap-plan:n${level} -- --limit=50`;
    const selectorCommand = `npm run deck:words:vocab-expansion -- --levels=${level} --strict --limit=80`;
    const allLevelSelectorCommand = "npm run deck:words:vocab-expansion -- --levels=5,4,3,2,1 --strict --limit=80";
    const sourceAccessCommand = "npm run deck:words:source-access";
    const extraSourceStatus = fallbackGate.active
        ? (hasSourceAccessContext && actionableExtraSourceCount === 0 ? "ready_no_actionable_source" : "ready")
        : "closed";
    const extraSourceReason = (() => {
        if (!fallbackGate.active) {
            return (fallbackGate.blockers || []).join(" ") || "Closed until reading expansion and the current selector are exhausted.";
        }
        if (hasSourceAccessContext && actionableExtraSourceCount === 0) {
            return [
                "READY but no actionable extra free/permitted source family is registered right now; do not repeat source hunting for the same result.",
                "Reopen this lane only with a specific newly permitted source, paid/private source intake, publisher permission, or a source-access packet for an exact surface.",
                "Any extra rows must keep the Source level claim unverified label.",
            ].join(" ");
        }
        if (hasSourceAccessContext && actionableExtraSourceCount > 0) {
            return `READY: ${actionableExtraSourceCount} actionable extra source family record(s) need source-access/input review; every extra row must keep the Source level claim unverified label.`;
        }
        return "READY: work is not done. Add the next free/permitted source family through source-access/input review; every extra row must keep the Source level claim unverified label.";
    })();

    const items = [
        buildWorkOrderItem({
            rank: 1,
            lane: "reading_fast_promotions",
            label: "Reading fast promotions",
            count: readingFastPromotions,
            status: readingFastPromotions > 0 ? "active" : "clear",
            blocksExtraLane: readingFastPromotions > 0,
            command: gapPlanCommand,
            reason: readingFastPromotions > 0
                ? "Fast/easy reading work exists: curated or tracked support can likely be promoted after review."
                : "No fast/easy reading promotions are active.",
        }),
        buildWorkOrderItem({
            rank: 2,
            lane: "reading_editorial_research",
            label: "Reading editorial research",
            count: readingEditorialResearch,
            status: readingEditorialResearch > 0 ? "active" : "clear",
            blocksExtraLane: readingEditorialResearch > 0,
            command: gapPlanCommand,
            reason: readingEditorialResearch > 0
                ? "Reading gaps still need learner-facing source/card research before common-word expansion should be treated as the main lane."
                : "No active reading editorial research remains.",
        }),
        buildWorkOrderItem({
            rank: 3,
            lane: "current_selector_ready",
            label: "Current source ready rows",
            count: readyRows,
            status: readyRows > 0 ? "active" : "clear",
            blocksExtraLane: readyRows > 0,
            command: selectorCommand,
            reason: readyRows > 0
                ? "Governed selector rows are ready for editorial Silver review; still pre-trust and not card approvals."
                : "No ready rows remain in the current governed selector.",
        }),
        buildWorkOrderItem({
            rank: 4,
            lane: "current_selector_triage",
            label: "Current source triage",
            count: needsTriageRows,
            status: needsTriageRows > 0 ? "active" : "clear",
            blocksExtraLane: needsTriageRows > 0,
            command: selectorCommand,
            reason: needsTriageRows > 0
                ? "Current source rows still need keep/defer/reject/move decisions before extra sources open."
                : "No needs-triage rows remain in the current governed selector.",
        }),
        buildWorkOrderItem({
            rank: 5,
            lane: "move_candidate_routing",
            label: "Move-candidate routing",
            count: moveRows,
            status: moveRows > 0 ? "active" : "clear",
            blocksExtraLane: moveRows > 0,
            command: allLevelSelectorCommand,
            reason: moveRows > 0
                ? "Move candidates remain authoritative and must be resolved in their target level, not bypassed."
                : "No move-candidate routing rows remain for this level view.",
        }),
        buildWorkOrderItem({
            rank: 6,
            lane: "blocked_or_ineligible_current_rows",
            label: "Blocked or ineligible current rows",
            count: blockedRows,
            status: blockedRows > 0 ? "blocked_backlog" : "clear",
            blocksExtraLane: false,
            command: selectorCommand,
            reason: blockedRows > 0
                ? "These rows are not promotion-ready; review only if identity, dictionary, commonness, or source policy evidence changes."
                : "No blocked identity/dictionary/commonness rows are active.",
        }),
        buildWorkOrderItem({
            rank: 7,
            lane: "deferred_or_rejected_current_rows",
            label: "Deferred or rejected current rows",
            count: readingDeferredVariants + selectorDeferredRows + rejectedRows,
            status: (readingDeferredVariants + selectorDeferredRows + rejectedRows) > 0 ? "recorded_backlog" : "clear",
            blocksExtraLane: false,
            command: `npm run deck:words:gap-plan:n${level} -- --include-deferred --limit=50`,
            reason: "Deferred/rejected rows stay recorded as policy/editorial backlog; they do not silently become promotion work.",
        }),
        buildWorkOrderItem({
            rank: 8,
            lane: "extra_source_family",
            label: "Extra source-family lane",
            count: null,
            status: extraSourceStatus,
            blocksExtraLane: false,
            command: extraSourceStatus === "ready_no_actionable_source" ? "" : sourceAccessCommand,
            reason: extraSourceReason,
        }),
    ];

    const nextItem = items.find((item) => item.status === "active")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready")
        || items.find((item) => item.lane === "extra_source_family" && item.status === "ready_no_actionable_source")
        || items.find((item) => item.status === "blocked_backlog")
        || null;
    const activeBlockers = items.filter((item) => item.blocksExtraLane && item.count > 0);
    const extraLane = items.find((item) => item.lane === "extra_source_family");

    return {
        level,
        levelLabel,
        status: nextItem?.lane || "no_active_expansion_work",
        nextAction: nextItem
            ? `${nextItem.label}: ${nextItem.reason}`
            : "No active expansion work is visible under current governed inputs.",
        nextCommand: nextItem?.command || "",
        activeBlockingLaneCount: activeBlockers.length,
        extraSourceLaneReady: extraLane?.status === "ready" || extraLane?.status === "ready_no_actionable_source",
        extraSourceLaneOpen: extraLane?.status === "ready" || extraLane?.status === "ready_no_actionable_source",
        extraSourceLaneActionable: extraLane?.status === "ready",
        extraSourceAccess,
        items,
    };
}

function attachExpansionWorkOrder(levelReport = {}) {
    const extraSourceAccess = levelReport.extraSourceAccess || {};
    const fallbackSourceGate = levelReport.fallbackSourceGate || {};
    const adjustedFallbackSourceGate = fallbackSourceGate.active === true
        && extraSourceAccess.hasSourceAccessContext === true
        && countValue(extraSourceAccess.actionableExtraSourceCount) === 0
        ? {
            ...fallbackSourceGate,
            reason: "Reading expansion and the current new-word selector are exhausted; the extra free/permitted source-family lane is READY, but no actionable extra free/permitted source family is registered right now. Do not repeat source hunting for the same result. Reopen only with a specific newly permitted source, paid/private source intake, publisher permission, or a source-access packet for an exact surface. Imported extra rows must keep explicit unverified source-level labels.",
        }
        : fallbackSourceGate;
    const adjustedLevelReport = {
        ...levelReport,
        fallbackSourceGate: adjustedFallbackSourceGate,
    };
    return {
        ...adjustedLevelReport,
        expansionWorkOrder: buildExpansionWorkOrder(adjustedLevelReport),
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
    const mergedSummary = {
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
    };
    return {
        ...targetReport,
        summary: mergedSummary,
        rows,
        shownRows: rows.slice(0, limit),
        fallbackSourceGate: buildFallbackSourceGate({
            level: targetLevel,
            commonWordQueue: targetReport.commonWordQueue || {},
            summary: mergedSummary,
        }),
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
        sourceLevelClaimStatus: sourceUniverse.levelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS,
        sourceLevelClaimLabel: sourceUniverse.levelClaimLabel || SOURCE_LEVEL_CLAIM_LABEL,
        sourceLevelClaimWarning: sourceUniverse.levelClaimWarning || SOURCE_LEVEL_CLAIM_WARNING,
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
        const summary = summarizeSelectorRows([]);
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            fallbackSourceGate: buildFallbackSourceGate({
                level,
                commonWordQueue: readingExpansionGate,
                summary,
                sourceBlockers: blockers,
            }),
            sourceAdequacy,
            sourceUniverse: null,
            sourceCandidateSummary: null,
            summary,
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
        const summary = summarizeSelectorRows([]);
        return {
            level,
            levelLabel: `N${level}`,
            commonWordQueue: readingExpansionGate,
            fallbackSourceGate: buildFallbackSourceGate({
                level,
                commonWordQueue: readingExpansionGate,
                summary,
                sourceBlockers: blockers,
            }),
            sourceAdequacy,
            sourceUniverse,
            sourceCandidateSummary: null,
            summary,
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
        fallbackSourceGate: buildFallbackSourceGate({
            level,
            commonWordQueue: readingExpansionGate,
            summary,
            sourceBlockers: blockers,
        }),
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
    extraSourceAccessByLevel = {},
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
    const levelReports = reportLevels
        .map((level) => mergeRoutedMoveCandidatesIntoTargetReport({
            targetReport: analysisReportsByLevel.get(level),
            sourceReports: analysisLevelReports,
            jlptLevelContract,
            limit,
        }))
        .map((levelReport) => ({
            ...levelReport,
            extraSourceAccess: extraSourceAccessByLevel?.[levelReport.level] || null,
        }))
        .map(attachExpansionWorkOrder);
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
        extraSourceAccessByLevel,
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

function formatWorkOrderCount(count) {
    return count === null || count === undefined ? "-" : String(count);
}

function formatWorkOrderLabel(item = null) {
    if (!item) {
        return "none";
    }
    const count = item.count === null || item.count === undefined ? "" : ` (${item.count})`;
    return `${item.label}${count}`;
}

function formatExtraSourceLaneStatus(item = {}) {
    if (item.status === "ready") {
        return "READY - source input needed";
    }
    if (item.status === "ready_no_actionable_source") {
        return "READY - no actionable free source";
    }
    return "closed";
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
        `level ${sourceUniverse.levelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS}`,
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

    lines.push(
        "",
        "Expansion work order:",
        "| Level | Next work | Reading fast | Reading editorial | Selector ready | Selector triage | Move routing | Deferred/backlog | Extra source lane |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
    );
    for (const levelReport of report.levelReports || []) {
        const workOrder = levelReport.expansionWorkOrder || buildExpansionWorkOrder(levelReport);
        const itemsByLane = new Map((workOrder.items || []).map((item) => [item.lane, item]));
        const nextItem = (workOrder.items || []).find((item) => item.lane === workOrder.status) || null;
        const extraItem = itemsByLane.get("extra_source_family") || {};
        lines.push([
            `| ${levelReport.levelLabel}`,
            formatWorkOrderLabel(nextItem),
            formatWorkOrderCount(itemsByLane.get("reading_fast_promotions")?.count),
            formatWorkOrderCount(itemsByLane.get("reading_editorial_research")?.count),
            formatWorkOrderCount(itemsByLane.get("current_selector_ready")?.count),
            formatWorkOrderCount(itemsByLane.get("current_selector_triage")?.count),
            formatWorkOrderCount(itemsByLane.get("move_candidate_routing")?.count),
            formatWorkOrderCount(itemsByLane.get("deferred_or_rejected_current_rows")?.count),
            formatExtraSourceLaneStatus(extraItem),
        ].join(" | ") + " |");
    }

    lines.push("", "Expansion next commands:");
    for (const levelReport of report.levelReports || []) {
        const workOrder = levelReport.expansionWorkOrder || buildExpansionWorkOrder(levelReport);
        lines.push(`- ${levelReport.levelLabel}: ${workOrder.nextCommand || "(no command)"}; ${workOrder.nextAction}`);
    }

    lines.push("", "Common-word queue gate:");
    for (const levelReport of report.levelReports || []) {
        const gate = levelReport.commonWordQueue || {};
        lines.push(`- ${levelReport.levelLabel}: ${gate.active ? "active" : "inactive"}; reading exhausted ${gate.readingExhausted ? "yes" : "no"}; first-stage fully expanded ${gate.fullyExpanded ? "yes" : "no"}; reading ${gate.readingStatus || "not_evaluated"} active ${gate.activeItems ?? "-"}; enhancement ${gate.enhancementStatus || "not_evaluated"} keep ${gate.enhancementKeepCandidates ?? "-"} untriaged ${gate.enhancementUntriagedCandidates ?? "-"}; placement ${gate.placementStatus || "not_evaluated"} violations ${gate.placementViolationCount ?? "-"}; ${gate.reason || ""}`);
    }

    lines.push("", "Fallback/free-source gate:");
    for (const levelReport of report.levelReports || []) {
        const gate = levelReport.fallbackSourceGate || {};
        lines.push(`- ${levelReport.levelLabel}: ${gate.active ? "active" : "inactive"}; prerequisite ${gate.prerequisite || "after_reading_expansion_and_current_new_word_selector_exhausted"}; ready ${gate.readyRows ?? 0}; needs triage ${gate.needsTriageRows ?? 0}; move ${gate.moveCandidateRows ?? 0}; ${gate.reason || ""}`);
        for (const blocker of gate.blockers || []) {
            lines.push(`  - ${blocker}`);
        }
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
            lines.push(`   source level label: ${row.sourceLevelClaimLabel || SOURCE_LEVEL_CLAIM_LABEL} (${row.sourceLevelClaimStatus || SOURCE_LEVEL_CLAIM_STATUS})`);
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
    SOURCE_LEVEL_CLAIM_LABEL,
    SOURCE_LEVEL_CLAIM_STATUS,
    SOURCE_LEVEL_CLAIM_WARNING,
    SOURCE_UNIVERSE_WARNING,
    buildExtraSourceAccessByLevel,
    buildLevelSelectorReport,
    buildExpansionWorkOrder,
    buildReadingExpansionGate,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
    getCandidateDiscoverySourcesForLevel,
    summarizeSelectorRows,
};
