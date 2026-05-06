const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { auditJlptKanjiSourceEvidence } = require("../src/services/jlptKanjiSourceEvidenceService");

const DEFAULT_EVIDENCE_PATH = "templates/jlpt_kanji_source_evidence.json";

/**
 * @typedef {{ evidence: string, governanceStrict: boolean, json: boolean, limit: number, strict: boolean, unknownArgs: string[] }} AuditCliOptions
 * @typedef {{ blocksRelease?: boolean, releaseMeaning?: string }} ConfidenceDefinition
 * @typedef {{ sourceId?: string, level?: number, levelRange?: number[], tier?: string, tierLabel?: string }} DisagreementSource
 * @typedef {{ checked: number, high_confidence: number, standard_confidence: number, disputed: number, weak_evidence: number, unknown: number, mismatches: number }} ContractLevelConfidenceCounts
 * @typedef {{ sourceIds: string[], activeVotingSources: number }} PublisherIndependenceGroup
 * @typedef {{ assignmentCount?: number, unreviewedAssignmentCount?: number, status?: string, countsForConsensus?: boolean, tier?: string, tierLabel?: string, licenseStatus?: string, allowedUse?: string, sourceKind?: string, canStoreAssignments?: boolean, publisherIndependence?: string, independenceGroup?: string, lineage?: string, lineageLabel?: string, derivedFromSources?: string[] }} SourceCoverageEntry
 * @typedef {{ kanji?: string, contractLevel?: number, consensusLevel?: number, agreementScore?: number, voteWeights?: Record<string, number>, sourceId?: string, licenseStatus?: string, allowedUse?: string, sourceKind?: string, canStoreAssignments?: boolean, assignmentCount?: number }} AuditIssueEntry
 * @typedef {{ kanji?: string, currentContractLevel?: number, sourceConsensusLevel?: number, agreementCount?: number, assignmentCount?: number, voteWeights?: Record<string, number>, confidence?: string, independentEvidenceLineageCount?: number, disagreementSources?: DisagreementSource[], confidenceReasons?: string[], textbookConsensus?: { consensusLevel?: number | null }, currentContractMatchesConsensus?: boolean | null }} ContractComparisonEntry
 * @typedef {{ valid: boolean, governanceValid: boolean, evidenceDepthValid: boolean, checked: number, limit: number, policy: Record<string, number>, confidenceCounts: Record<string, number>, confidenceLabels: Record<string, ConfidenceDefinition>, issueCounts: Record<string, number>, byContractLevel: Record<string, ContractLevelConfidenceCounts>, sourceCoverage: Record<string, SourceCoverageEntry>, kanjiConfidenceManifest: ContractComparisonEntry[], issues: Record<string, AuditIssueEntry[]> }} AuditReport
 */

/**
 * @param {string[]} argv
 * @returns {AuditCliOptions}
 */
function parseArgs(argv) {
    const options = {
        evidence: DEFAULT_EVIDENCE_PATH,
        governanceStrict: false,
        json: false,
        limit: 25,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--governance-strict") {
            options.governanceStrict = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = String(arg.slice("--evidence=".length) || "").trim();
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

/**
 * @param {string} label
 * @param {number} count
 * @returns {string}
 */
function formatIssueCount(label, count) {
    return `- ${label}: ${count}`;
}

/**
 * @param {Record<string, SourceCoverageEntry>} [sourceCoverage]
 * @returns {string[]}
 */
function formatSourceCoverage(sourceCoverage = {}) {
    return Object.entries(sourceCoverage)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sourceId, source]) => (
            `- ${sourceId}: ${source.assignmentCount} assignments; ${source.unreviewedAssignmentCount} unreviewed; status ${source.status}; tier ${source.tier} (${source.tierLabel}); license ${source.licenseStatus}`
            + `; use ${source.allowedUse}; kind ${source.sourceKind}; store assignments ${source.canStoreAssignments ? "yes" : "no"}`
            + `${source.publisherIndependence ? `; publisher ${source.publisherIndependence}` : ""}`
            + `${source.lineage ? `; evidence lineage ${source.lineage} (${source.lineageLabel})` : ""}`
            + `${source.derivedFromSources?.length ? `; derived from ${source.derivedFromSources.join(", ")}` : ""}`
        ));
}

/**
 * @param {Record<string, SourceCoverageEntry>} [sourceCoverage]
 * @returns {string[]}
 */
function formatPublisherIndependenceGroups(sourceCoverage = {}) {
    /** @type {Map<string, PublisherIndependenceGroup>} */
    const groups = new Map();
    for (const [sourceId, source] of Object.entries(sourceCoverage || {})) {
        const groupId = source.publisherIndependence || source.independenceGroup || sourceId;
        const group = groups.get(groupId) || {
            sourceIds: [],
            activeVotingSources: 0,
        };
        group.sourceIds.push(sourceId);
        if (source.status === "active" && source.countsForConsensus && source.sourceKind === "assignment") {
            group.activeVotingSources += 1;
        }
        groups.set(groupId, group);
    }

    return [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([groupId, group]) => (
            `- ${groupId}: ${group.sourceIds.join(", ")}`
            + `; active voting assignment lanes ${group.activeVotingSources}`
        ));
}

/**
 * @param {Record<string, ConfidenceDefinition>} [confidenceLabels]
 * @returns {string[]}
 */
function formatConfidenceLabels(confidenceLabels = {}) {
    return ["high_confidence", "standard_confidence", "disputed", "weak_evidence", "unknown"]
        .filter((labelId) => confidenceLabels[labelId])
        .map((labelId) => {
            const label = confidenceLabels[labelId];
            return `- ${labelId}: blocks release ${label.blocksRelease ? "yes" : "no"}; ${label.releaseMeaning}`;
        });
}

/**
 * @param {{ kanji?: string, contractLevel?: number, consensusLevel?: number }} [entry]
 * @returns {string}
 */
function formatKanjiIssue(entry) {
    if (!entry) {
        return "";
    }
    const level = Number.isInteger(entry.contractLevel) ? `N${entry.contractLevel}` : "unknown";
    if (Number.isInteger(entry.consensusLevel)) {
        return `${entry.kanji} (${level}; consensus N${entry.consensusLevel})`;
    }
    return `${entry.kanji} (${level})`;
}

/**
 * @param {number | null | undefined} level
 * @returns {string}
 */
function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : "none";
}

/**
 * @param {DisagreementSource} [source]
 * @returns {string}
 */
function formatLevelOrRange(source = {}) {
    if (Number.isInteger(source.level)) {
        return `N${source.level}`;
    }
    if (Array.isArray(source.levelRange) && source.levelRange.length > 0) {
        return source.levelRange.map((level) => `N${level}`).join("/");
    }
    return "unknown";
}

/**
 * @param {DisagreementSource[]} [disagreementSources]
 * @returns {string}
 */
function formatDisagreementSources(disagreementSources = []) {
    if (!Array.isArray(disagreementSources) || disagreementSources.length === 0) {
        return "none";
    }
    return disagreementSources
        .map((source) => `${source.sourceId}:${formatLevelOrRange(source)}`)
        .join(", ");
}

/**
 * @param {Record<string, number>} [voteWeights]
 * @returns {string}
 */
function formatVoteWeights(voteWeights = {}) {
    const votes = Object.entries(voteWeights || {})
        .filter(([, weight]) => Number(weight) > 0)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([level, weight]) => `N${level}:${weight}`);
    return votes.length > 0 ? votes.join(", ") : "none";
}

/**
 * @param {Record<string, ContractLevelConfidenceCounts>} [byContractLevel]
 * @returns {string[]}
 */
function formatConfidenceByContractLevel(byContractLevel = {}) {
    return Object.entries(byContractLevel || {})
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([level, counts]) => (
            `- N${level}: checked ${counts.checked}; high ${counts.high_confidence}; standard ${counts.standard_confidence}; `
            + `disputed ${counts.disputed}; weak ${counts.weak_evidence}; unknown ${counts.unknown}; mismatches ${counts.mismatches}`
        ));
}

/**
 * @param {ContractComparisonEntry[]} [rows]
 * @param {number} [limit]
 * @returns {string[]}
 */
function formatContractComparisonRows(rows = [], limit = 25) {
    return rows
        .slice(0, Math.max(1, limit || 25))
        .map((entry) => (
            `- ${entry.kanji}: current ${formatLevel(entry.currentContractLevel)}; consensus ${formatLevel(entry.sourceConsensusLevel)}; `
            + `agreement ${entry.agreementCount}/${entry.assignmentCount}; `
            + `${entry.confidence === "disputed" ? `votes ${formatVoteWeights(entry.voteWeights)}; ` : ""}`
            + `lineages ${entry.independentEvidenceLineageCount}; `
            + `disagreements ${formatDisagreementSources(entry.disagreementSources)}; `
            + `confidence ${entry.confidence}; reasons ${(entry.confidenceReasons || []).join(", ") || "none"}; `
            + `textbook consensus ${formatLevel(entry.textbookConsensus?.consensusLevel)}; `
            + `matches ${entry.currentContractMatchesConsensus === true ? "yes" : "no"}`
        ));
}

/**
 * @param {AuditIssueEntry[]} [rows]
 * @returns {string[]}
 */
function formatDisputedConsensusRows(rows = []) {
    return rows.map((entry) => (
        `- ${formatKanjiIssue(entry)}; votes ${formatVoteWeights(entry.voteWeights)}`
    ));
}

/**
 * @param {{ contractPath?: string, evidencePath?: string, report: AuditReport }} options
 * @returns {string}
 */
function formatJlptKanjiSourceEvidenceReport({
    contractPath,
    evidencePath,
    report,
}) {
    const lines = [
        "JLPT Kanji Source Evidence Audit",
        "",
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath}`,
        `Overall result: ${report.valid ? "passing" : "failing"}`,
        `Governance result: ${report.governanceValid ? "passing" : "failing"}`,
        `Evidence-depth result: ${report.evidenceDepthValid ? "passing" : "failing"}`,
        "",
        "Consensus scope: active external assignment sources with permitted source use only; current_operational_contract is comparison-only.",
        "",
        `Contract kanji checked: ${report.checked}`,
        "",
        "Policy:",
        `- Minimum independent sources: ${report.policy.minimumIndependentSources}`,
        `- Minimum independent evidence lineages: ${report.policy.minimumIndependentEvidenceLineages}`,
        `- Minimum Japanese-published sources: ${report.policy.minimumJapanesePublishedSources}`,
        `- Standard agreement score: ${report.policy.standardAgreementScore}`,
        `- High agreement score: ${report.policy.highAgreementScore}`,
        "",
        "Confidence:",
        `- high_confidence: ${report.confidenceCounts.high_confidence}`,
        `- standard_confidence: ${report.confidenceCounts.standard_confidence}`,
        `- disputed: ${report.confidenceCounts.disputed}`,
        `- weak_evidence: ${report.confidenceCounts.weak_evidence}`,
        `- unknown: ${report.confidenceCounts.unknown}`,
        "",
        "Confidence labels:",
        ...formatConfidenceLabels(report.confidenceLabels),
        "",
        "Confidence reasons are computed per kanji from source lineage and evidence state.",
        "",
        "Issue counts:",
        formatIssueCount("Missing evidence", report.issueCounts.missingEvidence),
        formatIssueCount("Insufficient independent sources", report.issueCounts.insufficientIndependentSources),
        formatIssueCount("Insufficient independent evidence lineages", report.issueCounts.insufficientIndependentEvidenceLineages),
        formatIssueCount("Missing Japanese-published source", report.issueCounts.missingJapanesePublishedSource),
        formatIssueCount("Disputed consensus", report.issueCounts.disputedConsensus),
        formatIssueCount("Contract/consensus mismatches", report.issueCounts.contractConsensusMismatch),
        formatIssueCount("Unreviewed source assignments", report.issueCounts.unreviewedAssignments),
        formatIssueCount("Unapproved active voting sources", report.issueCounts.unapprovedActiveSources),
        formatIssueCount("Unknown assignment sources", report.issueCounts.unknownAssignmentSource),
        formatIssueCount("Assignments outside contract", report.issueCounts.assignmentOutsideContract),
        formatIssueCount("Declared consensus mismatches", report.issueCounts.declaredConsensusMismatch),
        formatIssueCount("Declared agreement mismatches", report.issueCounts.declaredAgreementMismatch),
        formatIssueCount("Declared confidence mismatches", report.issueCounts.declaredConfidenceMismatch),
        formatIssueCount("Missing source-use profiles", report.issueCounts.missingSourceUseProfile),
        formatIssueCount("Missing license/use evidence", report.issueCounts.missingLicenseEvidence),
        formatIssueCount("Illegal consensus source use", report.issueCounts.illegalConsensusSourceUse),
        formatIssueCount("Disallowed stored assignments", report.issueCounts.disallowedStoredAssignments),
        "",
        "Confidence by contract level:",
        ...formatConfidenceByContractLevel(report.byContractLevel),
        "",
        "Publisher independence groups:",
        ...formatPublisherIndependenceGroups(report.sourceCoverage),
        "",
        "Source coverage:",
        ...formatSourceCoverage(report.sourceCoverage),
        "",
        `Current contract comparison samples (${Math.min(report.kanjiConfidenceManifest.length, Math.max(1, report.limit || 25))} shown):`,
        ...formatContractComparisonRows(report.kanjiConfidenceManifest, report.limit),
    ];

    if (report.issues.missingEvidence.length > 0) {
        lines.push("", `Missing evidence samples (${report.issues.missingEvidence.length} shown):`);
        for (const entry of report.issues.missingEvidence) {
            lines.push(`- ${formatKanjiIssue(entry)}`);
        }
    }

    if (report.issues.contractConsensusMismatches.length > 0) {
        lines.push("", `Contract/consensus mismatch samples (${report.issues.contractConsensusMismatches.length} shown):`);
        for (const entry of report.issues.contractConsensusMismatches) {
            lines.push(`- ${formatKanjiIssue(entry)}; agreement ${Number(entry.agreementScore || 0).toFixed(2)}`);
        }
    }

    if (report.issues.disputedConsensus.length > 0) {
        lines.push("", `Disputed consensus samples (${report.issues.disputedConsensus.length} shown):`);
        lines.push(...formatDisputedConsensusRows(report.issues.disputedConsensus));
    }

    if (report.issues.unapprovedActiveSources.length > 0) {
        lines.push("", `Unapproved active voting sources (${report.issues.unapprovedActiveSources.length} shown):`);
        for (const entry of report.issues.unapprovedActiveSources) {
            lines.push(`- ${entry.sourceId}: license ${entry.licenseStatus}`);
        }
    }

    if (report.issues.illegalConsensusSourceUses.length > 0) {
        lines.push("", `Illegal consensus source-use samples (${report.issues.illegalConsensusSourceUses.length} shown):`);
        for (const entry of report.issues.illegalConsensusSourceUses) {
            lines.push(`- ${entry.sourceId}: use ${entry.allowedUse}; kind ${entry.sourceKind}; store assignments ${entry.canStoreAssignments ? "yes" : "no"}`);
        }
    }

    if (report.issues.disallowedStoredAssignments.length > 0) {
        lines.push("", `Disallowed stored-assignment samples (${report.issues.disallowedStoredAssignments.length} shown):`);
        for (const entry of report.issues.disallowedStoredAssignments) {
            lines.push(`- ${entry.sourceId}: ${entry.assignmentCount} assignments; use ${entry.allowedUse}; kind ${entry.sourceKind}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:audit:jlpt:sources", options.unknownArgs);

    const contractPath = path.join(process.cwd(), "templates", "jlpt_level_contract.json");
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE_PATH);

    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract: ${contractPath}`);
    }
    if (!fs.existsSync(evidencePath)) {
        throw new Error(`Missing JLPT kanji source evidence file: ${evidencePath}`);
    }

    const report = /** @type {AuditReport} */ (auditJlptKanjiSourceEvidence({
        contract: loadJlptLevelContract(contractPath),
        evidence: loadJlptKanjiSourceEvidence(evidencePath),
        limit: options.limit,
    }));

    if (options.json) {
        console.log(JSON.stringify({
            contractPath,
            evidencePath,
            ...report,
        }, null, 2));
    } else {
        process.stdout.write(formatJlptKanjiSourceEvidenceReport({
            contractPath,
            evidencePath,
            report,
        }));
    }

    if (options.governanceStrict && !report.governanceValid) {
        process.exit(1);
    }
    if (options.strict && !report.valid) {
        process.exit(1);
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_EVIDENCE_PATH,
    formatJlptKanjiSourceEvidenceReport,
    main,
    parseArgs,
};
