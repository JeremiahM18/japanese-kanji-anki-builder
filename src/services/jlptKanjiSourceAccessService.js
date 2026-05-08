const MANUAL_REVIEW_STATUSES = Object.freeze([
    "reviewed",
    "needs_review",
    "blocked",
    "source_access_gap",
]);

function countReviewStatuses(rows = [], sourceInput = {}) {
    const reviewStatusColumn = sourceInput.reviewStatusColumn || "reviewStatus";
    const defaultReviewStatus = sourceInput.defaultReviewStatus || "needs_review";
    return rows.reduce((counts, row) => {
        const status = String(row?.[reviewStatusColumn] || defaultReviewStatus).trim();
        counts[status] = (counts[status] || 0) + 1;
        return counts;
    }, {});
}

function countResolvedRows(counts = {}) {
    return (counts.reviewed || 0)
        + (counts.blocked || 0)
        + (counts.source_access_gap || 0);
}

function formatPercent(numerator, denominator) {
    if (!denominator) {
        return "0.0%";
    }
    return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatSupportedLevels(levels = []) {
    return (levels || [])
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
        .sort((a, b) => a - b)
        .map((level) => `N${level}`)
        .join(", ");
}

function hasKanjiReviewSourceType(source = {}) {
    return String(source.sourceType || "").includes("kanji-review");
}

function isManualAssignmentLane(source = {}) {
    return source.sourceKind === "assignment"
        && source.allowedUse === "manual-citation-only"
        && source.canStoreAssignments === true;
}

function resolveSourceAccessDecision({ source = {}, sourceFile = {}, sourceInputStatusCounts = {} } = {}) {
    if (!source || Object.keys(source).length === 0) {
        return {
            rank: 95,
            action: "undeclared_source",
            reason: "The source input has no matching source-use declaration in the evidence manifest.",
            nextStep: "Declare source-use policy before creating or importing evidence rows.",
        };
    }

    if (["blocked", "deprecated"].includes(source.status)) {
        return {
            rank: 90,
            action: "do_not_use",
            reason: `The source lane is ${source.status}.`,
            nextStep: "Leave it out of source review unless source-use policy changes.",
        };
    }

    if (source.sourceKind === "derived") {
        return {
            rank: 85,
            action: "derived_summary_only",
            reason: "Derived sources summarize other lanes and must not be reviewed or imported manually.",
            nextStep: "Review the individual source lanes named by derivedFromSources instead.",
        };
    }

    if (source.positiveEvidenceOnly === true || source.sourceKind === "occurrence") {
        return {
            rank: 80,
            action: "positive_occurrence_only",
            reason: "This lane can show that kanji appeared in a source, but it cannot assign JLPT kanji levels.",
            nextStep: "Use it as occurrence support only; do not use absence as negative evidence.",
        };
    }

    if (source.sourceKind !== "assignment") {
        return {
            rank: 75,
            action: "not_assignment_evidence",
            reason: `The source kind is ${source.sourceKind || "unknown"}, not assignment.`,
            nextStep: "Keep it out of assignment consensus.",
        };
    }

    if (source.allowedUse === "bulk-import") {
        return {
            rank: 60,
            action: "already_bulk_governed",
            reason: "This lane is handled by a governed bulk-import path, not manual textbook review.",
            nextStep: "Re-run its strict source-input preflight before changing or re-importing it.",
        };
    }

    if (!isManualAssignmentLane(source)) {
        return {
            rank: 55,
            action: "source_use_not_ready",
            reason: "The lane is not yet governed as a manual assignment source.",
            nextStep: "Fix source-use metadata before reviewing rows.",
        };
    }

    if (source.japanesePublished !== true) {
        return {
            rank: 45,
            action: "secondary_non_japanese_signal",
            reason: "This can add an independent assignment signal, but it does not close the Japanese-published evidence gap.",
            nextStep: "Use after Japanese-published assignment lanes are no longer the dominant blocker.",
        };
    }

    if (!hasKanjiReviewSourceType(source)) {
        return {
            rank: 30,
            action: "confirm_kanji_assignment_surface",
            reason: "The lane is a Japanese-published level-study source, but it is not declared as a dedicated kanji-review source.",
            nextStep: "Confirm exact kanji assignment evidence before activating or reviewing it as taxonomy evidence.",
        };
    }

    if (source.status === "active") {
        const reviewed = sourceInputStatusCounts.reviewed || 0;
        const gaps = sourceInputStatusCounts.source_access_gap || 0;
        const pending = sourceInputStatusCounts.needs_review || 0;
        if (gaps > reviewed && pending > 0) {
            return {
                rank: 20,
                action: "pause_broad_review_until_exact_access",
                reason: `The current worksheet has more source-access gaps (${gaps}) than reviewed assignment rows (${reviewed}).`,
                nextStep: "Resume only with fuller exact assignment access or targeted citations; do not keep burning the same broad queue.",
            };
        }
        return {
            rank: 10,
            action: "continue_targeted_exact_assignment_review",
            reason: "The active lane can still vote when rows have exact source-level assignment evidence.",
            nextStep: "Review only rows where exact assignment proof is available, then promote at milestones.",
        };
    }

    if (["planned", "in_review"].includes(source.status)) {
        return {
            rank: 0,
            action: "source_access_spike_next",
            reason: sourceFile.exists
                ? "The lane is a Japanese-published kanji assignment source with a local worksheet ready for governed review setup."
                : "The lane is a Japanese-published kanji assignment source, but no local reviewed worksheet exists yet.",
            nextStep: "Verify source access, review positive exact assignments only, pin the worksheet, then activate intentionally before import.",
        };
    }

    return {
        rank: 50,
        action: "needs_manual_decision",
        reason: `The source status is ${source.status || "unknown"}.`,
        nextStep: "Review the source-use manifest before creating more worksheet rows.",
    };
}

function buildSourceAccessLaneSummary({
    sourceId,
    source = {},
    sourceInput = null,
    sourceFile = {},
    assignmentCount = 0,
    sourceInputStatusCounts = {},
} = {}) {
    const resolvedRows = countResolvedRows(sourceInputStatusCounts);
    const rowCount = sourceFile.rowCount || 0;
    const decision = resolveSourceAccessDecision({ source, sourceFile, sourceInputStatusCounts });

    return {
        sourceId,
        rank: decision.rank,
        action: decision.action,
        reason: decision.reason,
        nextStep: decision.nextStep,
        status: source.status || "undeclared",
        sourceKind: source.sourceKind || "undeclared",
        sourceType: source.sourceType || "",
        allowedUse: source.allowedUse || "undeclared",
        licenseStatus: source.licenseStatus || "undeclared",
        japanesePublished: source.japanesePublished === true,
        countsForConsensus: source.countsForConsensus !== false,
        canStoreAssignments: source.canStoreAssignments === true,
        canStoreRawList: source.canStoreRawList === true,
        canStoreExcerpts: source.canStoreExcerpts === true,
        positiveEvidenceOnly: source.positiveEvidenceOnly === true,
        sourcePath: sourceInput?.sourcePath || "",
        supportedLevels: sourceInput?.supportedLevels || [],
        sourceFileExists: sourceFile.exists === true,
        sourceFileRows: rowCount,
        trackedAssignments: assignmentCount,
        worksheet: {
            rowCount,
            resolvedRows,
            reviewed: sourceInputStatusCounts.reviewed || 0,
            pending: sourceInputStatusCounts.needs_review || 0,
            blocked: sourceInputStatusCounts.blocked || 0,
            sourceAccessGap: sourceInputStatusCounts.source_access_gap || 0,
            resolvedRatio: formatPercent(resolvedRows, rowCount),
            sourceAccessGapRatio: formatPercent(sourceInputStatusCounts.source_access_gap || 0, Math.max(1, resolvedRows)),
        },
    };
}

function summarizeWorklistPriorities(rows = []) {
    return rows.reduce((counts, row) => {
        const priority = row.reviewPriority || "unknown";
        counts[priority] = (counts[priority] || 0) + 1;
        return counts;
    }, {});
}

function sortPriorityCounts(counts = {}) {
    return Object.fromEntries(
        Object.entries(counts)
            .sort(([, countA], [, countB]) => countB - countA)
    );
}

function buildJlptKanjiSourceAccessReport({
    evidence = {},
    sourceInputs = {},
    sourceFiles = {},
    sourceInputStatusCountsBySource = {},
    worklistRows = [],
    sourceId = null,
} = {}) {
    const inputSourceIds = Object.keys(sourceInputs.inputs || {});
    const manifestSourceIds = Object.keys(evidence.sources || {});
    const sourceIds = [...new Set([...manifestSourceIds, ...inputSourceIds])]
        .filter((id) => !sourceId || id === sourceId)
        .sort((a, b) => a.localeCompare(b));
    const lanes = sourceIds
        .map((id) => buildSourceAccessLaneSummary({
            sourceId: id,
            source: evidence.sources?.[id] || {},
            sourceInput: sourceInputs.inputs?.[id] || null,
            sourceFile: sourceFiles[id] || {},
            assignmentCount: Object.keys(evidence.assignments?.[id] || {}).length,
            sourceInputStatusCounts: sourceInputStatusCountsBySource[id] || {},
        }))
        .sort((left, right) => (
            left.rank - right.rank
            || right.japanesePublished - left.japanesePublished
            || left.sourceId.localeCompare(right.sourceId)
        ));
    const worklistPriorityCounts = sortPriorityCounts(summarizeWorklistPriorities(worklistRows));

    return {
        valid: true,
        readOnly: true,
        noDeckMutation: true,
        sourceId,
        checkedSourceCount: lanes.length,
        worklist: {
            totalRowsNeedingReview: worklistRows.length,
            priorityCounts: worklistPriorityCounts,
            dominantPriority: Object.keys(worklistPriorityCounts)[0] || "none",
        },
        recommended: lanes.slice(0, 5),
        lanes,
    };
}

function formatCounts(counts = {}) {
    return Object.entries(counts)
        .map(([key, count]) => `${key}: ${count}`)
        .join(", ") || "none";
}

function formatLaneLine(lane = {}) {
    const worksheet = lane.worksheet || {};
    const supportedLevels = formatSupportedLevels(lane.supportedLevels || []);
    return `- ${lane.sourceId}: ${lane.action}; status ${lane.status}; `
        + `tracked assignments ${lane.trackedAssignments}; worksheet reviewed ${worksheet.reviewed || 0}, `
        + `gaps ${worksheet.sourceAccessGap || 0}, pending ${worksheet.pending || 0}; `
        + `${supportedLevels ? `supported levels ${supportedLevels}; ` : ""}${lane.nextStep}`;
}

function formatJlptKanjiSourceAccessReport(report = {}, { limit = 12 } = {}) {
    const cappedLanes = (report.lanes || []).slice(0, Math.max(1, limit || 12));
    const recommended = (report.recommended || []).slice(0, 3);
    return [
        "JLPT Kanji Source Access Audit",
        "",
        "Mode: read-only",
        `No deck mutation: ${report.noDeckMutation === false ? "no" : "yes"}`,
        `Source filter: ${report.sourceId || "all"}`,
        "",
        "This command ranks source lanes by governed usefulness and current access state. It does not import evidence, move kanji, move words, update decks, or change readiness.",
        "",
        "Worklist pressure:",
        `- total rows needing governed source review: ${report.worklist?.totalRowsNeedingReview || 0}`,
        `- priority summary: ${formatCounts(report.worklist?.priorityCounts)}`,
        `- dominant priority: ${report.worklist?.dominantPriority || "none"}`,
        "",
        "Recommended next lanes:",
        ...(recommended.length > 0 ? recommended.map(formatLaneLine) : ["- none"]),
        "",
        "Lane detail:",
        ...(cappedLanes.length > 0 ? cappedLanes.map(formatLaneLine) : ["- none"]),
    ].join("\n");
}

module.exports = {
    MANUAL_REVIEW_STATUSES,
    buildJlptKanjiSourceAccessReport,
    buildSourceAccessLaneSummary,
    countResolvedRows,
    countReviewStatuses,
    formatJlptKanjiSourceAccessReport,
    resolveSourceAccessDecision,
    summarizeWorklistPriorities,
};
