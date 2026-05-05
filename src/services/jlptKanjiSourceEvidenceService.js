function createLevelCounts() {
    return {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };
}

function createConfidenceCounts() {
    return {
        high: 0,
        standard: 0,
        weak: 0,
        disputed: 0,
        missing: 0,
    };
}

function createIssueCounts() {
    return {
        missingEvidence: 0,
        insufficientIndependentSources: 0,
        missingJapanesePublishedSource: 0,
        disputedConsensus: 0,
        contractConsensusMismatch: 0,
        unreviewedAssignments: 0,
        unapprovedActiveSources: 0,
        unknownAssignmentSource: 0,
        assignmentOutsideContract: 0,
    };
}

function getComparableSourceEntries(evidence = {}) {
    return Object.entries(evidence.sources || {})
        .filter(([, source]) => source.status === "active" && source.countsForConsensus !== false);
}

function resolveSourceTier(source = {}, evidence = {}) {
    const tierId = source.tier || "";
    const tier = evidence.sourceTiers?.[tierId] || null;
    return {
        id: tierId,
        label: tier?.label || tierId,
        rank: tier?.rank || null,
        role: tier?.role || null,
    };
}

function collectKanjiAssignments({ kanji, evidence = {} } = {}) {
    const sourceEntries = getComparableSourceEntries(evidence);
    const assignments = [];

    for (const [sourceId, source] of sourceEntries) {
        const assignment = evidence.assignments?.[sourceId]?.[kanji];
        if (!Number.isInteger(assignment?.level) || assignment.reviewStatus !== "reviewed") {
            continue;
        }

        assignments.push({
            sourceId,
            level: assignment.level,
            reviewStatus: assignment.reviewStatus,
            citation: assignment.citation,
            evidenceRef: assignment.evidenceRef,
            independent: source.independent !== false,
            independenceGroup: source.independenceGroup || sourceId,
            japanesePublished: source.japanesePublished === true,
            weight: Number.isFinite(source.weight) && source.weight > 0 ? source.weight : 1,
            tier: resolveSourceTier(source, evidence),
            source,
        });
    }

    return assignments;
}

function computeConsensus(assignments = []) {
    const voteWeights = createLevelCounts();
    let totalWeight = 0;

    for (const assignment of assignments) {
        voteWeights[assignment.level] += assignment.weight;
        totalWeight += assignment.weight;
    }

    if (totalWeight === 0) {
        return {
            consensusLevel: null,
            agreementScore: 0,
            voteWeights,
            disputed: false,
        };
    }

    const sorted = Object.entries(voteWeights)
        .map(([level, weight]) => ({ level: Number(level), weight }))
        .filter((entry) => entry.weight > 0)
        .sort((a, b) => b.weight - a.weight || b.level - a.level);
    const topWeight = sorted[0]?.weight || 0;
    const tiedTopLevels = sorted.filter((entry) => entry.weight === topWeight);

    return {
        consensusLevel: tiedTopLevels.length === 1 ? tiedTopLevels[0].level : null,
        agreementScore: totalWeight > 0 ? topWeight / totalWeight : 0,
        voteWeights,
        disputed: tiedTopLevels.length > 1,
    };
}

function classifyConfidence({
    assignmentCount,
    independentSourceCount,
    japanesePublishedSourceCount,
    disputed,
    agreementScore,
    policy = {},
} = {}) {
    if (assignmentCount === 0) {
        return "missing";
    }
    if (disputed) {
        return "disputed";
    }
    if (
        independentSourceCount < policy.minimumIndependentSources
        || japanesePublishedSourceCount < policy.minimumJapanesePublishedSources
    ) {
        return "weak";
    }
    if (agreementScore >= policy.highAgreementScore) {
        return "high";
    }
    if (agreementScore >= policy.standardAgreementScore) {
        return "standard";
    }
    return "weak";
}

function evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence = {} } = {}) {
    const policy = evidence.policy || {};
    const assignments = collectKanjiAssignments({ kanji, evidence });
    const independentSourceCount = new Set(
        assignments
            .filter((entry) => entry.independent)
            .map((entry) => entry.independenceGroup)
    ).size;
    const japanesePublishedSourceCount = assignments.filter((entry) => entry.japanesePublished).length;
    const consensus = computeConsensus(assignments);
    const confidence = classifyConfidence({
        assignmentCount: assignments.length,
        independentSourceCount,
        japanesePublishedSourceCount,
        disputed: consensus.disputed,
        agreementScore: consensus.agreementScore,
        policy,
    });

    return {
        kanji,
        contractLevel,
        assignments,
        assignmentCount: assignments.length,
        independentSourceCount,
        japanesePublishedSourceCount,
        consensusLevel: consensus.consensusLevel,
        agreementScore: consensus.agreementScore,
        voteWeights: consensus.voteWeights,
        confidence,
        confidenceLabel: evidence.confidenceLabels?.[confidence]?.label || confidence,
        contractMatchesConsensus: Number.isInteger(consensus.consensusLevel)
            ? consensus.consensusLevel === contractLevel
            : null,
    };
}

function summarizeSourceCoverage({ evidence = {}, contractKanjiSet = new Set() } = {}) {
    return Object.fromEntries(
        Object.entries(evidence.sources || {}).map(([sourceId, source]) => {
            const sourceAssignments = evidence.assignments?.[sourceId] || {};
            const assignedKanji = Object.keys(sourceAssignments);
            const unreviewedAssignmentCount = Object.values(sourceAssignments)
                .filter((entry) => entry?.reviewStatus !== "reviewed")
                .length;
            const assignmentOutsideContract = assignedKanji.filter((kanji) => !contractKanjiSet.has(kanji));
            const tier = resolveSourceTier(source, evidence);
            return [sourceId, {
                name: source.name,
                status: source.status,
                tier: tier.id,
                tierLabel: tier.label,
                tierRank: tier.rank,
                tierRole: tier.role,
                independent: source.independent !== false,
                independenceGroup: source.independenceGroup || sourceId,
                japanesePublished: source.japanesePublished === true,
                countsForConsensus: source.countsForConsensus !== false,
                licenseStatus: source.licenseStatus,
                assignmentCount: assignedKanji.length,
                unreviewedAssignmentCount,
                assignmentOutsideContractCount: assignmentOutsideContract.length,
                assignmentOutsideContract,
            }];
        })
    );
}

function collectAssignmentSourceIssues({ evidence = {}, contractKanjiSet = new Set() } = {}) {
    const knownSourceIds = new Set(Object.keys(evidence.sources || {}));
    const unknownAssignmentSources = Object.keys(evidence.assignments || {})
        .filter((sourceId) => !knownSourceIds.has(sourceId));
    const assignmentOutsideContract = [];

    for (const [sourceId, sourceAssignments] of Object.entries(evidence.assignments || {})) {
        for (const kanji of Object.keys(sourceAssignments || {})) {
            if (!contractKanjiSet.has(kanji)) {
                assignmentOutsideContract.push({
                    sourceId,
                    kanji,
                    level: sourceAssignments[kanji]?.level,
                });
            }
        }
    }

    return {
        unknownAssignmentSources,
        assignmentOutsideContract,
    };
}

function auditJlptKanjiSourceEvidence({ contract = {}, evidence = {}, limit = 25 } = {}) {
    const policy = evidence.policy || {};
    const contractEntries = Object.entries(contract.kanjiLevels || {});
    const contractKanjiSet = new Set(contractEntries.map(([kanji]) => kanji));
    const confidenceCounts = createConfidenceCounts();
    const issueCounts = createIssueCounts();
    const byContractLevel = Object.fromEntries(
        [1, 2, 3, 4, 5].map((level) => [level, {
            checked: 0,
            high: 0,
            standard: 0,
            weak: 0,
            disputed: 0,
            missing: 0,
            mismatches: 0,
        }])
    );
    const issues = {
        missingEvidence: [],
        insufficientIndependentSources: [],
        missingJapanesePublishedSource: [],
        disputedConsensus: [],
        contractConsensusMismatches: [],
        unreviewedAssignments: [],
        unapprovedActiveSources: [],
    };
    const kanjiConfidenceManifest = [];

    for (const [sourceId, source] of getComparableSourceEntries(evidence)) {
        if (!["approved", "restricted"].includes(source.licenseStatus)) {
            issueCounts.unapprovedActiveSources += 1;
            issues.unapprovedActiveSources.push({
                sourceId,
                licenseStatus: source.licenseStatus,
            });
        }

        for (const [kanji, assignment] of Object.entries(evidence.assignments?.[sourceId] || {})) {
            if (assignment?.reviewStatus !== "reviewed") {
                issueCounts.unreviewedAssignments += 1;
                issues.unreviewedAssignments.push({
                    sourceId,
                    kanji,
                    level: assignment?.level,
                    reviewStatus: assignment?.reviewStatus,
                });
            }
        }
    }

    for (const [kanji, contractLevel] of contractEntries) {
        const result = evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence });
        kanjiConfidenceManifest.push({
            kanji,
            contractLevel,
            confidence: result.confidence,
            confidenceLabel: result.confidenceLabel,
            consensusLevel: result.consensusLevel,
            agreementScore: result.agreementScore,
            assignmentCount: result.assignmentCount,
            independentSourceCount: result.independentSourceCount,
            japanesePublishedSourceCount: result.japanesePublishedSourceCount,
            reviewedSources: result.assignments.map((entry) => ({
                sourceId: entry.sourceId,
                level: entry.level,
                tier: entry.tier.id,
                tierLabel: entry.tier.label,
                citation: entry.citation,
                evidenceRef: entry.evidenceRef,
            })),
        });
        confidenceCounts[result.confidence] += 1;
        byContractLevel[contractLevel].checked += 1;
        byContractLevel[contractLevel][result.confidence] += 1;

        if (result.assignmentCount === 0) {
            issueCounts.missingEvidence += 1;
            issues.missingEvidence.push({ kanji, contractLevel });
        }
        if (result.assignmentCount > 0 && result.independentSourceCount < policy.minimumIndependentSources) {
            issueCounts.insufficientIndependentSources += 1;
            issues.insufficientIndependentSources.push({
                kanji,
                contractLevel,
                independentSourceCount: result.independentSourceCount,
            });
        }
        if (result.assignmentCount > 0 && result.japanesePublishedSourceCount < policy.minimumJapanesePublishedSources) {
            issueCounts.missingJapanesePublishedSource += 1;
            issues.missingJapanesePublishedSource.push({
                kanji,
                contractLevel,
                japanesePublishedSourceCount: result.japanesePublishedSourceCount,
            });
        }
        if (result.confidence === "disputed") {
            issueCounts.disputedConsensus += 1;
            issues.disputedConsensus.push({
                kanji,
                contractLevel,
                voteWeights: result.voteWeights,
            });
        }
        if (result.contractMatchesConsensus === false) {
            issueCounts.contractConsensusMismatch += 1;
            byContractLevel[contractLevel].mismatches += 1;
            issues.contractConsensusMismatches.push({
                kanji,
                contractLevel,
                consensusLevel: result.consensusLevel,
                agreementScore: result.agreementScore,
            });
        }
    }

    const sourceCoverage = summarizeSourceCoverage({ evidence, contractKanjiSet });
    const assignmentSourceIssues = collectAssignmentSourceIssues({ evidence, contractKanjiSet });
    issueCounts.unknownAssignmentSource = assignmentSourceIssues.unknownAssignmentSources.length;
    issueCounts.assignmentOutsideContract = assignmentSourceIssues.assignmentOutsideContract.length;

    const checked = contractEntries.length;
    const valid = issueCounts.missingEvidence === 0
        && issueCounts.insufficientIndependentSources === 0
        && issueCounts.missingJapanesePublishedSource === 0
        && issueCounts.disputedConsensus === 0
        && issueCounts.contractConsensusMismatch === 0
        && issueCounts.unreviewedAssignments === 0
        && issueCounts.unapprovedActiveSources === 0
        && issueCounts.unknownAssignmentSource === 0
        && issueCounts.assignmentOutsideContract === 0;

    function capped(items) {
        return items.slice(0, Math.max(1, limit || 25));
    }

    return {
        valid,
        checked,
        policy,
        sourceTiers: evidence.sourceTiers || {},
        confidenceLabels: evidence.confidenceLabels || {},
        confidenceCounts,
        kanjiConfidenceManifest,
        issueCounts,
        byContractLevel,
        sourceCoverage,
        unknownAssignmentSources: assignmentSourceIssues.unknownAssignmentSources,
        assignmentOutsideContract: capped(assignmentSourceIssues.assignmentOutsideContract),
        issues: {
            missingEvidence: capped(issues.missingEvidence),
            insufficientIndependentSources: capped(issues.insufficientIndependentSources),
            missingJapanesePublishedSource: capped(issues.missingJapanesePublishedSource),
            disputedConsensus: capped(issues.disputedConsensus),
            contractConsensusMismatches: capped(issues.contractConsensusMismatches),
            unreviewedAssignments: capped(issues.unreviewedAssignments),
            unapprovedActiveSources: capped(issues.unapprovedActiveSources),
        },
    };
}

module.exports = {
    auditJlptKanjiSourceEvidence,
    classifyConfidence,
    collectKanjiAssignments,
    computeConsensus,
    evaluateKanjiSourceEvidence,
    summarizeSourceCoverage,
};
