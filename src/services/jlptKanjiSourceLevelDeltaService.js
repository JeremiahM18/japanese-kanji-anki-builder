const {
    collectKanjiAssignments,
    evaluateKanjiSourceEvidence,
} = require("./jlptKanjiSourceEvidenceService");

const JLPT_LEVELS_DESC = Object.freeze([5, 4, 3, 2, 1]);

/**
 * @typedef {{ kanjiLevels?: Record<string, number> }} JlptLevelContract
 * @typedef {{ sourceId: string, level?: number, levelRange?: number[] }} SourceAssignmentRow
 * @typedef {{ consensusLevel?: number | null, confidence?: string, voteWeights?: Record<number, number>, assignments?: SourceAssignmentRow[] }} EvidenceResultLike
 * @typedef {{ sourceId: string, level?: number, levelRange?: number[] }} ReviewedSourceRow
 * @typedef {{ kanji?: string, sourceId: string, reviewStatus: string, level?: number | null, levelRange?: number[] | null }} SourceInputReviewRow
 * @typedef {{ kanji: string, currentContractLevel: number, targetLevel: number, sourceConsensusLevel?: number | null, confidence?: string, voteWeights?: Record<number, number>, sourceIds: string[], reviewedSources: ReviewedSourceRow[], sourceInputReviews: SourceInputReviewRow[] }} LevelDeltaRow
 * @typedef {{ kanji: string, currentContractLevel: number, reviewPriority: string, reviewReason: string, rank: number, reviewLevels: number[], sourceCandidateLevels: number[], missingFromCurrentSourceLevels: number[], sourceConsensusLevel?: number | null, confidence?: string, confidenceReasons: string[], assignmentCount: number, independentSourceCount: number, independentEvidenceLineageCount: number, japanesePublishedSourceCount: number, voteWeights?: Record<number, number>, reviewedSources: ReviewedSourceRow[], sourceInputReviews: SourceInputReviewRow[] }} SourceLevelReviewWorklistRow
 * @typedef {{ reviewed?: number, blocked?: number, source_access_gap?: number }} SourceInputReviewCounts
 * @typedef {{ missingSourceCandidatesFromCurrent: SourceInputReviewCounts, missingSourceConsensusFromCurrent: SourceInputReviewCounts, disputedMissingSourceCandidatesFromCurrent: SourceInputReviewCounts, currentContractConsensusElsewhere: SourceInputReviewCounts, currentRowsWithoutSourceCandidate: SourceInputReviewCounts, currentRowsWithoutSourceConsensus: SourceInputReviewCounts }} SourceInputReviewQueueCounts
 * @typedef {{ level: number, currentContractCount: number, sourceConsensusCount: number, sourceCandidateCount: number, sourceCandidateAlreadyCurrentCount: number, sourceCandidateMissingFromCurrentCount: number, sourceConsensusAlreadyCurrentCount: number, sourceConsensusMissingFromCurrentCount: number, currentRowsWithoutSourceCandidateCount: number, currentRowsWithoutSourceConsensusCount: number, sourceClaimCounts: Record<string, number>, sourceInputReviewCounts: SourceInputReviewQueueCounts, sourceClaimsOutsideCurrent: LevelDeltaRow[], missingSourceCandidatesFromCurrent: LevelDeltaRow[], sourceConsensusOutsideCurrent: LevelDeltaRow[], missingSourceConsensusFromCurrent: LevelDeltaRow[], currentContractConsensusElsewhere: LevelDeltaRow[], disputedSourceCandidatesOutsideCurrent: LevelDeltaRow[], disputedMissingSourceCandidatesFromCurrent: LevelDeltaRow[], currentRowsWithoutSourceCandidate: LevelDeltaRow[], currentRowsWithoutSourceConsensus: LevelDeltaRow[] }} LevelSummary
 * @typedef {Record<string, SourceInputReviewCounts>} SourceInputReviewCountsBySource
 * @typedef {{ valid: boolean, noDeckMutation: boolean, checked: number, limit: number, sourceInputReviewCountsBySource: SourceInputReviewCountsBySource, reviewWorklist: SourceLevelReviewWorklistRow[], byLevel: Record<number, LevelSummary> }} LevelDeltaReport
 */

/**
 * @param {number} level
 * @returns {LevelSummary}
 */
function createLevelSummary(level) {
    return {
        level,
        currentContractCount: 0,
        sourceConsensusCount: 0,
        sourceCandidateCount: 0,
        sourceCandidateAlreadyCurrentCount: 0,
        sourceCandidateMissingFromCurrentCount: 0,
        sourceConsensusAlreadyCurrentCount: 0,
        sourceConsensusMissingFromCurrentCount: 0,
        currentRowsWithoutSourceCandidateCount: 0,
        currentRowsWithoutSourceConsensusCount: 0,
        sourceClaimCounts: {},
        sourceInputReviewCounts: {
            missingSourceCandidatesFromCurrent: {},
            missingSourceConsensusFromCurrent: {},
            disputedMissingSourceCandidatesFromCurrent: {},
            currentContractConsensusElsewhere: {},
            currentRowsWithoutSourceCandidate: {},
            currentRowsWithoutSourceConsensus: {},
        },
        sourceClaimsOutsideCurrent: [],
        missingSourceCandidatesFromCurrent: [],
        sourceConsensusOutsideCurrent: [],
        missingSourceConsensusFromCurrent: [],
        currentContractConsensusElsewhere: [],
        disputedSourceCandidatesOutsideCurrent: [],
        disputedMissingSourceCandidatesFromCurrent: [],
        currentRowsWithoutSourceCandidate: [],
        currentRowsWithoutSourceConsensus: [],
    };
}

/** @returns {Record<number, LevelSummary>} */
function createLevelSummaries() {
    return Object.fromEntries(
        JLPT_LEVELS_DESC.map((level) => [level, createLevelSummary(level)])
    );
}

/**
 * @param {LevelSummary} summary
 * @param {string} sourceId
 */
function addSourceClaimCount(summary, sourceId) {
    summary.sourceClaimCounts[sourceId] = (summary.sourceClaimCounts[sourceId] || 0) + 1;
}

/**
 * @param {number | null | undefined} level
 * @returns {string}
 */
function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : "none";
}

/**
 * @param {number[]} [levels]
 * @returns {number[]}
 */
function sortLevelsForReview(levels = []) {
    return [...new Set(levels.filter((level) => Number.isInteger(level)))]
        .sort((a, b) => b - a);
}

/**
 * @param {SourceInputReviewRow[]} [reviews]
 * @returns {SourceInputReviewRow[]}
 */
function sortSourceInputReviews(reviews = []) {
    return [...reviews].sort((a, b) => (
        a.sourceId.localeCompare(b.sourceId)
        || a.reviewStatus.localeCompare(b.reviewStatus)
        || (a.level || 0) - (b.level || 0)
    ));
}

/**
 * @param {SourceInputReviewRow[]} [sourceInputReviews]
 * @returns {Map<string, SourceInputReviewRow[]>}
 */
function buildSourceInputReviewMap(sourceInputReviews = []) {
    const map = new Map();
    for (const review of sourceInputReviews || []) {
        const kanji = String(review.kanji || "").trim();
        const reviewStatus = String(review.reviewStatus || "").trim();
        if (!kanji || !["reviewed", "blocked", "source_access_gap"].includes(reviewStatus)) {
            continue;
        }
        if (!map.has(kanji)) {
            map.set(kanji, []);
        }
        const mappedReview = {
            sourceId: review.sourceId,
            reviewStatus,
            level: review.level,
            levelRange: review.levelRange,
        };
        map.get(kanji).push(mappedReview);
    }
    for (const [kanji, reviews] of map.entries()) {
        map.set(kanji, sortSourceInputReviews(reviews));
    }
    return map;
}

/**
 * @param {Map<string, SourceInputReviewRow[]>} sourceInputReviewMap
 * @param {string} kanji
 * @returns {SourceInputReviewRow[]}
 */
function getSourceInputReviewsForKanji(sourceInputReviewMap, kanji) {
    return sourceInputReviewMap?.get(kanji) || [];
}

/**
 * @param {{ kanji: string, currentContractLevel: number, targetLevel: number, result?: EvidenceResultLike, sourceIds?: string[], sourceInputReviewMap?: Map<string, SourceInputReviewRow[]> }} options
 * @returns {LevelDeltaRow}
 */
function buildLevelDeltaRow({
    kanji,
    currentContractLevel,
    targetLevel,
    result = {},
    sourceIds = [],
    sourceInputReviewMap = new Map(),
}) {
    return {
        kanji,
        currentContractLevel,
        targetLevel,
        sourceConsensusLevel: result.consensusLevel,
        confidence: result.confidence,
        voteWeights: result.voteWeights,
        sourceIds,
        reviewedSources: (result.assignments || []).map((assignment) => {
            /** @type {ReviewedSourceRow} */
            const source = {
                sourceId: assignment.sourceId,
                level: assignment.level,
            };
            if (Array.isArray(assignment.levelRange)) {
                source.levelRange = assignment.levelRange;
            }
            return source;
        }),
        sourceInputReviews: getSourceInputReviewsForKanji(sourceInputReviewMap, kanji),
    };
}

/**
 * @param {LevelDeltaRow[]} [rows]
 * @returns {LevelDeltaRow[]}
 */
function sortLevelDeltaRows(rows = []) {
    return [...rows].sort((a, b) => (
        (b.currentContractLevel || 0) - (a.currentContractLevel || 0)
        || a.kanji.localeCompare(b.kanji, "ja")
    ));
}

/**
 * @param {SourceAssignmentRow[]} assignments
 * @param {number} level
 * @returns {string[]}
 */
function getExactSourceIdsForLevel(assignments, level) {
    return assignments
        .filter((assignment) => assignment.level === level)
        .map((assignment) => assignment.sourceId)
        .sort((a, b) => a.localeCompare(b));
}

/**
 * @param {SourceAssignmentRow[]} [assignments]
 * @returns {number[]}
 */
function getExactSourceCandidateLevels(assignments = []) {
    return sortLevelsForReview(
        assignments
            .map((assignment) => assignment.level)
            .filter((level) => Number.isInteger(level))
    );
}

/**
 * @param {Record<number, number>} [voteWeights]
 * @returns {number[]}
 */
function getVotedLevels(voteWeights = {}) {
    return sortLevelsForReview(
        Object.entries(voteWeights || {})
            .filter(([, weight]) => Number(weight) > 0)
            .map(([level]) => Number(level))
    );
}

/**
 * @param {number} currentContractLevel
 * @param {EvidenceResultLike} [result]
 * @returns {number[]}
 */
function buildReviewLevels(currentContractLevel, result = {}) {
    return sortLevelsForReview([
        currentContractLevel,
        result.consensusLevel,
        ...getExactSourceCandidateLevels(result.assignments || []),
        ...getVotedLevels(result.voteWeights || {}),
    ]);
}

/**
 * @param {EvidenceResultLike & { assignmentCount?: number, independentSourceCount?: number, independentEvidenceLineageCount?: number, japanesePublishedSourceCount?: number, contractMatchesConsensus?: boolean | null }} result
 * @param {Record<string, number>} policy
 * @returns {{ rank: number, reviewPriority: string, reviewReason: string } | null}
 */
function classifyReviewWorklistProblem(result = {}, policy = {}) {
    if (result.confidence === "disputed") {
        return {
            rank: 0,
            reviewPriority: "disputed_consensus",
            reviewReason: "Active voting sources disagree; review the current level and every voted candidate level before recording a manual source judgment.",
        };
    }
    if (result.contractMatchesConsensus === false) {
        return {
            rank: 1,
            reviewPriority: "contract_consensus_mismatch",
            reviewReason: "Active source consensus differs from the current operational contract; review both the current and consensus levels.",
        };
    }
    if ((result.assignmentCount || 0) === 0) {
        return {
            rank: 2,
            reviewPriority: "missing_evidence",
            reviewReason: "No reviewed active external voting evidence is recorded; review the current contract level first and capture only exact source-level evidence.",
        };
    }
    if ((result.japanesePublishedSourceCount || 0) < (policy.minimumJapanesePublishedSources ?? 1)) {
        return {
            rank: 3,
            reviewPriority: "missing_japanese_published_source",
            reviewReason: "Evidence exists, but no required Japanese-published source evidence is recorded; review exact source-level placement from the manual lane.",
        };
    }
    if ((result.independentEvidenceLineageCount || 0) < (policy.minimumIndependentEvidenceLineages ?? 2)) {
        return {
            rank: 4,
            reviewPriority: "insufficient_independent_evidence_lineages",
            reviewReason: "Evidence exists, but independent evidence-lineage requirements are not satisfied.",
        };
    }
    if ((result.independentSourceCount || 0) < (policy.minimumIndependentSources ?? 3)) {
        return {
            rank: 5,
            reviewPriority: "insufficient_independent_sources",
            reviewReason: "Evidence exists, but independent source-count requirements are not satisfied.",
        };
    }
    if (result.confidence === "weak_evidence") {
        return {
            rank: 6,
            reviewPriority: "weak_evidence",
            reviewReason: "Evidence exists, but governed confidence requirements are not yet satisfied.",
        };
    }
    return null;
}

/**
 * @param {{ kanji: string, currentContractLevel: number, result: EvidenceResultLike & { assignmentCount?: number, independentSourceCount?: number, independentEvidenceLineageCount?: number, japanesePublishedSourceCount?: number, confidenceReasons?: string[], contractMatchesConsensus?: boolean | null }, policy?: Record<string, number>, sourceInputReviewMap?: Map<string, SourceInputReviewRow[]> }} options
 * @returns {SourceLevelReviewWorklistRow | null}
 */
function buildReviewWorklistRow({
    kanji,
    currentContractLevel,
    result,
    policy = {},
    sourceInputReviewMap = new Map(),
}) {
    const problem = classifyReviewWorklistProblem(result, policy);
    if (!problem) {
        return null;
    }
    const sourceCandidateLevels = getExactSourceCandidateLevels(result.assignments || []);

    return {
        kanji,
        currentContractLevel,
        reviewPriority: problem.reviewPriority,
        reviewReason: problem.reviewReason,
        rank: problem.rank,
        reviewLevels: buildReviewLevels(currentContractLevel, result),
        sourceCandidateLevels,
        missingFromCurrentSourceLevels: sourceCandidateLevels.filter((level) => level !== currentContractLevel),
        sourceConsensusLevel: result.consensusLevel,
        confidence: result.confidence,
        confidenceReasons: result.confidenceReasons || [],
        assignmentCount: result.assignmentCount || 0,
        independentSourceCount: result.independentSourceCount || 0,
        independentEvidenceLineageCount: result.independentEvidenceLineageCount || 0,
        japanesePublishedSourceCount: result.japanesePublishedSourceCount || 0,
        voteWeights: result.voteWeights,
        reviewedSources: (result.assignments || []).map((assignment) => {
            /** @type {ReviewedSourceRow} */
            const source = {
                sourceId: assignment.sourceId,
                level: assignment.level,
            };
            if (Array.isArray(assignment.levelRange)) {
                source.levelRange = assignment.levelRange;
            }
            return source;
        }),
        sourceInputReviews: getSourceInputReviewsForKanji(sourceInputReviewMap, kanji),
    };
}

/**
 * @param {SourceLevelReviewWorklistRow[]} [rows]
 * @returns {SourceLevelReviewWorklistRow[]}
 */
function sortReviewWorklistRows(rows = []) {
    return [...rows].sort((a, b) => (
        a.rank - b.rank
        || (b.currentContractLevel || 0) - (a.currentContractLevel || 0)
        || a.kanji.localeCompare(b.kanji, "ja")
    ));
}

/**
 * @param {LevelDeltaRow[]} rows
 * @returns {SourceInputReviewCounts}
 */
function countSourceInputReviews(rows = []) {
    return rows.reduce((counts, row) => {
        for (const review of row.sourceInputReviews || []) {
            counts[review.reviewStatus] = (counts[review.reviewStatus] || 0) + 1;
        }
        return counts;
    }, {});
}

/**
 * @param {SourceInputReviewRow[]} sourceInputReviews
 * @returns {SourceInputReviewCountsBySource}
 */
function countSourceInputReviewsBySource(sourceInputReviews = []) {
    return sourceInputReviews.reduce((counts, review) => {
        if (!review.sourceId || !["reviewed", "blocked", "source_access_gap"].includes(review.reviewStatus)) {
            return counts;
        }
        if (!counts[review.sourceId]) {
            counts[review.sourceId] = {};
        }
        counts[review.sourceId][review.reviewStatus] = (
            counts[review.sourceId][review.reviewStatus] || 0
        ) + 1;
        return counts;
    }, {});
}

/**
 * @param {LevelSummary} summary
 */
function assignSourceInputReviewCounts(summary) {
    summary.sourceInputReviewCounts = {
        missingSourceCandidatesFromCurrent: countSourceInputReviews(summary.missingSourceCandidatesFromCurrent),
        missingSourceConsensusFromCurrent: countSourceInputReviews(summary.missingSourceConsensusFromCurrent),
        disputedMissingSourceCandidatesFromCurrent: countSourceInputReviews(summary.disputedMissingSourceCandidatesFromCurrent),
        currentContractConsensusElsewhere: countSourceInputReviews(summary.currentContractConsensusElsewhere),
        currentRowsWithoutSourceCandidate: countSourceInputReviews(summary.currentRowsWithoutSourceCandidate),
        currentRowsWithoutSourceConsensus: countSourceInputReviews(summary.currentRowsWithoutSourceConsensus),
    };
}

/**
 * @param {{ contract?: JlptLevelContract, evidence?: Record<string, unknown>, limit?: number, sourceInputReviews?: SourceInputReviewRow[] }} [options]
 * @returns {LevelDeltaReport}
 */
function buildJlptKanjiSourceLevelDeltaReport({
    contract = {},
    evidence = {},
    limit = 25,
    sourceInputReviews = [],
} = {}) {
    const policy = {
        minimumIndependentSources: 3,
        minimumIndependentEvidenceLineages: 2,
        minimumJapanesePublishedSources: 1,
        ...(evidence.policy || {}),
    };
    const byLevel = createLevelSummaries();
    const sourceInputReviewMap = buildSourceInputReviewMap(sourceInputReviews);
    const flattenedSourceInputReviews = [...sourceInputReviewMap.values()].flat();
    /** @type {SourceLevelReviewWorklistRow[]} */
    const reviewWorklistRows = [];
    /** @type {Record<number, Set<string>>} */
    const sourceCandidateSets = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Set()]));
    /** @type {Record<number, Set<string>>} */
    const sourceConsensusSets = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Set()]));
    /** @type {Record<number, Map<string, LevelDeltaRow>>} */
    const sourceClaimsOutsideCurrentMaps = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Map()]));
    /** @type {Record<number, Map<string, LevelDeltaRow>>} */
    const disputedSourceCandidateMaps = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Map()]));
    const contractEntries = Object.entries(contract.kanjiLevels || {});

    for (const [kanji, currentContractLevel] of contractEntries) {
        byLevel[currentContractLevel].currentContractCount += 1;
        const assignments = collectKanjiAssignments({ kanji, evidence });
        const result = evaluateKanjiSourceEvidence({
            kanji,
            contractLevel: currentContractLevel,
            evidence,
        });
        const reviewWorklistRow = buildReviewWorklistRow({
            kanji,
            currentContractLevel,
            result,
            policy,
            sourceInputReviewMap,
        });
        if (reviewWorklistRow) {
            reviewWorklistRows.push(reviewWorklistRow);
        }

        for (const assignment of assignments) {
            const assignmentLevel = Number(assignment.level);
            if (!Number.isInteger(assignmentLevel) || !byLevel[assignmentLevel]) {
                continue;
            }
            const targetSummary = byLevel[assignmentLevel];
            sourceCandidateSets[assignmentLevel].add(kanji);
            addSourceClaimCount(targetSummary, assignment.sourceId);

            if (assignmentLevel !== currentContractLevel) {
                const existing = sourceClaimsOutsideCurrentMaps[assignmentLevel].get(kanji);
                const row = existing || buildLevelDeltaRow({
                    kanji,
                    currentContractLevel,
                    targetLevel: assignmentLevel,
                    result,
                    sourceIds: [],
                    sourceInputReviewMap,
                });
                row.sourceIds.push(assignment.sourceId);
                row.sourceIds.sort((a, b) => a.localeCompare(b));
                sourceClaimsOutsideCurrentMaps[assignmentLevel].set(kanji, row);
            }
        }

        const consensusLevel = Number.isInteger(result.consensusLevel)
            ? Number(result.consensusLevel)
            : null;
        const exactCurrentSourceIds = getExactSourceIdsForLevel(assignments, currentContractLevel);
        if (exactCurrentSourceIds.length === 0) {
            byLevel[currentContractLevel].currentRowsWithoutSourceCandidate.push(buildLevelDeltaRow({
                kanji,
                currentContractLevel,
                targetLevel: currentContractLevel,
                result,
                sourceIds: [],
                sourceInputReviewMap,
            }));
        }
        if (consensusLevel !== currentContractLevel) {
            byLevel[currentContractLevel].currentRowsWithoutSourceConsensus.push(buildLevelDeltaRow({
                kanji,
                currentContractLevel,
                targetLevel: currentContractLevel,
                result,
                sourceIds: exactCurrentSourceIds,
                sourceInputReviewMap,
            }));
        }

        if (consensusLevel !== null && sourceConsensusSets[consensusLevel]) {
            sourceConsensusSets[consensusLevel].add(kanji);
            if (consensusLevel !== currentContractLevel) {
                const consensusRow = buildLevelDeltaRow({
                    kanji,
                    currentContractLevel,
                    targetLevel: consensusLevel,
                    result,
                    sourceIds: getExactSourceIdsForLevel(assignments, consensusLevel),
                    sourceInputReviewMap,
                });
                byLevel[consensusLevel].sourceConsensusOutsideCurrent.push(consensusRow);
                byLevel[currentContractLevel].currentContractConsensusElsewhere.push(consensusRow);
            }
        }

        for (const level of JLPT_LEVELS_DESC) {
            if ((result.voteWeights?.[level] || 0) <= 0 || level === currentContractLevel || Number.isInteger(consensusLevel)) {
                continue;
            }
            disputedSourceCandidateMaps[level].set(kanji, buildLevelDeltaRow({
                kanji,
                currentContractLevel,
                targetLevel: level,
                result,
                sourceIds: getExactSourceIdsForLevel(assignments, level),
                sourceInputReviewMap,
            }));
        }
    }

    for (const level of JLPT_LEVELS_DESC) {
        const summary = byLevel[level];
        summary.sourceCandidateCount = sourceCandidateSets[level].size;
        summary.sourceConsensusCount = sourceConsensusSets[level].size;
        summary.sourceClaimsOutsideCurrent = sortLevelDeltaRows([...sourceClaimsOutsideCurrentMaps[level].values()]);
        summary.missingSourceCandidatesFromCurrent = summary.sourceClaimsOutsideCurrent;
        summary.sourceConsensusOutsideCurrent = sortLevelDeltaRows(summary.sourceConsensusOutsideCurrent);
        summary.missingSourceConsensusFromCurrent = summary.sourceConsensusOutsideCurrent;
        summary.currentContractConsensusElsewhere = sortLevelDeltaRows(summary.currentContractConsensusElsewhere);
        summary.disputedSourceCandidatesOutsideCurrent = sortLevelDeltaRows([...disputedSourceCandidateMaps[level].values()]);
        summary.disputedMissingSourceCandidatesFromCurrent = summary.disputedSourceCandidatesOutsideCurrent;
        summary.currentRowsWithoutSourceCandidate = sortLevelDeltaRows(summary.currentRowsWithoutSourceCandidate);
        summary.currentRowsWithoutSourceConsensus = sortLevelDeltaRows(summary.currentRowsWithoutSourceConsensus);
        assignSourceInputReviewCounts(summary);
        summary.sourceCandidateMissingFromCurrentCount = summary.missingSourceCandidatesFromCurrent.length;
        summary.sourceCandidateAlreadyCurrentCount = summary.sourceCandidateCount - summary.sourceCandidateMissingFromCurrentCount;
        summary.sourceConsensusMissingFromCurrentCount = summary.missingSourceConsensusFromCurrent.length;
        summary.sourceConsensusAlreadyCurrentCount = summary.sourceConsensusCount - summary.sourceConsensusMissingFromCurrentCount;
        summary.currentRowsWithoutSourceCandidateCount = summary.currentRowsWithoutSourceCandidate.length;
        summary.currentRowsWithoutSourceConsensusCount = summary.currentRowsWithoutSourceConsensus.length;
    }

    return {
        valid: true,
        noDeckMutation: true,
        checked: contractEntries.length,
        limit,
        sourceInputReviewCountsBySource: countSourceInputReviewsBySource(flattenedSourceInputReviews),
        reviewWorklist: sortReviewWorklistRows(reviewWorklistRows),
        byLevel,
    };
}

module.exports = {
    JLPT_LEVELS_DESC,
    buildSourceInputReviewMap,
    buildJlptKanjiSourceLevelDeltaReport,
    formatLevel,
    sortLevelsForReview,
};
