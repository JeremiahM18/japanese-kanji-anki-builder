const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
const {
    auditJlptWordSourceEvidence,
    buildSourceAdequacyByLevel,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONTRACT = "templates/jlpt_word_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        governanceStrict: false,
        json: false,
        levels: [5, 4, 3, 2, 1],
        scopeLevels: null,
        limit: 25,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg === "--governance-strict") {
            options.governanceStrict = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
            options.scopeLevels = options.levels;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
            options.scopeLevels = options.levels;
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = arg.slice("--evidence=".length);
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function formatSourceCoverage(sourceCoverage = {}) {
    return Object.values(sourceCoverage)
        .sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId)))
        .map((source) => (
            `- ${source.sourceId}: status ${source.status}; license ${source.licenseStatus}; consensus ${source.countsForConsensus ? "yes" : "no"}; `
            + `assignments ${source.reviewedAssignmentCount}/${source.assignmentCount}; family ${source.independenceGroup}; lineage ${source.evidenceLineage}; action data source`
        ));
}

function formatPostureRows(rows = [], limit = 25) {
    return rows
        .slice(0, Math.max(1, limit || 25))
        .map((entry) => (
            `- ${entry.identity}: contract ${entry.contractLevel ? `N${entry.contractLevel}` : "none"}; `
            + `source consensus ${entry.sourceConsensusLevel ? `N${entry.sourceConsensusLevel}` : "none"}; `
            + `assignments ${entry.assignmentCount}; families ${entry.independentSourceCount}; lineages ${entry.independentEvidenceLineageCount}; `
            + `learner sources ${entry.japanesePublishedOrPermissionedLearnerSourceCount}; `
            + `dictionary identity ${entry.dictionaryIdentitySupported ? "yes" : "no"}; `
            + `commonness ${entry.commonnessSupported ? "yes" : "no"}; posture ${entry.posture}`
        ));
}

function formatLevelSummary(byLevel = {}, levels = [5, 4, 3, 2, 1]) {
    return Object.entries(byLevel)
        .filter(([level]) => levels.includes(Number(level)))
        .sort(([left], [right]) => Number(right) - Number(left))
        .map(([level, summary]) => (
            `- N${level}: checked ${summary.checked}; universe standard ${summary.level_universe_standard || 0}; `
            + `not evaluated ${summary.source_origin_not_evaluated || 0}; single-family ${summary.single_source_family || 0}; `
            + `multi-source ${summary.multi_source_supported || 0}; disputed ${summary.disputed_level_claim || 0}; `
            + `missing dictionary identity ${summary.missingDictionaryIdentitySupport || 0}; `
            + `missing commonness ${summary.missingCommonnessSupport || 0}; `
            + `source-depth ${summary.sourceDepthComplete ? "complete" : "incomplete"}`
        ));
}

function formatJlptWordSourceEvidenceReport({ contractPath, evidencePath, report }) {
    const lines = [
        "JLPT Word Source Evidence Audit",
        "",
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath}`,
        `Overall result: ${report.valid ? "passing" : "failing"}`,
        `Governance result: ${report.governanceValid ? "passing" : "failing"}`,
        `Evidence-depth result: ${report.evidenceDepthValid ? "passing" : "failing"}`,
        "",
        "This is a read-only source-origin and vocabulary-universe audit. It does not add words, move words, change denominators, certify Silver/Gold/Sapphire/Platinum/Obsidian, or touch kanji lanes.",
        "",
        `Checked word identities: ${report.checked}`,
        `Selected contract identities: ${report.selectedContractIdentityCount}`,
        `Out-of-scope contract identities: ${report.outOfScopeContractIdentityCount}`,
        `Out-of-scope comparable identities: ${report.outOfScopeComparableIdentityCount}`,
        `Comparable source-only identities: ${report.comparableSourceOnlyIdentityCount}`,
        `Comparable voting sources: ${report.comparableSourceCount}`,
        `Configured source only: ${report.configuredSourceOnly ? "yes" : "no"}`,
        `Warning: ${report.warning}`,
        "",
        "Policy:",
        `- Minimum independent sources: ${report.policy.minimumIndependentSources}`,
        `- Minimum independent evidence lineages: ${report.policy.minimumIndependentEvidenceLineages}`,
        `- Minimum Japanese-published or permissioned learner sources: ${report.policy.minimumJapanesePublishedOrPermissionedLearnerSources}`,
        `- Require dictionary identity support: ${report.policy.requireDictionaryIdentitySupport ? "yes" : "no"}`,
        `- Require commonness support: ${report.policy.requireCommonnessSupport ? "yes" : "no"}`,
        "",
        "Posture counts:",
        ...Object.entries(report.postureCounts).map(([posture, count]) => `- ${posture}: ${count}`),
        "",
        "Issue counts:",
        ...Object.entries(report.issueCounts).map(([issue, count]) => `- ${issue}: ${count}`),
        "",
        "By level:",
        ...formatLevelSummary(report.byLevel, report.levels),
        "",
        "Source coverage:",
        ...formatSourceCoverage(report.sourceCoverage),
        "",
        `Source-origin posture samples (${Math.min(report.wordSourcePosture.length, Math.max(1, report.limit || 25))} shown):`,
        ...formatPostureRows(report.wordSourcePosture, report.limit),
    ];

    return `${lines.join("\n")}\n`;
}

function buildReport(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT word contract: ${contractPath}`);
    }
    if (!fs.existsSync(evidencePath)) {
        throw new Error(`Missing JLPT word source evidence: ${evidencePath}`);
    }
    const report = auditJlptWordSourceEvidence({
        contract: loadJlptWordLevelContract(contractPath),
        evidence: loadJlptWordSourceEvidence(evidencePath),
        levels: options.scopeLevels,
        limit: options.limit,
    });
    return {
        contractPath,
        evidencePath,
        ...report,
        levels: options.levels,
        sourceAdequacyByLevel: buildSourceAdequacyByLevel(report),
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:word-sources", options.unknownArgs);
    const report = buildReport(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatJlptWordSourceEvidenceReport({
            contractPath: report.contractPath,
            evidencePath: report.evidencePath,
            report,
        }));
    }
    if (options.governanceStrict && !report.governanceValid) {
        process.exitCode = 1;
    }
    if (options.strict && !report.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildReport,
    formatJlptWordSourceEvidenceReport,
    main,
    parseArgs,
};
