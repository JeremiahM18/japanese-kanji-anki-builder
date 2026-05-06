const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const {
    JLPT_LEVELS_DESC,
    buildJlptKanjiSourceLevelDeltaReport,
    formatLevel,
} = require("../src/services/jlptKanjiSourceLevelDeltaService");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";

function parseLevelFilter(value) {
    const text = String(value ?? "").trim();
    if (!text) {
        return null;
    }
    const match = text.match(/^n?([1-5])$/i);
    if (!match) {
        throw new Error(`Invalid JLPT level filter: ${text}`);
    }
    return Number(match[1]);
}

function parseLimit(value) {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error(`Invalid positive limit: ${value}`);
    }
    return limit;
}

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        json: false,
        level: null,
        limit: 25,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = String(arg.slice("--contract=".length) || "").trim();
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = String(arg.slice("--evidence=".length) || "").trim();
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevelFilter(arg.slice("--level=".length));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseLimit(arg.slice("--limit=".length));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatVoteWeights(voteWeights = {}) {
    const votes = Object.entries(voteWeights || {})
        .filter(([, weight]) => Number(weight) > 0)
        .sort(([a], [b]) => Number(b) - Number(a))
        .map(([level, weight]) => `N${level}:${weight}`);
    return votes.length > 0 ? votes.join(", ") : "none";
}

function formatSourceClaimCounts(sourceClaimCounts = {}) {
    const parts = Object.entries(sourceClaimCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sourceId, count]) => `${sourceId}:${count}`);
    return parts.length > 0 ? parts.join(", ") : "none";
}

function formatDeltaRows(rows = [], limit = 25) {
    return rows
        .slice(0, Math.max(1, limit || 25))
        .map((row) => (
            `- ${row.kanji}: current ${formatLevel(row.currentContractLevel)}; target ${formatLevel(row.targetLevel)}; `
            + `sources ${row.sourceIds?.length ? row.sourceIds.join(", ") : "none"}; `
            + `consensus ${formatLevel(row.sourceConsensusLevel)}; confidence ${row.confidence || "unknown"}; `
            + `votes ${formatVoteWeights(row.voteWeights)}`
        ));
}

function formatLevelSection({ summary, limit } = {}) {
    const lines = [
        `N${summary.level} detail:`,
        `- source claims outside current N${summary.level}: ${summary.sourceClaimsOutsideCurrent.length}`,
        ...formatDeltaRows(summary.sourceClaimsOutsideCurrent, limit),
        `- source consensus outside current N${summary.level}: ${summary.sourceConsensusOutsideCurrent.length}`,
        ...formatDeltaRows(summary.sourceConsensusOutsideCurrent, limit),
        `- disputed source candidates outside current N${summary.level}: ${summary.disputedSourceCandidatesOutsideCurrent.length}`,
        ...formatDeltaRows(summary.disputedSourceCandidatesOutsideCurrent, limit),
        `- current N${summary.level} rows with source consensus elsewhere: ${summary.currentContractConsensusElsewhere.length}`,
        ...formatDeltaRows(summary.currentContractConsensusElsewhere, limit),
    ];
    return lines;
}

function formatJlptKanjiSourceLevelDeltaReport({
    contractPath,
    evidencePath,
    report,
    level = null,
} = {}) {
    const levels = Number.isInteger(level) ? [level] : JLPT_LEVELS_DESC;
    const lines = [
        "JLPT Kanji Source Level Delta Audit",
        "",
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath}`,
        "Result: informational",
        `No deck mutation: ${report.noDeckMutation === false ? "no" : "yes"}`,
        "",
        "This command compares the current operational taxonomy against active external source claims and consensus. It does not move kanji, move words, update decks, or change readiness.",
        "",
        `Contract kanji checked: ${report.checked}`,
        "",
        "Level summary:",
    ];

    for (const currentLevel of levels) {
        const summary = report.byLevel?.[currentLevel];
        if (!summary) {
            continue;
        }
        lines.push(
            `- N${currentLevel}: current contract ${summary.currentContractCount}; `
            + `source consensus ${summary.sourceConsensusCount}; source candidates ${summary.sourceCandidateCount}; `
            + `source claims outside current ${summary.sourceClaimsOutsideCurrent.length}; `
            + `source consensus outside current ${summary.sourceConsensusOutsideCurrent.length}; `
            + `disputed source candidates outside current ${summary.disputedSourceCandidatesOutsideCurrent.length}; `
            + `current rows with consensus elsewhere ${summary.currentContractConsensusElsewhere.length}; `
            + `claims by source ${formatSourceClaimCounts(summary.sourceClaimCounts)}`
        );
    }

    for (const currentLevel of levels) {
        const summary = report.byLevel?.[currentLevel];
        if (!summary) {
            continue;
        }
        lines.push("", ...formatLevelSection({ summary, limit: report.limit }));
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:audit:jlpt:source-levels", options.unknownArgs);

    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract: ${contractPath}`);
    }
    if (!fs.existsSync(evidencePath)) {
        throw new Error(`Missing JLPT kanji source evidence file: ${evidencePath}`);
    }

    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract: loadJlptLevelContract(contractPath),
        evidence: loadJlptKanjiSourceEvidence(evidencePath),
        limit: options.limit,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify({
            contractPath,
            evidencePath,
            level: options.level,
            ...report,
        }, null, 2)}\n`);
    } else {
        process.stdout.write(formatJlptKanjiSourceLevelDeltaReport({
            contractPath,
            evidencePath,
            report,
            level: options.level,
        }));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    formatJlptKanjiSourceLevelDeltaReport,
    main,
    parseArgs,
};
