const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { auditJlptKanjiSourceEvidence } = require("../src/services/jlptKanjiSourceEvidenceService");

const DEFAULT_EVIDENCE_PATH = "templates/jlpt_kanji_source_evidence.json";

function parseArgs(argv) {
    const options = {
        evidence: DEFAULT_EVIDENCE_PATH,
        json: false,
        limit: 25,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
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

function formatIssueCount(label, count) {
    return `- ${label}: ${count}`;
}

function formatSourceCoverage(sourceCoverage = {}) {
    return Object.entries(sourceCoverage)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sourceId, source]) => (
            `- ${sourceId}: ${source.assignmentCount} assignments; ${source.unreviewedAssignmentCount} unreviewed; status ${source.status}; tier ${source.tier} (${source.tierLabel}); license ${source.licenseStatus}`
        ));
}

function formatConfidenceLabels(confidenceLabels = {}) {
    return ["high_confidence", "standard_confidence", "disputed", "weak_evidence", "unknown"]
        .filter((labelId) => confidenceLabels[labelId])
        .map((labelId) => {
            const label = confidenceLabels[labelId];
            return `- ${labelId}: ${label.label}; blocks release ${label.blocksRelease ? "yes" : "no"}`;
        });
}

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

function formatJlptKanjiSourceEvidenceReport({
    contractPath,
    evidencePath,
    report,
} = {}) {
    const lines = [
        "JLPT Kanji Source Evidence Audit",
        "",
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath}`,
        `Overall result: ${report.valid ? "passing" : "failing"}`,
        "",
        `Contract kanji checked: ${report.checked}`,
        "",
        "Policy:",
        `- Minimum independent sources: ${report.policy.minimumIndependentSources}`,
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
        "Issue counts:",
        formatIssueCount("Missing evidence", report.issueCounts.missingEvidence),
        formatIssueCount("Insufficient independent sources", report.issueCounts.insufficientIndependentSources),
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
        "",
        "Source coverage:",
        ...formatSourceCoverage(report.sourceCoverage),
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
            lines.push(`- ${formatKanjiIssue(entry)}; agreement ${entry.agreementScore.toFixed(2)}`);
        }
    }

    if (report.issues.unapprovedActiveSources.length > 0) {
        lines.push("", `Unapproved active voting sources (${report.issues.unapprovedActiveSources.length} shown):`);
        for (const entry of report.issues.unapprovedActiveSources) {
            lines.push(`- ${entry.sourceId}: license ${entry.licenseStatus}`);
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

    const report = auditJlptKanjiSourceEvidence({
        contract: loadJlptLevelContract(contractPath),
        evidence: loadJlptKanjiSourceEvidence(evidencePath),
        limit: options.limit,
    });

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
