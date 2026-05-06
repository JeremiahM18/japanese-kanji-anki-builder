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
 * @typedef {{ kanji: string, currentContractLevel: number, targetLevel: number, sourceConsensusLevel?: number | null, confidence?: string, voteWeights?: Record<number, number>, sourceIds: string[], reviewedSources: ReviewedSourceRow[] }} LevelDeltaRow
 * @typedef {{ level: number, currentContractCount: number, sourceConsensusCount: number, sourceCandidateCount: number, sourceCandidateAlreadyCurrentCount: number, sourceCandidateMissingFromCurrentCount: number, sourceConsensusAlreadyCurrentCount: number, sourceConsensusMissingFromCurrentCount: number, currentRowsWithoutSourceCandidateCount: number, currentRowsWithoutSourceConsensusCount: number, sourceClaimCounts: Record<string, number>, sourceClaimsOutsideCurrent: LevelDeltaRow[], missingSourceCandidatesFromCurrent: LevelDeltaRow[], sourceConsensusOutsideCurrent: LevelDeltaRow[], missingSourceConsensusFromCurrent: LevelDeltaRow[], currentContractConsensusElsewhere: LevelDeltaRow[], disputedSourceCandidatesOutsideCurrent: LevelDeltaRow[], disputedMissingSourceCandidatesFromCurrent: LevelDeltaRow[], currentRowsWithoutSourceCandidate: LevelDeltaRow[], currentRowsWithoutSourceConsensus: LevelDeltaRow[] }} LevelSummary
 * @typedef {{ valid: boolean, noDeckMutation: boolean, checked: number, limit: number, byLevel: Record<number, LevelSummary> }} LevelDeltaReport
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
 * @param {{ kanji: string, currentContractLevel: number, targetLevel: number, result?: EvidenceResultLike, sourceIds?: string[] }} options
 * @returns {LevelDeltaRow}
 */
function buildLevelDeltaRow({
    kanji,
    currentContractLevel,
    targetLevel,
    result = {},
    sourceIds = [],
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
 * @param {{ contract?: JlptLevelContract, evidence?: Record<string, unknown>, limit?: number }} [options]
 * @returns {LevelDeltaReport}
 */
function buildJlptKanjiSourceLevelDeltaReport({ contract = {}, evidence = {}, limit = 25 } = {}) {
    const byLevel = createLevelSummaries();
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
            }));
        }
        if (consensusLevel !== currentContractLevel) {
            byLevel[currentContractLevel].currentRowsWithoutSourceConsensus.push(buildLevelDeltaRow({
                kanji,
                currentContractLevel,
                targetLevel: currentContractLevel,
                result,
                sourceIds: exactCurrentSourceIds,
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
        byLevel,
    };
}

module.exports = {
    JLPT_LEVELS_DESC,
    buildJlptKanjiSourceLevelDeltaReport,
    formatLevel,
};
