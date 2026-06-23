const { normalizeJlptWordLevel } = require("../datasets/jlptWordSourceEvidence");

function createLevelCounts() {
    return {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };
}

function createPostureCounts() {
    return {
        configured_source_only: 0,
        candidate_discovery_governed: 0,
        single_source_family: 0,
        multi_source_supported: 0,
        level_universe_standard: 0,
        source_access_gap: 0,
        license_blocked: 0,
        source_origin_not_evaluated: 0,
        disputed_level_claim: 0,
    };
}

function createIssueCounts() {
    return {
        missingEvidence: 0,
        insufficientIndependentSources: 0,
        insufficientIndependentEvidenceLineages: 0,
        missingJapanesePublishedOrPermissionedLearnerSource: 0,
        disputedLevelClaims: 0,
        contractConsensusMismatch: 0,
        unapprovedVotingSources: 0,
        illegalConsensusSourceUse: 0,
        disallowedStoredAssignments: 0,
        missingSourceUseProfile: 0,
        missingLicenseEvidence: 0,
    };
}

function getContractEntries(contract = {}) {
    return Object.entries(contract.wordLevels || {}).map(([key, entry]) => ({
        key,
        written: entry.written,
        reading: entry.reading,
        jlpt: entry.jlpt,
    }));
}

function sourceAllowsConsensusUse(source = {}) {
    return source.status === "active"
        && source.countsForConsensus !== false
        && source.canStoreWordAssignments === true
        && ["approved", "restricted"].includes(source.licenseStatus)
        && (source.allowedUse || []).includes("candidate-discovery")
        && (source.allowedUse || []).includes("level-hint");
}

function collectComparableSources(evidence = {}) {
    return Object.entries(evidence.sources || {})
        .filter(([, source]) => sourceAllowsConsensusUse(source))
        .map(([sourceId, source]) => ({
            sourceId,
            source,
            independenceGroup: source.independenceGroup || sourceId,
            evidenceLineage: source.evidenceLineage || source.independenceGroup || sourceId,
            learnerSource: source.japanesePublished === true || source.permissionedLearnerSource === true,
            weight: Number.isFinite(source.weight) && Number(source.weight) > 0 ? Number(source.weight) : 1,
        }));
}

function buildComparableAssignmentsByIdentity(evidence = {}, comparableSources = []) {
    const sourceIds = new Set(comparableSources.map((entry) => entry.sourceId));
    const sourceMetaById = new Map(comparableSources.map((entry) => [entry.sourceId, entry]));
    const byIdentity = new Map();

    for (const [sourceId, assignments] of Object.entries(evidence.assignments || {})) {
        if (!sourceIds.has(sourceId)) {
            continue;
        }
        const sourceMeta = sourceMetaById.get(sourceId);
        for (const [identity, assignment] of Object.entries(assignments || {})) {
            if (assignment.reviewStatus !== "reviewed") {
                continue;
            }
            if (!byIdentity.has(identity)) {
                byIdentity.set(identity, []);
            }
            byIdentity.get(identity).push({
                sourceId,
                assignment,
                sourceMeta,
            });
        }
    }

    return byIdentity;
}

function buildSourceCoverage(evidence = {}) {
    const coverage = {};
    for (const [sourceId, source] of Object.entries(evidence.sources || {})) {
        const assignments = Object.values(evidence.assignments?.[sourceId] || {});
        coverage[sourceId] = {
            sourceId,
            name: source.name,
            status: source.status,
            tier: source.tier,
            sourceKind: source.sourceKind,
            sourceType: source.sourceType,
            url: source.url,
            checkedAt: source.checkedAt,
            levels: source.levels || [],
            allowedUse: source.allowedUse || [],
            countsForConsensus: source.countsForConsensus === true,
            canStoreWordAssignments: source.canStoreWordAssignments === true,
            canStoreRawList: source.canStoreRawList === true,
            licenseStatus: source.licenseStatus,
            local: source.local || null,
            evidenceLineage: source.evidenceLineage,
            independenceGroup: source.independenceGroup,
            japanesePublished: source.japanesePublished === true,
            permissionedLearnerSource: source.permissionedLearnerSource === true,
            assignmentCount: assignments.length,
            reviewedAssignmentCount: assignments.filter((assignment) => assignment.reviewStatus === "reviewed").length,
            pendingAssignmentCount: assignments.filter((assignment) => assignment.reviewStatus === "needs_review").length,
            sourceAccessGapAssignmentCount: assignments.filter((assignment) => assignment.reviewStatus === "source_access_gap").length,
            licenseBlockedAssignmentCount: assignments.filter((assignment) => assignment.reviewStatus === "license_blocked").length,
        };
    }
    return coverage;
}

function computeConsensusLevel(assignments = []) {
    const voteWeights = createLevelCounts();
    for (const entry of assignments) {
        const level = normalizeJlptWordLevel(entry.assignment.level);
        if (Number.isInteger(level)) {
            voteWeights[level] += entry.sourceMeta.weight;
        }
    }
    const votes = Object.entries(voteWeights)
        .filter(([, weight]) => Number(weight) > 0)
        .sort((left, right) => Number(right[1]) - Number(left[1]) || Number(left[0]) - Number(right[0]));
    if (votes.length === 0) {
        return {
            consensusLevel: null,
            voteWeights,
            disputed: false,
        };
    }
    const [topLevel, topWeight] = votes[0];
    const disputed = votes.length > 1 && Number(votes[1][1]) === Number(topWeight);
    return {
        consensusLevel: disputed ? null : Number(topLevel),
        voteWeights,
        disputed,
    };
}

function choosePosture({
    assignmentCount,
    independentSourceCount,
    independentEvidenceLineageCount,
    learnerSourceCount,
    disputed,
    policy,
    contractMatchesConsensus,
} = {}) {
    if (assignmentCount === 0) {
        return "source_origin_not_evaluated";
    }
    if (disputed) {
        return "disputed_level_claim";
    }
    if (independentSourceCount >= policy.minimumIndependentSources
        && independentEvidenceLineageCount >= policy.minimumIndependentEvidenceLineages
        && learnerSourceCount >= policy.minimumJapanesePublishedOrPermissionedLearnerSources
        && contractMatchesConsensus !== false) {
        return "level_universe_standard";
    }
    if (independentSourceCount >= 2 || independentEvidenceLineageCount >= 2) {
        return "multi_source_supported";
    }
    if (independentSourceCount === 1) {
        return "single_source_family";
    }
    return "candidate_discovery_governed";
}

function buildWordEvidenceResult({ identity, contractEntry = null, assignments = [], policy = {} } = {}) {
    const reviewedAssignments = assignments.filter((entry) => entry.assignment.reviewStatus === "reviewed");
    const consensus = computeConsensusLevel(reviewedAssignments);
    const independentSourceGroups = new Set(reviewedAssignments.map((entry) => entry.sourceMeta.independenceGroup));
    const independentEvidenceLineages = new Set(reviewedAssignments.map((entry) => entry.sourceMeta.evidenceLineage));
    const learnerSources = new Set(
        reviewedAssignments
            .filter((entry) => entry.sourceMeta.learnerSource)
            .map((entry) => entry.sourceId)
    );
    const sourceIds = reviewedAssignments.map((entry) => entry.sourceId);
    const contractLevel = Number.isInteger(contractEntry?.jlpt) ? contractEntry.jlpt : null;
    const contractMatchesConsensus = Number.isInteger(consensus.consensusLevel) && Number.isInteger(contractLevel)
        ? consensus.consensusLevel === contractLevel
        : null;
    const posture = choosePosture({
        assignmentCount: reviewedAssignments.length,
        independentSourceCount: independentSourceGroups.size,
        independentEvidenceLineageCount: independentEvidenceLineages.size,
        learnerSourceCount: learnerSources.size,
        disputed: consensus.disputed,
        policy,
        contractMatchesConsensus,
    });

    return {
        identity,
        written: contractEntry?.written || identity.split("|")[0],
        reading: contractEntry?.reading || identity.split("|")[1],
        contractLevel,
        sourceConsensusLevel: consensus.consensusLevel,
        sourceIds,
        assignmentCount: reviewedAssignments.length,
        independentSourceCount: independentSourceGroups.size,
        independentEvidenceLineageCount: independentEvidenceLineages.size,
        japanesePublishedOrPermissionedLearnerSourceCount: learnerSources.size,
        voteWeights: consensus.voteWeights,
        disputedLevelClaims: consensus.disputed,
        currentContractMatchesConsensus: contractMatchesConsensus,
        posture,
    };
}

function buildGovernanceIssues(evidence = {}) {
    const issues = {
        unapprovedVotingSources: [],
        illegalConsensusSourceUses: [],
        disallowedStoredAssignments: [],
        missingSourceUseProfiles: [],
        missingLicenseEvidence: [],
    };

    for (const [sourceId, source] of Object.entries(evidence.sources || {})) {
        if (!["blocked", "deprecated", "registered"].includes(source.status) && (!Array.isArray(source.allowedUse) || source.allowedUse.length === 0)) {
            issues.missingSourceUseProfiles.push({ sourceId });
        }
        if (!source.licenseEvidenceUrl && ["approved", "restricted"].includes(source.licenseStatus)) {
            issues.missingLicenseEvidence.push({ sourceId, licenseStatus: source.licenseStatus });
        }
        if (source.countsForConsensus && !["approved", "restricted"].includes(source.licenseStatus)) {
            issues.unapprovedVotingSources.push({ sourceId, licenseStatus: source.licenseStatus });
        }
        if (source.countsForConsensus && !sourceAllowsConsensusUse(source)) {
            issues.illegalConsensusSourceUses.push({
                sourceId,
                status: source.status,
                allowedUse: source.allowedUse || [],
                sourceKind: source.sourceKind,
                canStoreWordAssignments: source.canStoreWordAssignments === true,
                licenseStatus: source.licenseStatus,
            });
        }
        if (Object.keys(evidence.assignments?.[sourceId] || {}).length > 0 && !source.canStoreWordAssignments) {
            issues.disallowedStoredAssignments.push({
                sourceId,
                assignmentCount: Object.keys(evidence.assignments?.[sourceId] || {}).length,
            });
        }
    }

    return issues;
}

function auditJlptWordSourceEvidence({ contract = {}, evidence = {}, limit = 25 } = {}) {
    const policy = {
        minimumIndependentSources: 3,
        minimumIndependentEvidenceLineages: 2,
        minimumJapanesePublishedOrPermissionedLearnerSources: 1,
        requireDictionaryIdentitySupport: true,
        requireCommonnessSupport: true,
        ...(evidence.policy || {}),
    };
    const comparableSources = collectComparableSources(evidence);
    const comparableAssignmentsByIdentity = buildComparableAssignmentsByIdentity(evidence, comparableSources);
    const contractEntries = getContractEntries(contract);
    const identitySet = new Set([
        ...contractEntries.map((entry) => entry.key),
        ...comparableAssignmentsByIdentity.keys(),
    ]);
    const contractByIdentity = new Map(contractEntries.map((entry) => [entry.key, entry]));
    const issueCounts = createIssueCounts();
    const postureCounts = createPostureCounts();
    const byLevel = Object.fromEntries([1, 2, 3, 4, 5].map((level) => [level, {
        checked: 0,
        source_origin_not_evaluated: 0,
        single_source_family: 0,
        multi_source_supported: 0,
        level_universe_standard: 0,
        disputed_level_claim: 0,
        sourceDepthComplete: false,
    }]));
    const wordSourcePosture = [];

    for (const identity of [...identitySet].sort((left, right) => left.localeCompare(right, "ja"))) {
        const result = buildWordEvidenceResult({
            identity,
            contractEntry: contractByIdentity.get(identity) || null,
            assignments: comparableAssignmentsByIdentity.get(identity) || [],
            policy,
        });
        postureCounts[result.posture] = (postureCounts[result.posture] || 0) + 1;
        wordSourcePosture.push(result);

        if (Number.isInteger(result.contractLevel)) {
            const levelSummary = byLevel[result.contractLevel];
            levelSummary.checked += 1;
            levelSummary[result.posture] = (levelSummary[result.posture] || 0) + 1;
        }

        if (result.assignmentCount === 0) {
            issueCounts.missingEvidence += 1;
        }
        if (result.assignmentCount > 0 && result.independentSourceCount < policy.minimumIndependentSources) {
            issueCounts.insufficientIndependentSources += 1;
        }
        if (result.assignmentCount > 0 && result.independentEvidenceLineageCount < policy.minimumIndependentEvidenceLineages) {
            issueCounts.insufficientIndependentEvidenceLineages += 1;
        }
        if (result.assignmentCount > 0 && result.japanesePublishedOrPermissionedLearnerSourceCount < policy.minimumJapanesePublishedOrPermissionedLearnerSources) {
            issueCounts.missingJapanesePublishedOrPermissionedLearnerSource += 1;
        }
        if (result.disputedLevelClaims) {
            issueCounts.disputedLevelClaims += 1;
        }
        if (result.currentContractMatchesConsensus === false) {
            issueCounts.contractConsensusMismatch += 1;
        }
    }

    for (const level of [1, 2, 3, 4, 5]) {
        const levelSummary = byLevel[level];
        levelSummary.sourceDepthComplete = levelSummary.checked > 0
            && levelSummary.level_universe_standard === levelSummary.checked;
    }

    const governanceIssues = buildGovernanceIssues(evidence);
    issueCounts.unapprovedVotingSources = governanceIssues.unapprovedVotingSources.length;
    issueCounts.illegalConsensusSourceUse = governanceIssues.illegalConsensusSourceUses.length;
    issueCounts.disallowedStoredAssignments = governanceIssues.disallowedStoredAssignments.length;
    issueCounts.missingSourceUseProfile = governanceIssues.missingSourceUseProfiles.length;
    issueCounts.missingLicenseEvidence = governanceIssues.missingLicenseEvidence.length;

    const governanceValid = issueCounts.unapprovedVotingSources === 0
        && issueCounts.illegalConsensusSourceUse === 0
        && issueCounts.disallowedStoredAssignments === 0
        && issueCounts.missingSourceUseProfile === 0;
    const evidenceDepthValid = wordSourcePosture.length > 0
        && wordSourcePosture.every((entry) => entry.posture === "level_universe_standard");

    return {
        valid: governanceValid && evidenceDepthValid,
        governanceValid,
        evidenceDepthValid,
        checked: wordSourcePosture.length,
        limit,
        policy,
        configuredSourceOnly: true,
        warning: "Word source adequacy is configured-source only until source-depth reaches level_universe_standard for the selected level.",
        sourceCoverage: buildSourceCoverage(evidence),
        comparableSourceCount: comparableSources.length,
        postureCounts,
        issueCounts,
        byLevel,
        wordSourcePosture,
        issues: {
            ...governanceIssues,
            missingEvidence: wordSourcePosture.filter((entry) => entry.assignmentCount === 0).slice(0, limit),
            insufficientIndependentSources: wordSourcePosture.filter((entry) => entry.assignmentCount > 0 && entry.independentSourceCount < policy.minimumIndependentSources).slice(0, limit),
            disputedLevelClaims: wordSourcePosture.filter((entry) => entry.disputedLevelClaims).slice(0, limit),
            contractConsensusMismatches: wordSourcePosture.filter((entry) => entry.currentContractMatchesConsensus === false).slice(0, limit),
        },
    };
}

function buildSourceAdequacyByLevel(report = {}) {
    const byLevel = {};
    for (const [level, summary] of Object.entries(report.byLevel || {})) {
        byLevel[Number(level)] = {
            checked: summary.checked || 0,
            sourceDepthComplete: summary.sourceDepthComplete === true,
            levelUniverseStandardRows: summary.level_universe_standard || 0,
            sourceOriginNotEvaluatedRows: summary.source_origin_not_evaluated || 0,
            singleSourceFamilyRows: summary.single_source_family || 0,
            multiSourceSupportedRows: summary.multi_source_supported || 0,
            disputedLevelClaimRows: summary.disputed_level_claim || 0,
        };
    }
    return byLevel;
}

function buildMaterializedWordEvidenceEntries({ evidence = {}, contract = {} } = {}) {
    const report = auditJlptWordSourceEvidence({
        contract,
        evidence,
        limit: Number.MAX_SAFE_INTEGER,
    });
    const words = {};
    for (const entry of report.wordSourcePosture || []) {
        if (entry.assignmentCount === 0) {
            continue;
        }
        const sources = {};
        for (const [sourceId, assignments] of Object.entries(evidence.assignments || {})) {
            if (assignments[entry.identity]?.reviewStatus === "reviewed") {
                sources[sourceId] = assignments[entry.identity];
            }
        }
        words[entry.identity] = {
            sources,
            sourceConsensusLevel: entry.sourceConsensusLevel,
            sourceAgreementCount: entry.assignmentCount,
            independentSourceCount: entry.independentSourceCount,
            independentEvidenceLineageCount: entry.independentEvidenceLineageCount,
            japanesePublishedOrPermissionedLearnerSourceCount: entry.japanesePublishedOrPermissionedLearnerSourceCount,
            posture: entry.posture,
        };
    }
    return {
        ...evidence,
        words,
    };
}

function buildSourceAccessReport({ evidence = {} } = {}) {
    const sourceCoverage = buildSourceCoverage(evidence);
    const sources = Object.values(sourceCoverage).map((source) => {
        let recommendedAction = "no_action";
        if (source.status === "registered") {
            recommendedAction = "registered_no_current_source_access";
        } else if (source.status === "planned" || source.status === "in_review") {
            recommendedAction = "review_source_access_and_pin_input";
        } else if (source.status === "active" && source.countsForConsensus && source.reviewedAssignmentCount === 0) {
            recommendedAction = "import_reviewed_word_assignments";
        } else if (source.licenseStatus === "needs_review") {
            recommendedAction = "resolve_license_before_voting";
        } else if (source.status === "blocked" || source.licenseStatus === "blocked") {
            recommendedAction = "keep_blocked";
        }
        return {
            ...source,
            recommendedAction,
        };
    });
    return {
        valid: true,
        noDeckMutation: true,
        sourceCount: sources.length,
        sources,
        actionCounts: sources.reduce((counts, source) => {
            counts[source.recommendedAction] = (counts[source.recommendedAction] || 0) + 1;
            return counts;
        }, {}),
    };
}

module.exports = {
    auditJlptWordSourceEvidence,
    buildMaterializedWordEvidenceEntries,
    buildSourceAccessReport,
    buildSourceAdequacyByLevel,
    buildWordEvidenceResult,
    createPostureCounts,
    sourceAllowsConsensusUse,
};
