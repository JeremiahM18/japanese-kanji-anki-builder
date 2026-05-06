const {
    collectKanjiAssignments,
    evaluateKanjiSourceEvidence,
} = require("./jlptKanjiSourceEvidenceService");

const JLPT_LEVELS_DESC = Object.freeze([5, 4, 3, 2, 1]);

function createLevelSummary(level) {
    return {
        level,
        currentContractCount: 0,
        sourceConsensusCount: 0,
        sourceCandidateCount: 0,
        sourceClaimCounts: {},
        sourceClaimsOutsideCurrent: [],
        sourceConsensusOutsideCurrent: [],
        currentContractConsensusElsewhere: [],
        disputedSourceCandidatesOutsideCurrent: [],
    };
}

function createLevelSummaries() {
    return Object.fromEntries(
        JLPT_LEVELS_DESC.map((level) => [level, createLevelSummary(level)])
    );
}

function addSourceClaimCount(summary, sourceId) {
    summary.sourceClaimCounts[sourceId] = (summary.sourceClaimCounts[sourceId] || 0) + 1;
}

function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : "none";
}

function buildLevelDeltaRow({
    kanji,
    currentContractLevel,
    targetLevel,
    result = {},
    sourceIds = [],
} = {}) {
    return {
        kanji,
        currentContractLevel,
        targetLevel,
        sourceConsensusLevel: result.consensusLevel,
        confidence: result.confidence,
        voteWeights: result.voteWeights,
        sourceIds,
        reviewedSources: (result.assignments || []).map((assignment) => {
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

function sortLevelDeltaRows(rows = []) {
    return [...rows].sort((a, b) => (
        (b.currentContractLevel || 0) - (a.currentContractLevel || 0)
        || a.kanji.localeCompare(b.kanji, "ja")
    ));
}

function getExactSourceIdsForLevel(assignments = [], level) {
    return assignments
        .filter((assignment) => assignment.level === level)
        .map((assignment) => assignment.sourceId)
        .sort((a, b) => a.localeCompare(b));
}

function buildJlptKanjiSourceLevelDeltaReport({ contract = {}, evidence = {}, limit = 25 } = {}) {
    const byLevel = createLevelSummaries();
    const sourceCandidateSets = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Set()]));
    const sourceConsensusSets = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Set()]));
    const sourceClaimsOutsideCurrentMaps = Object.fromEntries(JLPT_LEVELS_DESC.map((level) => [level, new Map()]));
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
            if (!Number.isInteger(assignment.level)) {
                continue;
            }
            const targetSummary = byLevel[assignment.level];
            sourceCandidateSets[assignment.level].add(kanji);
            addSourceClaimCount(targetSummary, assignment.sourceId);

            if (assignment.level !== currentContractLevel) {
                const existing = sourceClaimsOutsideCurrentMaps[assignment.level].get(kanji);
                const row = existing || buildLevelDeltaRow({
                    kanji,
                    currentContractLevel,
                    targetLevel: assignment.level,
                    result,
                    sourceIds: [],
                });
                row.sourceIds.push(assignment.sourceId);
                row.sourceIds.sort((a, b) => a.localeCompare(b));
                sourceClaimsOutsideCurrentMaps[assignment.level].set(kanji, row);
            }
        }

        if (Number.isInteger(result.consensusLevel)) {
            sourceConsensusSets[result.consensusLevel].add(kanji);
            if (result.consensusLevel !== currentContractLevel) {
                const consensusRow = buildLevelDeltaRow({
                    kanji,
                    currentContractLevel,
                    targetLevel: result.consensusLevel,
                    result,
                    sourceIds: getExactSourceIdsForLevel(assignments, result.consensusLevel),
                });
                byLevel[result.consensusLevel].sourceConsensusOutsideCurrent.push(consensusRow);
                byLevel[currentContractLevel].currentContractConsensusElsewhere.push(consensusRow);
            }
        }

        for (const level of JLPT_LEVELS_DESC) {
            if ((result.voteWeights?.[level] || 0) <= 0 || level === currentContractLevel || Number.isInteger(result.consensusLevel)) {
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
        summary.sourceConsensusOutsideCurrent = sortLevelDeltaRows(summary.sourceConsensusOutsideCurrent);
        summary.currentContractConsensusElsewhere = sortLevelDeltaRows(summary.currentContractConsensusElsewhere);
        summary.disputedSourceCandidatesOutsideCurrent = sortLevelDeltaRows([...disputedSourceCandidateMaps[level].values()]);
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
