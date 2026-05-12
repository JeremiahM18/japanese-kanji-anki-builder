/**
 * @typedef {"high_confidence" | "standard_confidence" | "disputed" | "weak_evidence" | "unknown"} ConfidenceId
 * @typedef {Record<number, number>} LevelCounts
 * @typedef {Record<ConfidenceId, number>} ConfidenceCounts
 * @typedef {Record<string, number>} IssueCounts
 * @typedef {{ minimumIndependentSources?: number, minimumIndependentEvidenceLineages?: number, minimumJapanesePublishedSources?: number, standardAgreementScore?: number, highAgreementScore?: number }} EvidencePolicy
 * @typedef {{ blocksRelease?: boolean, releaseMeaning?: string }} ConfidenceDefinition
 * @typedef {{ label?: string, rank?: number, role?: string }} SourceTier
 * @typedef {{ label?: string, role?: string }} SourceLineage
 * @typedef {{ level?: number, levelRange?: number[], reviewStatus?: string, citation?: string, evidenceRef?: string, notes?: string }} SourceAssignment
 * @typedef {{ name?: string, status?: string, tier?: string, evidenceLineage?: string, lineage?: string, independent?: boolean, publisherIndependence?: string, independenceGroup?: string, japanesePublished?: boolean, countsForConsensus?: boolean, weight?: number, licenseStatus?: string, allowedUse?: string, sourceKind?: string, canStoreAssignments?: boolean, canStoreRawList?: boolean, canStoreExcerpts?: boolean, requiresCitation?: boolean, positiveEvidenceOnly?: boolean, licenseEvidenceUrl?: string, licenseReviewedAt?: string, derivedFromSources?: string[] }} EvidenceSource
 * @typedef {{ consensusLevel?: number, agreementScore?: number, confidence?: ConfidenceId }} DeclaredKanjiEvidence
 * @typedef {{ policy?: EvidencePolicy, sourceTiers?: Record<string, SourceTier>, sourceLineages?: Record<string, SourceLineage>, confidenceLabels?: Record<string, ConfidenceDefinition>, confidenceReasonLabels?: Record<string, unknown>, sources?: Record<string, EvidenceSource>, assignments?: Record<string, Record<string, SourceAssignment>>, kanji?: Record<string, DeclaredKanjiEvidence> }} JlptKanjiSourceEvidence
 * @typedef {{ kanjiLevels?: Record<string, number> }} JlptLevelContract
 * @typedef {{ id: string, label: string, rank: number | null, role: string | null }} ResolvedSourceTier
 * @typedef {{ id: string, label: string, role: string | null }} ResolvedSourceLineage
 * @typedef {{ sourceId: string, level?: number, levelRange?: number[], isRangeEvidence: boolean, reviewStatus?: string, citation?: string, evidenceRef?: string, notes?: string, independent: boolean, publisherIndependence: string, independenceGroup: string, japanesePublished: boolean, weight: number, tier: ResolvedSourceTier, lineage: ResolvedSourceLineage, source: EvidenceSource }} CollectedAssignment
 * @typedef {{ sourceId: string, source: EvidenceSource, independent: boolean, publisherIndependence: string, independenceGroup: string, japanesePublished: boolean, weight: number, tier: ResolvedSourceTier, lineage: ResolvedSourceLineage }} SourceEvidenceContextSource
 * @typedef {{ evidence: JlptKanjiSourceEvidence, policy: Required<EvidencePolicy>, comparableSources: SourceEvidenceContextSource[], comparableAssignmentsByKanji: Map<string, { assignment: SourceAssignment, sourceMeta: SourceEvidenceContextSource }[]> }} SourceEvidenceContext
 * @typedef {{ level?: number, weight: number }} ConsensusAssignment
 * @typedef {{ consensusLevel: number | null, agreementScore: number, voteWeights: LevelCounts, disputed: boolean }} ConsensusResult
 * @typedef {{ sourceId: string, level?: number, levelRange?: number[], tier?: string, tierLabel?: string }} SourceDisagreement
 * @typedef {{ sourceId: string, sourceIds: string[], assignmentCount: number, votingAssignmentCount: number, consensusLevel: number | null, agreementScore: number, agreementCount: number, agreementSourceIds: string[], disagreementSources: SourceDisagreement[], disputed: boolean }} TextbookConsensus
 * @typedef {{ kanji?: string, currentContractLevel?: number, contractLevel?: number, assignments: CollectedAssignment[], assignmentCount: number, votingAssignmentCount: number, agreementCount: number, agreementSourceIds: string[], disagreementSources: SourceDisagreement[], independentSourceCount: number, independentEvidenceLineageCount: number, japanesePublishedSourceCount: number, sourceConsensusLevel: number | null, consensusLevel: number | null, agreementScore: number, voteWeights: LevelCounts, confidence: ConfidenceId, confidenceReasons: string[], textbookConsensus: TextbookConsensus, contractMatchesConsensus: boolean | null }} KanjiSourceEvidenceResult
 * @typedef {{ name?: string, status?: string, tier?: string, tierLabel?: string, tierRank?: number | null, tierRole?: string | null, lineage?: string, lineageLabel?: string, lineageRole?: string | null, independent?: boolean, publisherIndependence?: string, independenceGroup?: string, japanesePublished?: boolean, countsForConsensus?: boolean, licenseStatus?: string, allowedUse?: string, sourceKind?: string, canStoreAssignments?: boolean, canStoreRawList?: boolean, canStoreExcerpts?: boolean, requiresCitation?: boolean, positiveEvidenceOnly?: boolean, licenseEvidenceUrl?: string, licenseReviewedAt?: string, derivedFromSources?: string[], assignmentCount?: number, unreviewedAssignmentCount?: number, assignmentOutsideContractCount?: number, assignmentOutsideContract?: string[] }} SourceCoverageEntry
 * @typedef {{ sourceId?: string, kanji?: string, level?: number, contractLevel?: number, consensusLevel?: number | null, agreementScore?: number, voteWeights?: LevelCounts, reviewStatus?: string, allowedUse?: string, sourceKind?: string, canStoreAssignments?: boolean, licenseStatus?: string, assignmentCount?: number, independentSourceCount?: number, independentEvidenceLineageCount?: number, japanesePublishedSourceCount?: number, declaredConsensusLevel?: number, computedConsensusLevel?: number | null, declaredAgreementScore?: number, computedAgreementScore?: number, declaredConfidence?: ConfidenceId, computedConfidence?: ConfidenceId }} AuditIssueEntry
 * @typedef {{ sourceId: string, level?: number, levelRange?: number[], tier: string, tierLabel: string, publisherIndependence: string, citation?: string, evidenceRef?: string, notes?: string, lineage?: string, lineageLabel?: string }} ReviewedSourceEntry
 * @typedef {{ kanji?: string, currentContractLevel?: number, contractLevel?: number, confidence: ConfidenceId, sourceConsensusLevel: number | null, consensusLevel: number | null, agreementScore: number, agreementCount: number, voteWeights: LevelCounts, assignmentCount: number, votingAssignmentCount: number, independentSourceCount: number, independentEvidenceLineageCount: number, japanesePublishedSourceCount: number, textbookConsensus: TextbookConsensus, confidenceReasons: string[], disagreementSources: SourceDisagreement[], currentContractMatchesConsensus: boolean | null, reviewedSources: ReviewedSourceEntry[] }} KanjiConfidenceManifestEntry
 * @typedef {{ valid: boolean, governanceValid: boolean, evidenceDepthValid: boolean, checked: number, limit: number, policy: Required<EvidencePolicy>, sourceTiers: Record<string, SourceTier>, confidenceLabels: Record<string, ConfidenceDefinition>, confidenceReasonLabels: Record<string, unknown>, confidenceCounts: ConfidenceCounts, kanjiConfidenceManifest: KanjiConfidenceManifestEntry[], issueCounts: IssueCounts, byContractLevel: Record<number, { checked: number, high_confidence: number, standard_confidence: number, disputed: number, weak_evidence: number, unknown: number, mismatches: number }>, sourceCoverage: Record<string, SourceCoverageEntry>, unknownAssignmentSources: string[], assignmentOutsideContract: AuditIssueEntry[], issues: Record<string, AuditIssueEntry[]> }} AuditReport
 */

/** @returns {LevelCounts} */
function createLevelCounts() {
    return {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
    };
}

/** @returns {ConfidenceCounts} */
function createConfidenceCounts() {
    return {
        high_confidence: 0,
        standard_confidence: 0,
        disputed: 0,
        weak_evidence: 0,
        unknown: 0,
    };
}

/** @returns {IssueCounts} */
function createIssueCounts() {
    return {
        missingEvidence: 0,
        insufficientIndependentSources: 0,
        insufficientIndependentEvidenceLineages: 0,
        missingJapanesePublishedSource: 0,
        disputedConsensus: 0,
        contractConsensusMismatch: 0,
        unreviewedAssignments: 0,
        unapprovedActiveSources: 0,
        unknownAssignmentSource: 0,
        assignmentOutsideContract: 0,
        declaredConsensusMismatch: 0,
        declaredAgreementMismatch: 0,
        declaredConfidenceMismatch: 0,
        missingSourceUseProfile: 0,
        missingLicenseEvidence: 0,
        illegalConsensusSourceUse: 0,
        disallowedStoredAssignments: 0,
    };
}

const JAPANESE_TEXTBOOK_CONSENSUS_SOURCE_ID = "japanese_textbook_consensus";
const CONSENSUS_ALLOWED_USES = new Set(["bulk-import", "manual-citation-only"]);

/**
 * @param {JlptKanjiSourceEvidence} [evidence]
 * @returns {[string, EvidenceSource][]}
 */
function getDeclaredActiveVotingSourceEntries(evidence = {}) {
    return Object.entries(evidence.sources || {})
        .filter(([, source]) => source.status === "active" && source.countsForConsensus !== false);
}

/**
 * @param {EvidenceSource} [source]
 * @returns {boolean}
 */
function isAllowedConsensusSourceUse(source = {}) {
    return source.sourceKind === "assignment"
        && typeof source.allowedUse === "string"
        && CONSENSUS_ALLOWED_USES.has(source.allowedUse)
        && source.canStoreAssignments === true;
}

/**
 * @param {JlptKanjiSourceEvidence} [evidence]
 * @returns {[string, EvidenceSource][]}
 */
function getComparableSourceEntries(evidence = {}) {
    return getDeclaredActiveVotingSourceEntries(evidence)
        .filter(([, source]) => isAllowedConsensusSourceUse(source));
}

/**
 * @param {EvidenceSource} [source]
 * @param {JlptKanjiSourceEvidence} [evidence]
 * @returns {ResolvedSourceTier}
 */
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

/**
 * @param {string} sourceId
 * @param {EvidenceSource} [source]
 * @returns {string}
 */
function resolvePublisherIndependence(sourceId, source = {}) {
    return source.publisherIndependence || source.independenceGroup || sourceId;
}

/**
 * @param {EvidenceSource} [source]
 * @param {JlptKanjiSourceEvidence} [evidence]
 * @returns {ResolvedSourceLineage}
 */
function resolveSourceLineage(source = {}, evidence = {}) {
    const lineageId = source.evidenceLineage || source.lineage || source.publisherIndependence || source.independenceGroup || "";
    const lineage = evidence.sourceLineages?.[lineageId] || null;
    return {
        id: lineageId,
        label: lineage?.label || lineageId,
        role: lineage?.role || null,
    };
}

/**
 * Builds reusable source policy metadata and per-kanji comparable assignment indexes.
 * @param {JlptKanjiSourceEvidence} [evidence]
 * @returns {SourceEvidenceContext}
 */
function buildSourceEvidenceContext(evidence = {}) {
    const policy = {
        minimumIndependentSources: 3,
        minimumIndependentEvidenceLineages: 2,
        minimumJapanesePublishedSources: 1,
        standardAgreementScore: 0.67,
        highAgreementScore: 0.8,
        ...(evidence.policy || {}),
    };
    const comparableSources = getComparableSourceEntries(evidence).map(([sourceId, source]) => {
        const sourceWeight = Number.isFinite(source.weight) && Number(source.weight) > 0
            ? Number(source.weight)
            : 1;
        const publisherIndependence = resolvePublisherIndependence(sourceId, source);
        return {
            sourceId,
            source,
            independent: source.independent !== false,
            publisherIndependence,
            independenceGroup: publisherIndependence,
            japanesePublished: source.japanesePublished === true,
            weight: sourceWeight,
            tier: resolveSourceTier(source, evidence),
            lineage: resolveSourceLineage(source, evidence),
        };
    });
    const comparableAssignmentsByKanji = new Map();

    for (const sourceMeta of comparableSources) {
        for (const [kanji, assignment] of Object.entries(evidence.assignments?.[sourceMeta.sourceId] || {})) {
            if (!comparableAssignmentsByKanji.has(kanji)) {
                comparableAssignmentsByKanji.set(kanji, []);
            }
            comparableAssignmentsByKanji.get(kanji).push({
                assignment,
                sourceMeta,
            });
        }
    }

    return {
        evidence,
        policy,
        comparableSources,
        comparableAssignmentsByKanji,
    };
}

function resolveEvidenceContext(evidence = {}, evidenceContext = null) {
    return evidenceContext || buildSourceEvidenceContext(evidence);
}

/**
 * @param {{ kanji?: string, evidence?: JlptKanjiSourceEvidence, evidenceContext?: SourceEvidenceContext }} [options]
 * @returns {CollectedAssignment[]}
 */
function collectKanjiAssignments({ kanji, evidence = {}, evidenceContext = null } = {}) {
    const context = resolveEvidenceContext(evidence, evidenceContext);
    /** @type {CollectedAssignment[]} */
    const assignments = [];
    if (!kanji) {
        return assignments;
    }

    for (const { assignment, sourceMeta } of context.comparableAssignmentsByKanji.get(kanji) || []) {
        /** @type {SourceAssignment | undefined} */
        if (!assignment) {
            continue;
        }
        const levelRange = Array.isArray(assignment.levelRange) ? assignment.levelRange : [];
        const hasExactLevel = Number.isInteger(assignment?.level);
        const hasLevelRange = levelRange.length >= 2
            && levelRange.every((level) => Number.isInteger(level));
        if ((!hasExactLevel && !hasLevelRange) || assignment.reviewStatus !== "reviewed") {
            continue;
        }

        assignments.push({
            sourceId: sourceMeta.sourceId,
            level: assignment.level,
            levelRange: hasLevelRange ? levelRange : undefined,
            isRangeEvidence: !hasExactLevel && hasLevelRange,
            reviewStatus: assignment.reviewStatus,
            citation: assignment.citation,
            evidenceRef: assignment.evidenceRef,
            notes: assignment.notes,
            independent: sourceMeta.independent,
            publisherIndependence: sourceMeta.publisherIndependence,
            independenceGroup: sourceMeta.independenceGroup,
            japanesePublished: sourceMeta.japanesePublished,
            weight: sourceMeta.weight,
            tier: sourceMeta.tier,
            lineage: sourceMeta.lineage,
            source: sourceMeta.source,
        });
    }

    return assignments;
}

/**
 * @param {ConsensusAssignment[]} [assignments]
 * @returns {ConsensusResult}
 */
function computeConsensus(assignments = []) {
    const voteWeights = createLevelCounts();
    let totalWeight = 0;

    for (const assignment of assignments) {
        const level = Number(assignment.level);
        if (!Number.isInteger(level)) {
            continue;
        }
        voteWeights[level] += assignment.weight;
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

/**
 * @param {CollectedAssignment[]} [assignments]
 * @param {number | null} [consensusLevel]
 * @returns {{ agreementCount: number, agreementSourceIds: string[], disagreementSources: SourceDisagreement[] }}
 */
function buildConsensusComparison(assignments = [], consensusLevel = null) {
    if (!Number.isInteger(consensusLevel)) {
        return {
            agreementCount: 0,
            agreementSourceIds: [],
            disagreementSources: assignments.map((assignment) => ({
                sourceId: assignment.sourceId,
                level: assignment.level,
                ...(Array.isArray(assignment.levelRange) ? { levelRange: assignment.levelRange } : {}),
                tier: assignment.tier?.id,
                tierLabel: assignment.tier?.label,
            })),
        };
    }

    const agreementSources = assignments.filter((assignment) => assignment.level === consensusLevel);
    const disagreementSources = assignments
        .filter((assignment) => assignment.level !== consensusLevel)
        .map((assignment) => ({
            sourceId: assignment.sourceId,
            level: assignment.level,
            ...(Array.isArray(assignment.levelRange) ? { levelRange: assignment.levelRange } : {}),
            tier: assignment.tier?.id,
            tierLabel: assignment.tier?.label,
        }));

    return {
        agreementCount: agreementSources.length,
        agreementSourceIds: agreementSources.map((assignment) => assignment.sourceId),
        disagreementSources,
    };
}

/**
 * @param {Partial<CollectedAssignment>} [assignment]
 * @returns {boolean}
 */
function isJapaneseTextbookSourceAssignment(assignment = {}) {
    return assignment.sourceId !== JAPANESE_TEXTBOOK_CONSENSUS_SOURCE_ID
        && assignment.japanesePublished === true
        && assignment.lineage?.role === "japanese-published-study";
}

/**
 * @param {CollectedAssignment[]} [assignments]
 * @returns {TextbookConsensus}
 */
function buildJapaneseTextbookConsensus(assignments = []) {
    const textbookAssignments = assignments.filter(isJapaneseTextbookSourceAssignment);
    const consensus = computeConsensus(textbookAssignments);
    const comparison = buildConsensusComparison(textbookAssignments, consensus.consensusLevel);
    return {
        sourceId: JAPANESE_TEXTBOOK_CONSENSUS_SOURCE_ID,
        sourceIds: textbookAssignments.map((assignment) => assignment.sourceId),
        assignmentCount: textbookAssignments.length,
        votingAssignmentCount: textbookAssignments.filter((assignment) => Number.isInteger(assignment.level)).length,
        consensusLevel: consensus.consensusLevel,
        agreementScore: consensus.agreementScore,
        agreementCount: comparison.agreementCount,
        agreementSourceIds: comparison.agreementSourceIds,
        disagreementSources: comparison.disagreementSources,
        disputed: consensus.disputed,
    };
}

/**
 * @param {{ assignmentCount?: number, independentSourceCount?: number, independentEvidenceLineageCount?: number, japanesePublishedSourceCount?: number, disputed?: boolean, agreementScore?: number, policy?: EvidencePolicy }} [options]
 * @returns {ConfidenceId}
 */
function classifyConfidence({
    assignmentCount,
    independentSourceCount,
    independentEvidenceLineageCount,
    japanesePublishedSourceCount,
    disputed,
    agreementScore,
    policy = {},
} = {}) {
    const minSources = policy.minimumIndependentSources ?? 3;
    const minLineages = policy.minimumIndependentEvidenceLineages ?? 0;
    const minJapaneseSources = policy.minimumJapanesePublishedSources ?? 1;
    const highAgreementScore = policy.highAgreementScore ?? 0.8;
    const standardAgreementScore = policy.standardAgreementScore ?? 0.67;
    const score = agreementScore ?? 0;
    const sourceCount = independentSourceCount ?? 0;
    const lineageCount = independentEvidenceLineageCount ?? 0;
    const japaneseSourceCount = japanesePublishedSourceCount ?? 0;

    if (assignmentCount === 0) {
        return "unknown";
    }
    if (disputed) {
        return "disputed";
    }
    if (
        sourceCount < minSources
        || lineageCount < minLineages
        || japaneseSourceCount < minJapaneseSources
    ) {
        return "weak_evidence";
    }
    if (score >= highAgreementScore) {
        return "high_confidence";
    }
    if (score >= standardAgreementScore) {
        return "standard_confidence";
    }
    return "weak_evidence";
}

/**
 * @param {{ assignments?: CollectedAssignment[], confidence?: ConfidenceId, contractMatchesConsensus?: boolean | null, textbookConsensus?: Partial<TextbookConsensus> }} [options]
 * @returns {string[]}
 */
function buildConfidenceReasons({
    assignments = [],
    confidence,
    contractMatchesConsensus,
    textbookConsensus = {},
} = {}) {
    const reasons = new Set();
    const lineages = new Set(assignments.map((assignment) => assignment.lineage?.id).filter(Boolean));

    if (assignments.length === 0) {
        reasons.add("unknown_no_reviewed_external_evidence");
        return [...reasons];
    }
    if (assignments.every((assignment) => assignment.isRangeEvidence)) {
        reasons.add("range_evidence_only");
    } else if (assignments.some((assignment) => assignment.isRangeEvidence)) {
        reasons.add("range_evidence_present");
    }
    if (lineages.has("pre_2010_direct_jlpt")) {
        reasons.add("direct_legacy_mapping");
    }
    if (lineages.has("post_2010_estimated_split")) {
        reasons.add("estimated_split_evidence");
    }
    if (
        Number.isInteger(textbookConsensus.consensusLevel)
        && (textbookConsensus.agreementCount || 0) >= 2
        && !textbookConsensus.disputed
    ) {
        reasons.add("textbook_agreement");
    }
    if (confidence === "disputed") {
        reasons.add("disputed_source_votes");
    }
    if (confidence === "weak_evidence") {
        reasons.add("weak_independence_or_missing_japanese_source");
    }
    if (contractMatchesConsensus === false) {
        reasons.add("current_contract_mismatch");
    }
    if (confidence === "high_confidence" || confidence === "standard_confidence") {
        reasons.add("source_confidence_threshold_met");
    }

    return [...reasons];
}

/**
 * @param {{ kanji?: string, contractLevel?: number, evidence?: JlptKanjiSourceEvidence, evidenceContext?: SourceEvidenceContext }} [options]
 * @returns {KanjiSourceEvidenceResult}
 */
function evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence = {}, evidenceContext = null } = {}) {
    const context = resolveEvidenceContext(evidence, evidenceContext);
    const policy = context.policy;
    const assignments = collectKanjiAssignments({ kanji, evidence, evidenceContext: context });
    const independentSourceCount = new Set(
        assignments
            .filter((entry) => entry.independent)
            .map((entry) => entry.publisherIndependence || entry.independenceGroup)
    ).size;
    const independentEvidenceLineageCount = new Set(
        assignments
            .filter((entry) => entry.independent)
            .map((entry) => entry.lineage?.id || entry.independenceGroup)
    ).size;
    const japanesePublishedSourceCount = assignments.filter((entry) => entry.japanesePublished).length;
    const consensus = computeConsensus(assignments);
    const comparison = buildConsensusComparison(assignments, consensus.consensusLevel);
    const textbookConsensus = buildJapaneseTextbookConsensus(assignments);
    const confidence = classifyConfidence({
        assignmentCount: assignments.length,
        independentSourceCount,
        independentEvidenceLineageCount,
        japanesePublishedSourceCount,
        disputed: consensus.disputed,
        agreementScore: consensus.agreementScore,
        policy,
    });
    const contractMatchesConsensus = Number.isInteger(consensus.consensusLevel)
        ? consensus.consensusLevel === contractLevel
        : null;

    return {
        kanji,
        currentContractLevel: contractLevel,
        contractLevel,
        assignments,
        assignmentCount: assignments.length,
        votingAssignmentCount: assignments.filter((assignment) => Number.isInteger(assignment.level)).length,
        agreementCount: comparison.agreementCount,
        agreementSourceIds: comparison.agreementSourceIds,
        disagreementSources: comparison.disagreementSources,
        independentSourceCount,
        independentEvidenceLineageCount,
        japanesePublishedSourceCount,
        sourceConsensusLevel: consensus.consensusLevel,
        consensusLevel: consensus.consensusLevel,
        agreementScore: consensus.agreementScore,
        voteWeights: consensus.voteWeights,
        confidence,
        confidenceReasons: buildConfidenceReasons({
            assignments,
            confidence,
            contractMatchesConsensus,
            textbookConsensus,
        }),
        textbookConsensus,
        contractMatchesConsensus,
    };
}

/**
 * @param {{ evidence?: JlptKanjiSourceEvidence, contractKanjiSet?: Set<string> }} [options]
 * @returns {Record<string, SourceCoverageEntry>}
 */
function summarizeSourceCoverage({ evidence = {}, contractKanjiSet = new Set() } = {}) {
    /** @type {Record<string, SourceCoverageEntry>} */
    const coverage = {};

    for (const [sourceId, source] of Object.entries(evidence.sources || {})) {
        const sourceAssignments = evidence.assignments?.[sourceId] || {};
        const assignedKanji = Object.keys(sourceAssignments);
        const assignmentOutsideContract = [];
        let unreviewedAssignmentCount = 0;

        for (const kanji of assignedKanji) {
            if (sourceAssignments[kanji]?.reviewStatus !== "reviewed") {
                unreviewedAssignmentCount += 1;
            }
            if (!contractKanjiSet.has(kanji)) {
                assignmentOutsideContract.push(kanji);
            }
        }

        const tier = resolveSourceTier(source, evidence);
        const lineage = resolveSourceLineage(source, evidence);
        const publisherIndependence = resolvePublisherIndependence(sourceId, source);
        coverage[sourceId] = {
            name: source.name,
            status: source.status,
            tier: tier.id,
            tierLabel: tier.label,
            tierRank: tier.rank,
            tierRole: tier.role,
            lineage: lineage.id,
            lineageLabel: lineage.label,
            lineageRole: lineage.role,
            independent: source.independent !== false,
            publisherIndependence,
            independenceGroup: publisherIndependence,
            japanesePublished: source.japanesePublished === true,
            countsForConsensus: source.countsForConsensus !== false,
            licenseStatus: source.licenseStatus,
            allowedUse: source.allowedUse,
            sourceKind: source.sourceKind,
            canStoreAssignments: source.canStoreAssignments === true,
            canStoreRawList: source.canStoreRawList === true,
            canStoreExcerpts: source.canStoreExcerpts === true,
            requiresCitation: source.requiresCitation !== false,
            positiveEvidenceOnly: source.positiveEvidenceOnly === true,
            licenseEvidenceUrl: source.licenseEvidenceUrl,
            licenseReviewedAt: source.licenseReviewedAt,
            derivedFromSources: source.derivedFromSources || [],
            assignmentCount: assignedKanji.length,
            unreviewedAssignmentCount,
            assignmentOutsideContractCount: assignmentOutsideContract.length,
            assignmentOutsideContract,
        };
    }

    return coverage;
}

/**
 * @param {{ evidence?: JlptKanjiSourceEvidence, contractKanjiSet?: Set<string> }} [options]
 * @returns {{ unknownAssignmentSources: string[], assignmentOutsideContract: { sourceId: string, kanji: string, level?: number }[] }}
 */
function collectAssignmentSourceIssues({ evidence = {}, contractKanjiSet = new Set() } = {}) {
    const knownSourceIds = new Set(Object.keys(evidence.sources || {}));
    const unknownAssignmentSources = [];
    /** @type {{ sourceId: string, kanji: string, level?: number }[]} */
    const assignmentOutsideContract = [];

    for (const [sourceId, sourceAssignments] of Object.entries(evidence.assignments || {})) {
        if (!knownSourceIds.has(sourceId)) {
            unknownAssignmentSources.push(sourceId);
        }
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

/**
 * @param {EvidenceSource} [source]
 * @returns {boolean}
 */
function hasGovernedSourceUseProfile(source = {}) {
    return source.allowedUse !== "needs_review"
        && typeof source.sourceKind === "string"
        && source.sourceKind.length > 0;
}

/**
 * @param {EvidenceSource} [source]
 * @returns {boolean}
 */
function hasReviewedLicenseEvidence(source = {}) {
    return typeof source.licenseEvidenceUrl === "string"
        && source.licenseEvidenceUrl.trim().length > 0
        && typeof source.licenseReviewedAt === "string"
        && source.licenseReviewedAt.trim().length > 0;
}

/**
 * @param {{ contract?: JlptLevelContract, evidence?: JlptKanjiSourceEvidence, limit?: number }} [options]
 * @returns {AuditReport}
 */
function auditJlptKanjiSourceEvidence({ contract = {}, evidence = {}, limit = 25 } = {}) {
    /** @type {Required<EvidencePolicy>} */
    const policy = {
        minimumIndependentSources: 3,
        minimumIndependentEvidenceLineages: 2,
        minimumJapanesePublishedSources: 1,
        standardAgreementScore: 0.67,
        highAgreementScore: 0.8,
        ...(evidence.policy || {}),
    };
    const evidenceContext = buildSourceEvidenceContext(evidence);
    const contractEntries = Object.entries(contract.kanjiLevels || {});
    const contractKanjiSet = new Set(contractEntries.map(([kanji]) => kanji));
    const confidenceCounts = createConfidenceCounts();
    const issueCounts = createIssueCounts();
    /** @type {Record<number, { checked: number, high_confidence: number, standard_confidence: number, disputed: number, weak_evidence: number, unknown: number, mismatches: number }>} */
    const byContractLevel = {};
    for (const level of [1, 2, 3, 4, 5]) {
        byContractLevel[level] = {
            checked: 0,
            high_confidence: 0,
            standard_confidence: 0,
            disputed: 0,
            weak_evidence: 0,
            unknown: 0,
            mismatches: 0,
        };
    }
    /** @type {Record<string, AuditIssueEntry[]>} */
    const issues = {
        missingEvidence: [],
        insufficientIndependentSources: [],
        insufficientIndependentEvidenceLineages: [],
        missingJapanesePublishedSource: [],
        disputedConsensus: [],
        contractConsensusMismatches: [],
        unreviewedAssignments: [],
        unapprovedActiveSources: [],
        missingSourceUseProfiles: [],
        missingLicenseEvidence: [],
        illegalConsensusSourceUses: [],
        disallowedStoredAssignments: [],
        declaredConsensusMismatches: [],
        declaredAgreementMismatches: [],
        declaredConfidenceMismatches: [],
    };
    /** @type {KanjiConfidenceManifestEntry[]} */
    const kanjiConfidenceManifest = [];

    for (const [sourceId, source] of Object.entries(evidence.sources || {})) {
        const sourceAssignments = evidence.assignments?.[sourceId] || {};
        const assignmentCount = Object.keys(sourceAssignments).length;

        if (source.status === "active" && !hasGovernedSourceUseProfile(source)) {
            issueCounts.missingSourceUseProfile += 1;
            issues.missingSourceUseProfiles.push({
                sourceId,
                allowedUse: source.allowedUse,
                sourceKind: source.sourceKind,
            });
        }

        if (source.status === "active" && !hasReviewedLicenseEvidence(source)) {
            issueCounts.missingLicenseEvidence += 1;
            issues.missingLicenseEvidence.push({
                sourceId,
                licenseStatus: source.licenseStatus,
                allowedUse: source.allowedUse,
            });
        }

        if (assignmentCount > 0 && source.canStoreAssignments !== true) {
            issueCounts.disallowedStoredAssignments += 1;
            issues.disallowedStoredAssignments.push({
                sourceId,
                assignmentCount,
                allowedUse: source.allowedUse,
                sourceKind: source.sourceKind,
            });
        }
    }

    for (const [sourceId, source] of getDeclaredActiveVotingSourceEntries(evidence)) {
        const licenseStatus = source.licenseStatus || "unknown";
        if (!["approved", "restricted"].includes(licenseStatus)) {
            issueCounts.unapprovedActiveSources += 1;
            issues.unapprovedActiveSources.push({
                sourceId,
                licenseStatus,
            });
        }
        if (!isAllowedConsensusSourceUse(source)) {
            issueCounts.illegalConsensusSourceUse += 1;
            issues.illegalConsensusSourceUses.push({
                sourceId,
                allowedUse: source.allowedUse,
                sourceKind: source.sourceKind,
                canStoreAssignments: source.canStoreAssignments === true,
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
        const result = evaluateKanjiSourceEvidence({ kanji, contractLevel, evidence, evidenceContext });
        kanjiConfidenceManifest.push({
            kanji,
            currentContractLevel: contractLevel,
            contractLevel,
            confidence: result.confidence,
            sourceConsensusLevel: result.consensusLevel,
            consensusLevel: result.consensusLevel,
            agreementScore: result.agreementScore,
            agreementCount: result.agreementCount,
            voteWeights: result.voteWeights,
            assignmentCount: result.assignmentCount,
            votingAssignmentCount: result.votingAssignmentCount,
            independentSourceCount: result.independentSourceCount,
            independentEvidenceLineageCount: result.independentEvidenceLineageCount,
            japanesePublishedSourceCount: result.japanesePublishedSourceCount,
            textbookConsensus: result.textbookConsensus,
            confidenceReasons: result.confidenceReasons,
            disagreementSources: result.disagreementSources,
            currentContractMatchesConsensus: result.contractMatchesConsensus,
            reviewedSources: result.assignments.map((entry) => {
                /** @type {ReviewedSourceEntry} */
                const reviewedSource = {
                    sourceId: entry.sourceId,
                    level: entry.level,
                    tier: entry.tier.id,
                    tierLabel: entry.tier.label,
                    publisherIndependence: entry.publisherIndependence,
                    citation: entry.citation,
                    evidenceRef: entry.evidenceRef,
                    notes: entry.notes,
                };
                if (Array.isArray(entry.levelRange)) {
                    reviewedSource.levelRange = entry.levelRange;
                }
                if (entry.lineage?.id) {
                    reviewedSource.lineage = entry.lineage.id;
                    reviewedSource.lineageLabel = entry.lineage.label;
                }
                return reviewedSource;
            }),
        });
        confidenceCounts[result.confidence] += 1;
        byContractLevel[contractLevel].checked += 1;
        byContractLevel[contractLevel][result.confidence] += 1;
        const declared = evidence.kanji?.[kanji] || null;

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
        if (
            result.assignmentCount > 0
            && result.independentEvidenceLineageCount < policy.minimumIndependentEvidenceLineages
        ) {
            issueCounts.insufficientIndependentEvidenceLineages += 1;
            issues.insufficientIndependentEvidenceLineages.push({
                kanji,
                contractLevel,
                independentEvidenceLineageCount: result.independentEvidenceLineageCount,
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
        if (declared) {
            const declaredConsensusLevel = declared.consensusLevel;
            if (
                Number.isInteger(declaredConsensusLevel)
                && declaredConsensusLevel !== result.consensusLevel
            ) {
                issueCounts.declaredConsensusMismatch += 1;
                issues.declaredConsensusMismatches.push({
                    kanji,
                    declaredConsensusLevel,
                    computedConsensusLevel: result.consensusLevel,
                });
            }
            if (
                Number.isFinite(declared.agreementScore)
                && Math.abs(Number(declared.agreementScore) - result.agreementScore) > 0.0001
            ) {
                issueCounts.declaredAgreementMismatch += 1;
                issues.declaredAgreementMismatches.push({
                    kanji,
                    declaredAgreementScore: Number(declared.agreementScore),
                    computedAgreementScore: result.agreementScore,
                });
            }
            if (declared.confidence && declared.confidence !== result.confidence) {
                issueCounts.declaredConfidenceMismatch += 1;
                issues.declaredConfidenceMismatches.push({
                    kanji,
                    declaredConfidence: declared.confidence,
                    computedConfidence: result.confidence,
                });
            }
        }
    }

    const sourceCoverage = summarizeSourceCoverage({ evidence, contractKanjiSet });
    const assignmentSourceIssues = collectAssignmentSourceIssues({ evidence, contractKanjiSet });
    issueCounts.unknownAssignmentSource = assignmentSourceIssues.unknownAssignmentSources.length;
    issueCounts.assignmentOutsideContract = assignmentSourceIssues.assignmentOutsideContract.length;

    const checked = contractEntries.length;
    const evidenceDepthValid = issueCounts.missingEvidence === 0
        && issueCounts.insufficientIndependentSources === 0
        && issueCounts.insufficientIndependentEvidenceLineages === 0
        && issueCounts.missingJapanesePublishedSource === 0
        && issueCounts.disputedConsensus === 0
        && issueCounts.contractConsensusMismatch === 0;
    const governanceValid = issueCounts.unreviewedAssignments === 0
        && issueCounts.unapprovedActiveSources === 0
        && issueCounts.unknownAssignmentSource === 0
        && issueCounts.assignmentOutsideContract === 0
        && issueCounts.declaredConsensusMismatch === 0
        && issueCounts.declaredAgreementMismatch === 0
        && issueCounts.declaredConfidenceMismatch === 0
        && issueCounts.missingSourceUseProfile === 0
        && issueCounts.missingLicenseEvidence === 0
        && issueCounts.illegalConsensusSourceUse === 0
        && issueCounts.disallowedStoredAssignments === 0;
    const valid = governanceValid && evidenceDepthValid;

    /**
     * @param {AuditIssueEntry[]} items
     * @returns {AuditIssueEntry[]}
     */
    function capped(items) {
        return items.slice(0, Math.max(1, limit || 25));
    }

    return {
        valid,
        governanceValid,
        evidenceDepthValid,
        checked,
        limit,
        policy,
        sourceTiers: evidence.sourceTiers || {},
        confidenceLabels: evidence.confidenceLabels || {},
        confidenceReasonLabels: evidence.confidenceReasonLabels || {},
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
            insufficientIndependentEvidenceLineages: capped(issues.insufficientIndependentEvidenceLineages || []),
            missingJapanesePublishedSource: capped(issues.missingJapanesePublishedSource),
            disputedConsensus: capped(issues.disputedConsensus),
            contractConsensusMismatches: capped(issues.contractConsensusMismatches),
            unreviewedAssignments: capped(issues.unreviewedAssignments),
            unapprovedActiveSources: capped(issues.unapprovedActiveSources),
            missingSourceUseProfiles: capped(issues.missingSourceUseProfiles),
            missingLicenseEvidence: capped(issues.missingLicenseEvidence),
            illegalConsensusSourceUses: capped(issues.illegalConsensusSourceUses),
            disallowedStoredAssignments: capped(issues.disallowedStoredAssignments),
            declaredConsensusMismatches: capped(issues.declaredConsensusMismatches),
            declaredAgreementMismatches: capped(issues.declaredAgreementMismatches),
            declaredConfidenceMismatches: capped(issues.declaredConfidenceMismatches),
        },
    };
}

module.exports = {
    auditJlptKanjiSourceEvidence,
    buildSourceEvidenceContext,
    buildJapaneseTextbookConsensus,
    classifyConfidence,
    collectKanjiAssignments,
    computeConsensus,
    evaluateKanjiSourceEvidence,
    summarizeSourceCoverage,
};
