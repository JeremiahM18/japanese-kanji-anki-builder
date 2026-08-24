const {
    buildWordIdentity,
    normalizeJlptWordLevel,
    wordSupportRecordSchema,
} = require("../datasets/jlptWordSourceEvidence");

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
        missingDictionaryIdentitySupport: 0,
        missingCommonnessSupport: 0,
        disputedLevelClaims: 0,
        contractConsensusMismatch: 0,
        unapprovedVotingSources: 0,
        illegalConsensusSourceUse: 0,
        disallowedStoredAssignments: 0,
        missingSourceUseProfile: 0,
        missingLicenseEvidence: 0,
        reviewedAssignmentsMissingEvidence: 0,
        reviewedVotingAssignmentsMissingLevel: 0,
        reviewedAssignmentsOutsideSourceLevels: 0,
        invalidSupportClaims: 0,
        dualAuthoritySupportSources: 0,
        legacyAssignmentSupportClaims: 0,
        disallowedStoredSupportFacts: 0,
        missingSupportSourceMetadata: 0,
        staleSupportSources: 0,
        invalidSupportFacts: 0,
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

function supportClaimForEvidenceKind(evidenceKind) {
    return evidenceKind === "exact-dictionary-entry"
        ? "dictionary-identity"
        : "commonness";
}

function requiredUseForSupportClaim(supportClaim) {
    return supportClaim === "dictionary-identity"
        ? "dictionary-verification"
        : "commonness-support";
}

function requiredSourceKindForEvidenceKind(evidenceKind) {
    return {
        "exact-dictionary-entry": "dictionary",
        "dictionary-priority": "dictionary-priority",
        "corpus-frequency": "frequency",
    }[evidenceKind] || null;
}

function parseIsoDate(value) {
    const normalized = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
        return null;
    }
    const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp)
        || new Date(timestamp).toISOString().slice(0, 10) !== normalized) {
        return null;
    }
    return timestamp;
}

function evaluateSupportSourceFreshness(source = {}, evidenceCheckedAt = "") {
    const kinds = new Set(source.supportEvidenceKinds || []);
    const requiresFreshness = kinds.has("exact-dictionary-entry") || kinds.has("dictionary-priority");
    if (!source.freshness) {
        return {
            required: requiresFreshness,
            valid: !requiresFreshness,
            reason: requiresFreshness ? "missing freshness policy" : null,
        };
    }
    const checkedAt = parseIsoDate(source.freshness.checkedAt);
    const auditAt = parseIsoDate(evidenceCheckedAt);
    if (!Number.isFinite(checkedAt) || !Number.isFinite(auditAt)) {
        return { required: requiresFreshness, valid: false, reason: "invalid freshness date" };
    }
    if (checkedAt > auditAt) {
        return { required: requiresFreshness, valid: false, reason: "freshness check is after evidence checkedAt" };
    }
    const ageDays = Math.floor((auditAt - checkedAt) / 86400000);
    const valid = ageDays <= source.freshness.maximumAgeDays;
    return {
        required: requiresFreshness,
        valid,
        ageDays,
        maximumAgeDays: source.freshness.maximumAgeDays,
        reason: valid ? null : `snapshot freshness age ${ageDays} exceeds ${source.freshness.maximumAgeDays} days`,
    };
}

function buildSupportSourceMetadataIssues(source = {}, evidenceCheckedAt = "") {
    const issues = [];
    if (source.countsForConsensus === true || source.canStoreWordAssignments === true) {
        issues.push("dualPlacementAuthority");
    }
    if (!Array.isArray(source.supportEvidenceKinds) || source.supportEvidenceKinds.length === 0) {
        issues.push("supportEvidenceKinds");
    }
    if (!source.upstreamSnapshot) {
        issues.push("upstreamSnapshot");
    } else {
        if (!source.upstreamSnapshot.url) {
            issues.push("upstreamSnapshot.url");
        }
        if (!source.upstreamSnapshot.version) {
            issues.push("upstreamSnapshot.version");
        }
        if (!/^[a-f0-9]{64}$/iu.test(String(source.upstreamSnapshot.sha256 || ""))) {
            issues.push("upstreamSnapshot.sha256");
        }
        if (!Number.isInteger(source.upstreamSnapshot.byteSize) || source.upstreamSnapshot.byteSize < 0) {
            issues.push("upstreamSnapshot.byteSize");
        }
        const retrievedAt = parseIsoDate(source.upstreamSnapshot.retrievedAt);
        const auditAt = parseIsoDate(evidenceCheckedAt);
        if (!Number.isFinite(retrievedAt)
            || !Number.isFinite(auditAt)
            || retrievedAt > auditAt) {
            issues.push("upstreamSnapshot.retrievedAt");
        }
    }
    if (!/^[a-f0-9]{64}$/iu.test(String(source.local?.sha256 || ""))) {
        issues.push("local.sha256");
    }
    if (!Number.isInteger(source.local?.byteSize) || source.local.byteSize < 0) {
        issues.push("local.byteSize");
    }
    if (!Number.isInteger(source.local?.rowCount) || source.local.rowCount < 0) {
        issues.push("local.rowCount");
    }
    if (source.positiveEvidenceOnly !== true) {
        issues.push("positiveEvidenceOnly");
    }
    const freshness = evaluateSupportSourceFreshness(source, evidenceCheckedAt);
    return { issues, freshness };
}

function sourceAllowsSupportUse(source = {}, allowedUse, evidenceKind, evidenceCheckedAt = "") {
    const metadata = buildSupportSourceMetadataIssues(source, evidenceCheckedAt);
    return source.status === "active"
        && source.canStoreSupportFacts === true
        && ["approved", "restricted"].includes(source.licenseStatus)
        && (source.allowedUse || []).includes(allowedUse)
        && (source.supportEvidenceKinds || []).includes(evidenceKind)
        && source.sourceKind === requiredSourceKindForEvidenceKind(evidenceKind)
        && metadata.issues.length === 0
        && metadata.freshness.valid;
}

function buildCanonicalSupportCitation(source = {}) {
    return `${source.name}; ${source.upstreamSnapshot?.url}; snapshot ${source.upstreamSnapshot?.version}`;
}

function buildCanonicalSupportEvidenceRef({ source = {}, identity = "", rowNumber } = {}) {
    return `${source.local?.path}; sha256=${String(source.local?.sha256 || "").toLowerCase()}; `
        + `row=${rowNumber}; identity=${encodeURIComponent(identity)}`;
}

function supportEvidenceRefMatchesIdentity(evidenceRef = "", identity = "") {
    return String(evidenceRef).endsWith(`; identity=${encodeURIComponent(identity)}`);
}

function supportRecordMatchesSource({ source = {}, identity = "", record = {}, evidenceCheckedAt = "" } = {}) {
    const parsed = wordSupportRecordSchema.safeParse(record);
    if (!parsed.success) {
        return false;
    }
    const normalized = parsed.data;
    if (buildWordIdentity(normalized.written, normalized.reading) !== identity) {
        return false;
    }
    const expectedClaim = supportClaimForEvidenceKind(normalized.evidence.kind);
    const allowedUse = requiredUseForSupportClaim(expectedClaim);
    const expectedCitation = buildCanonicalSupportCitation(source);
    const evidenceRefMatch = /^(.*); sha256=([a-f0-9]{64}); row=([1-9]\d*); identity=([^;\s]+)$/iu.exec(normalized.evidenceRef);
    const evidenceRowNumber = Number(evidenceRefMatch?.[3]);
    const delimitedSource = ["csv", "tsv"].includes(source.local?.format);
    const minimumEvidenceRow = delimitedSource ? 2 : 1;
    const maximumEvidenceRow = Number.isInteger(source.local?.rowCount)
        ? source.local.rowCount + (delimitedSource ? 1 : 0)
        : 0;
    const provenanceMatches = normalized.citation === expectedCitation
        && Number.isSafeInteger(evidenceRowNumber)
        && evidenceRowNumber >= minimumEvidenceRow
        && evidenceRowNumber <= maximumEvidenceRow
        && normalized.evidenceRef === buildCanonicalSupportEvidenceRef({
            source,
            identity,
            rowNumber: evidenceRowNumber,
        });
    return sourceAllowsSupportUse(source, allowedUse, normalized.evidence.kind, evidenceCheckedAt)
        && provenanceMatches
        && normalized.supportClaims[0] === expectedClaim
        && normalized.evidence.snapshotVersion === source.upstreamSnapshot?.version
        && normalized.evidence.normalizedSourceSha256.toLowerCase() === String(source.local?.sha256 || "").toLowerCase();
}

function buildReviewedSupportRecordsByIdentity(
    evidence = {},
    supportClaim,
    asOfDate = "",
    contractIdentitySet = null
) {
    const byIdentity = new Map();

    for (const [sourceId, records] of Object.entries(evidence.supportRecords || {})) {
        const source = evidence.sources?.[sourceId] || {};
        for (const [identity, record] of Object.entries(records || {})) {
            if ((contractIdentitySet && !contractIdentitySet.has(identity))
                || record.supportClaims?.[0] !== supportClaim
                || !supportRecordMatchesSource({ source, identity, record, evidenceCheckedAt: asOfDate || evidence.checkedAt })) {
                continue;
            }
            if (!byIdentity.has(identity)) {
                byIdentity.set(identity, []);
            }
            byIdentity.get(identity).push({ sourceId, record });
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
            canStoreSupportFacts: source.canStoreSupportFacts === true,
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
            supportFactCount: Object.keys(evidence.supportRecords?.[sourceId] || {}).length,
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
    dictionaryIdentitySupported,
    commonnessSupported,
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
        && (!policy.requireDictionaryIdentitySupport || dictionaryIdentitySupported)
        && (!policy.requireCommonnessSupport || commonnessSupported)
        && contractMatchesConsensus === true) {
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

function buildWordEvidenceResult({
    identity,
    contractEntry = null,
    assignments = [],
    dictionaryIdentityAssignments = [],
    commonnessAssignments = [],
    policy = {},
} = {}) {
    const reviewedAssignments = assignments.filter((entry) => entry.assignment.reviewStatus === "reviewed");
    const consensus = computeConsensusLevel(reviewedAssignments);
    const independentSourceGroups = new Set(reviewedAssignments.map((entry) => entry.sourceMeta.independenceGroup));
    const independentEvidenceLineages = new Set(reviewedAssignments.map((entry) => entry.sourceMeta.evidenceLineage));
    const learnerSources = new Set(
        reviewedAssignments
            .filter((entry) => entry.sourceMeta.learnerSource)
            .map((entry) => entry.sourceId)
    );
    const dictionaryIdentitySourceIds = [
        ...new Set(dictionaryIdentityAssignments.map((entry) => entry.sourceId)),
    ].sort();
    const commonnessSourceIds = [
        ...new Set(commonnessAssignments.map((entry) => entry.sourceId)),
    ].sort();
    const dictionaryIdentitySupported = dictionaryIdentitySourceIds.length > 0;
    const commonnessSupported = commonnessSourceIds.length > 0;
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
        dictionaryIdentitySupported,
        commonnessSupported,
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
        dictionaryIdentitySourceIds,
        commonnessSourceIds,
        dictionaryIdentitySupported,
        commonnessSupported,
        voteWeights: consensus.voteWeights,
        disputedLevelClaims: consensus.disputed,
        currentContractMatchesConsensus: contractMatchesConsensus,
        posture,
    };
}

function buildGovernanceIssues(evidence = {}, asOfDate = "", contractIdentitySet = new Set()) {
    const issues = {
        unapprovedVotingSources: [],
        illegalConsensusSourceUses: [],
        disallowedStoredAssignments: [],
        missingSourceUseProfiles: [],
        missingLicenseEvidence: [],
        reviewedAssignmentsMissingEvidence: [],
        reviewedVotingAssignmentsMissingLevel: [],
        reviewedAssignmentsOutsideSourceLevels: [],
        invalidSupportClaims: [],
        dualAuthoritySupportSources: [],
        legacyAssignmentSupportClaims: [],
        disallowedStoredSupportFacts: [],
        missingSupportSourceMetadata: [],
        staleSupportSources: [],
        invalidSupportFacts: [],
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
        const sourceSupportRecords = evidence.supportRecords?.[sourceId] || {};
        if (source.canStoreSupportFacts
            && (source.countsForConsensus || source.canStoreWordAssignments)) {
            issues.dualAuthoritySupportSources.push({ sourceId });
        }
        if (Object.keys(sourceSupportRecords).length > 0 && !source.canStoreSupportFacts) {
            issues.disallowedStoredSupportFacts.push({
                sourceId,
                supportFactCount: Object.keys(sourceSupportRecords).length,
            });
        }
        if (Object.keys(sourceSupportRecords).length > 0) {
            const metadata = buildSupportSourceMetadataIssues(source, asOfDate || evidence.checkedAt);
            if (metadata.issues.length > 0) {
                issues.missingSupportSourceMetadata.push({ sourceId, missingFields: metadata.issues });
            }
            if (!metadata.freshness.valid) {
                issues.staleSupportSources.push({ sourceId, ...metadata.freshness });
            }
        }
        for (const [identity, assignment] of Object.entries(evidence.assignments?.[sourceId] || {})) {
            if ((assignment.supportClaims || []).length > 0) {
                issues.legacyAssignmentSupportClaims.push({
                    sourceId,
                    identity,
                    supportClaims: assignment.supportClaims,
                });
                issues.invalidSupportClaims.push({
                    sourceId,
                    identity,
                    supportClaims: assignment.supportClaims,
                    reason: "support claims must use typed supportRecords, not placement assignments",
                });
            }
            if (assignment.reviewStatus !== "reviewed") {
                continue;
            }
            const missingFields = [
                source.requiresCitation !== false && !assignment.citation ? "citation" : null,
                !assignment.evidenceRef ? "evidenceRef" : null,
            ].filter(Boolean);
            if (missingFields.length > 0) {
                issues.reviewedAssignmentsMissingEvidence.push({
                    sourceId,
                    identity,
                    missingFields,
                });
            }
            const normalizedLevel = normalizeJlptWordLevel(assignment.level);
            if (source.countsForConsensus && !Number.isInteger(normalizedLevel)) {
                issues.reviewedVotingAssignmentsMissingLevel.push({ sourceId, identity });
            }
            if (Number.isInteger(normalizedLevel)
                && Array.isArray(source.levels)
                && source.levels.length > 0
                && !source.levels.includes(normalizedLevel)) {
                issues.reviewedAssignmentsOutsideSourceLevels.push({
                    sourceId,
                    identity,
                    level: normalizedLevel,
                    sourceLevels: source.levels,
                });
            }
        }
        const evidenceRefOwners = new Map();
        for (const [identity, record] of Object.entries(sourceSupportRecords)) {
            if (!contractIdentitySet.has(identity)) {
                issues.invalidSupportFacts.push({
                    sourceId,
                    identity,
                    evidenceKind: record.evidence?.kind || null,
                    reason: "support fact identity is outside the operational word contract",
                });
                continue;
            }
            if (!supportEvidenceRefMatchesIdentity(record.evidenceRef, identity)) {
                issues.invalidSupportFacts.push({
                    sourceId,
                    identity,
                    evidenceKind: record.evidence?.kind || null,
                    reason: "support evidence reference is not bound to the exact written|reading identity",
                });
                continue;
            }
            if (!supportRecordMatchesSource({ source, identity, record, evidenceCheckedAt: asOfDate || evidence.checkedAt })) {
                issues.invalidSupportFacts.push({
                    sourceId,
                    identity,
                    evidenceKind: record.evidence?.kind || null,
                    reason: "support fact does not satisfy schema, source-use, snapshot, or positive-evidence policy",
                });
                continue;
            }
            const existingIdentity = evidenceRefOwners.get(record.evidenceRef);
            if (existingIdentity) {
                issues.invalidSupportFacts.push({
                    sourceId,
                    identity,
                    evidenceKind: record.evidence?.kind || null,
                    reason: `support fact reuses evidence reference from ${existingIdentity}`,
                });
                continue;
            }
            evidenceRefOwners.set(record.evidenceRef, identity);
        }
    }

    for (const [sourceId, sourceSupportRecords] of Object.entries(evidence.supportRecords || {})) {
        if (evidence.sources?.[sourceId]) {
            continue;
        }
        for (const [identity, record] of Object.entries(sourceSupportRecords || {})) {
            issues.invalidSupportFacts.push({
                sourceId,
                identity,
                evidenceKind: record.evidence?.kind || null,
                reason: "support fact references an unknown source",
            });
        }
    }

    return issues;
}

function auditJlptWordSourceEvidence({
    contract = {},
    evidence = {},
    levels = null,
    limit = 25,
    asOfDate = "",
} = {}) {
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
    const supportEvaluationDate = asOfDate || new Date().toISOString().slice(0, 10);
    const allContractEntries = getContractEntries(contract);
    const allContractIdentitySet = new Set(allContractEntries.map((entry) => entry.key));
    const dictionaryIdentityAssignmentsByIdentity = buildReviewedSupportRecordsByIdentity(
        evidence,
        "dictionary-identity",
        supportEvaluationDate,
        allContractIdentitySet
    );
    const commonnessAssignmentsByIdentity = buildReviewedSupportRecordsByIdentity(
        evidence,
        "commonness",
        supportEvaluationDate,
        allContractIdentitySet
    );
    const requestedLevels = Array.isArray(levels)
        ? new Set(levels.map((level) => Number(level)).filter((level) => Number.isInteger(level)))
        : null;
    const contractEntries = allContractEntries.filter((entry) => (
        !requestedLevels || requestedLevels.has(entry.jlpt)
    ));
    const selectedContractIdentitySet = new Set(contractEntries.map((entry) => entry.key));
    const comparableIdentitySet = new Set(comparableAssignmentsByIdentity.keys());
    const identitySet = requestedLevels
        ? new Set(contractEntries.map((entry) => entry.key))
        : new Set([
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
        missingDictionaryIdentitySupport: 0,
        missingCommonnessSupport: 0,
        sourceDepthComplete: false,
    }]));
    const wordSourcePosture = [];

    for (const identity of [...identitySet].sort((left, right) => left.localeCompare(right, "ja"))) {
        const result = buildWordEvidenceResult({
            identity,
            contractEntry: contractByIdentity.get(identity) || null,
            assignments: comparableAssignmentsByIdentity.get(identity) || [],
            dictionaryIdentityAssignments: dictionaryIdentityAssignmentsByIdentity.get(identity) || [],
            commonnessAssignments: commonnessAssignmentsByIdentity.get(identity) || [],
            policy,
        });
        postureCounts[result.posture] = (postureCounts[result.posture] || 0) + 1;
        wordSourcePosture.push(result);

        if (Number.isInteger(result.contractLevel)) {
            const levelSummary = byLevel[result.contractLevel];
            levelSummary.checked += 1;
            levelSummary[result.posture] = (levelSummary[result.posture] || 0) + 1;
            if (!result.dictionaryIdentitySupported) {
                levelSummary.missingDictionaryIdentitySupport += 1;
            }
            if (!result.commonnessSupported) {
                levelSummary.missingCommonnessSupport += 1;
            }
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
        if (policy.requireDictionaryIdentitySupport && !result.dictionaryIdentitySupported) {
            issueCounts.missingDictionaryIdentitySupport += 1;
        }
        if (policy.requireCommonnessSupport && !result.commonnessSupported) {
            issueCounts.missingCommonnessSupport += 1;
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

    const governanceIssues = buildGovernanceIssues(evidence, supportEvaluationDate, allContractIdentitySet);
    issueCounts.unapprovedVotingSources = governanceIssues.unapprovedVotingSources.length;
    issueCounts.illegalConsensusSourceUse = governanceIssues.illegalConsensusSourceUses.length;
    issueCounts.disallowedStoredAssignments = governanceIssues.disallowedStoredAssignments.length;
    issueCounts.missingSourceUseProfile = governanceIssues.missingSourceUseProfiles.length;
    issueCounts.missingLicenseEvidence = governanceIssues.missingLicenseEvidence.length;
    issueCounts.reviewedAssignmentsMissingEvidence = governanceIssues.reviewedAssignmentsMissingEvidence.length;
    issueCounts.reviewedVotingAssignmentsMissingLevel = governanceIssues.reviewedVotingAssignmentsMissingLevel.length;
    issueCounts.reviewedAssignmentsOutsideSourceLevels = governanceIssues.reviewedAssignmentsOutsideSourceLevels.length;
    issueCounts.invalidSupportClaims = governanceIssues.invalidSupportClaims.length;
    issueCounts.dualAuthoritySupportSources = governanceIssues.dualAuthoritySupportSources.length;
    issueCounts.legacyAssignmentSupportClaims = governanceIssues.legacyAssignmentSupportClaims.length;
    issueCounts.disallowedStoredSupportFacts = governanceIssues.disallowedStoredSupportFacts.length;
    issueCounts.missingSupportSourceMetadata = governanceIssues.missingSupportSourceMetadata.length;
    issueCounts.staleSupportSources = governanceIssues.staleSupportSources.length;
    issueCounts.invalidSupportFacts = governanceIssues.invalidSupportFacts.length;

    const governanceValid = issueCounts.unapprovedVotingSources === 0
        && issueCounts.illegalConsensusSourceUse === 0
        && issueCounts.disallowedStoredAssignments === 0
        && issueCounts.missingSourceUseProfile === 0
        && issueCounts.missingLicenseEvidence === 0
        && issueCounts.reviewedAssignmentsMissingEvidence === 0
        && issueCounts.reviewedVotingAssignmentsMissingLevel === 0
        && issueCounts.reviewedAssignmentsOutsideSourceLevels === 0
        && issueCounts.invalidSupportClaims === 0
        && issueCounts.dualAuthoritySupportSources === 0
        && issueCounts.legacyAssignmentSupportClaims === 0
        && issueCounts.disallowedStoredSupportFacts === 0
        && issueCounts.missingSupportSourceMetadata === 0
        && issueCounts.staleSupportSources === 0
        && issueCounts.invalidSupportFacts === 0;
    const evidenceDepthValid = wordSourcePosture.length > 0
        && wordSourcePosture.every((entry) => entry.posture === "level_universe_standard");

    return {
        valid: governanceValid && evidenceDepthValid,
        governanceValid,
        evidenceDepthValid,
        checked: wordSourcePosture.length,
        asOfDate: supportEvaluationDate,
        levels: requestedLevels ? [...requestedLevels].sort((left, right) => right - left) : null,
        selectedContractIdentityCount: contractEntries.length,
        outOfScopeContractIdentityCount: requestedLevels
            ? allContractEntries.filter((entry) => !selectedContractIdentitySet.has(entry.key)).length
            : 0,
        outOfScopeComparableIdentityCount: requestedLevels
            ? [...comparableIdentitySet].filter((identity) => !selectedContractIdentitySet.has(identity)).length
            : 0,
        comparableSourceOnlyIdentityCount: [...comparableIdentitySet]
            .filter((identity) => !allContractIdentitySet.has(identity)).length,
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
            insufficientIndependentEvidenceLineages: wordSourcePosture.filter((entry) => entry.assignmentCount > 0 && entry.independentEvidenceLineageCount < policy.minimumIndependentEvidenceLineages).slice(0, limit),
            missingJapanesePublishedOrPermissionedLearnerSources: wordSourcePosture.filter((entry) => entry.assignmentCount > 0 && entry.japanesePublishedOrPermissionedLearnerSourceCount < policy.minimumJapanesePublishedOrPermissionedLearnerSources).slice(0, limit),
            missingDictionaryIdentitySupport: wordSourcePosture.filter((entry) => policy.requireDictionaryIdentitySupport && !entry.dictionaryIdentitySupported).slice(0, limit),
            missingCommonnessSupport: wordSourcePosture.filter((entry) => policy.requireCommonnessSupport && !entry.commonnessSupported).slice(0, limit),
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
            missingDictionaryIdentitySupportRows: summary.missingDictionaryIdentitySupport || 0,
            missingCommonnessSupportRows: summary.missingCommonnessSupport || 0,
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
        if (entry.assignmentCount === 0
            && !entry.dictionaryIdentitySupported
            && !entry.commonnessSupported) {
            continue;
        }
        const sources = {};
        const supportSources = {};
        for (const [sourceId, assignments] of Object.entries(evidence.assignments || {})) {
            if (assignments[entry.identity]?.reviewStatus === "reviewed") {
                sources[sourceId] = assignments[entry.identity];
            }
        }
        const validSupportSourceIds = new Set([
            ...(entry.dictionaryIdentitySourceIds || []),
            ...(entry.commonnessSourceIds || []),
        ]);
        for (const [sourceId, records] of Object.entries(evidence.supportRecords || {})) {
            if (validSupportSourceIds.has(sourceId) && records[entry.identity]) {
                supportSources[sourceId] = records[entry.identity];
            }
        }
        words[entry.identity] = {
            sources,
            supportSources,
            sourceConsensusLevel: entry.sourceConsensusLevel,
            sourceAgreementCount: entry.assignmentCount,
            independentSourceCount: entry.independentSourceCount,
            independentEvidenceLineageCount: entry.independentEvidenceLineageCount,
            japanesePublishedOrPermissionedLearnerSourceCount: entry.japanesePublishedOrPermissionedLearnerSourceCount,
            dictionaryIdentitySourceIds: entry.dictionaryIdentitySourceIds,
            commonnessSourceIds: entry.commonnessSourceIds,
            dictionaryIdentitySupported: entry.dictionaryIdentitySupported,
            commonnessSupported: entry.commonnessSupported,
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
    buildCanonicalSupportCitation,
    buildCanonicalSupportEvidenceRef,
    buildMaterializedWordEvidenceEntries,
    buildSourceAccessReport,
    buildSourceAdequacyByLevel,
    buildWordEvidenceResult,
    createPostureCounts,
    sourceAllowsConsensusUse,
    supportRecordMatchesSource,
};
