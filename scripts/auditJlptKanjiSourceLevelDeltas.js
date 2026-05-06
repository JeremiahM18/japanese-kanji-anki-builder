const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    normalizeInputLevel,
    parseSourceAssignmentRows,
} = require("../src/services/jlptKanjiSourceInputService");
const {
    JLPT_LEVELS_DESC,
    buildJlptKanjiSourceLevelDeltaReport,
    formatLevel,
} = require("../src/services/jlptKanjiSourceLevelDeltaService");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";
const DEFAULT_SOURCE_INPUTS = "templates/jlpt_kanji_source_inputs.json";

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
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        worklist: false,
        worklistOnly: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--worklist") {
            options.worklist = true;
        } else if (arg === "--worklist-only") {
            options.worklist = true;
            options.worklistOnly = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = String(arg.slice("--contract=".length) || "").trim();
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = String(arg.slice("--evidence=".length) || "").trim();
        } else if (arg.startsWith("--source-inputs=")) {
            options.sourceInputs = String(arg.slice("--source-inputs=".length) || "").trim();
        } else if (arg === "--no-source-inputs") {
            options.sourceInputs = null;
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

function normalizeText(value) {
    return String(value ?? "").trim();
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

function formatSourceInputLevel(review = {}) {
    if (Number.isInteger(review.level)) {
        return formatLevel(review.level);
    }
    if (Array.isArray(review.levelRange) && review.levelRange.length > 0) {
        return review.levelRange.map((level) => formatLevel(level)).join("-");
    }
    return "none";
}

function formatSourceInputReviews(reviews = []) {
    const parts = reviews
        .filter((review) => review?.sourceId && review?.reviewStatus)
        .map((review) => `${review.sourceId}:${review.reviewStatus}=${formatSourceInputLevel(review)}`);
    return parts.length > 0 ? `; local source-input ${parts.join(", ")}` : "";
}

function formatLevels(levels = []) {
    const parts = (levels || [])
        .filter((level) => Number.isInteger(level))
        .map((level) => formatLevel(level));
    return parts.length > 0 ? parts.join(", ") : "none";
}

function formatSourceInputReviewCounts(counts = {}) {
    const parts = ["reviewed", "blocked", "source_access_gap"]
        .filter((status) => Number(counts?.[status]) > 0)
        .map((status) => `${status}:${counts[status]}`);
    return parts.length > 0 ? parts.join(", ") : "none";
}

function formatSourceInputReviewCountsBySource(countsBySource = {}) {
    const parts = Object.entries(countsBySource)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sourceId, counts]) => `${sourceId} ${formatSourceInputReviewCounts(counts)}`)
        .filter((part) => !part.endsWith(" none"));
    return parts.length > 0 ? parts.join("; ") : "none";
}

function formatDeltaRows(rows = [], limit = 25) {
    return rows
        .slice(0, Math.max(1, limit || 25))
        .map((row) => (
            `- ${row.kanji}: current ${formatLevel(row.currentContractLevel)}; target ${formatLevel(row.targetLevel)}; `
            + `sources ${row.sourceIds?.length ? row.sourceIds.join(", ") : "none"}; `
            + `consensus ${formatLevel(row.sourceConsensusLevel)}; confidence ${row.confidence || "unknown"}; `
            + `votes ${formatVoteWeights(row.voteWeights)}`
            + formatSourceInputReviews(row.sourceInputReviews)
        ));
}

function summarizeWorklistPriorities(rows = []) {
    return rows.reduce((counts, row) => {
        const priority = row.reviewPriority || "unknown";
        counts[priority] = (counts[priority] || 0) + 1;
        return counts;
    }, {});
}

function formatWorklistPrioritySummary(rows = []) {
    const counts = summarizeWorklistPriorities(rows);
    return Object.entries(counts)
        .sort(([, countA], [, countB]) => countB - countA)
        .map(([priority, count]) => `${priority}: ${count}`)
        .join(", ") || "none";
}

function formatWorklistRows(rows = [], limit = 25) {
    return rows
        .slice(0, Math.max(1, limit || 25))
        .map((row) => (
            `- ${row.kanji}: priority ${row.reviewPriority}; current ${formatLevel(row.currentContractLevel)}; `
            + `review levels ${formatLevels(row.reviewLevels)}; source candidates ${formatLevels(row.sourceCandidateLevels)}; `
            + `consensus ${formatLevel(row.sourceConsensusLevel)}; confidence ${row.confidence || "unknown"}; `
            + `votes ${formatVoteWeights(row.voteWeights)}`
            + formatSourceInputReviews(row.sourceInputReviews)
        ));
}

function formatWorklistSection({ report, limit } = {}) {
    const rows = report.reviewWorklist || [];
    return [
        "All-level review worklist:",
        `- total rows needing governed source review: ${rows.length}`,
        `- priority summary: ${formatWorklistPrioritySummary(rows)}`,
        "- method: review every listed level for the selected manual source lane; record reviewed only for exact source-level evidence, leave unresolved rows needs_review, and use source_access_gap only when permitted source material was checked but exact assignment proof is not available yet.",
        ...formatWorklistRows(rows, limit),
    ];
}

function formatLevelSection({ summary, limit } = {}) {
    const lines = [
        `N${summary.level} detail:`,
        `- missing from current N${summary.level} by active source claim: ${summary.missingSourceCandidatesFromCurrent.length}`,
        `- local source-input progress on those missing-claim rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.missingSourceCandidatesFromCurrent)}`,
        ...formatDeltaRows(summary.missingSourceCandidatesFromCurrent, limit),
        `- missing from current N${summary.level} by active source consensus: ${summary.missingSourceConsensusFromCurrent.length}`,
        `- local source-input progress on those missing-consensus rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.missingSourceConsensusFromCurrent)}`,
        ...formatDeltaRows(summary.missingSourceConsensusFromCurrent, limit),
        `- missing from current N${summary.level} but disputed: ${summary.disputedMissingSourceCandidatesFromCurrent.length}`,
        `- local source-input progress on those disputed rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.disputedMissingSourceCandidatesFromCurrent)}`,
        ...formatDeltaRows(summary.disputedMissingSourceCandidatesFromCurrent, limit),
        `- current N${summary.level} rows with source consensus elsewhere: ${summary.currentContractConsensusElsewhere.length}`,
        `- local source-input progress on those consensus-elsewhere rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.currentContractConsensusElsewhere)}`,
        ...formatDeltaRows(summary.currentContractConsensusElsewhere, limit),
        `- current N${summary.level} rows without exact same-level source claim: ${summary.currentRowsWithoutSourceCandidateCount}`,
        `- local source-input progress on those missing-claim current rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.currentRowsWithoutSourceCandidate)}`,
        ...formatDeltaRows(summary.currentRowsWithoutSourceCandidate, limit),
        `- current N${summary.level} rows without same-level source consensus: ${summary.currentRowsWithoutSourceConsensusCount}`,
        `- local source-input progress on those missing-consensus current rows: ${formatSourceInputReviewCounts(summary.sourceInputReviewCounts?.currentRowsWithoutSourceConsensus)}`,
        ...formatDeltaRows(summary.currentRowsWithoutSourceConsensus, limit),
    ];
    return lines;
}

function formatJlptKanjiSourceLevelDeltaReport({
    contractPath,
    evidencePath,
    sourceInputsPath = null,
    report,
    level = null,
    worklist = false,
    worklistOnly = false,
} = {}) {
    const levels = Number.isInteger(level) ? [level] : JLPT_LEVELS_DESC;
    const lines = [
        "JLPT Kanji Source Level Delta Audit",
        "",
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath}`,
        `Source inputs: ${sourceInputsPath || "disabled"}`,
        "Result: informational",
        `No deck mutation: ${report.noDeckMutation === false ? "no" : "yes"}`,
        "",
        "This command compares the current operational taxonomy against active external source claims and consensus. It does not move kanji, move words, update decks, or change readiness.",
        "Local source-input annotations are non-voting in-review progress only.",
        "",
        `Contract kanji checked: ${report.checked}`,
        `Local source-input progress: ${formatSourceInputReviewCountsBySource(report.sourceInputReviewCountsBySource)}`,
    ];

    if (!worklistOnly) {
        lines.push("", "Level summary:");

        for (const currentLevel of levels) {
            const summary = report.byLevel?.[currentLevel];
            if (!summary) {
                continue;
            }
            lines.push(
                `- N${currentLevel}: current contract ${summary.currentContractCount}; `
                + `source candidates ${summary.sourceCandidateCount} `
                + `(already current ${summary.sourceCandidateAlreadyCurrentCount}, missing from current ${summary.sourceCandidateMissingFromCurrentCount}); `
                + `source consensus ${summary.sourceConsensusCount} `
                + `(already current ${summary.sourceConsensusAlreadyCurrentCount}, missing from current ${summary.sourceConsensusMissingFromCurrentCount}); `
                + `disputed missing candidates ${summary.disputedMissingSourceCandidatesFromCurrent.length}; `
                + `current rows with consensus elsewhere ${summary.currentContractConsensusElsewhere.length}; `
                + `current rows without source claim ${summary.currentRowsWithoutSourceCandidateCount}; `
                + `current rows without source consensus ${summary.currentRowsWithoutSourceConsensusCount}; `
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
    }

    if (worklist) {
        lines.push("", ...formatWorklistSection({ report, limit: report.limit }));
    }

    return `${lines.join("\n")}\n`;
}

function buildJsonOutput({ contractPath, evidencePath, sourceInputsPath = null, level = null, report } = {}) {
    const byLevel = Number.isInteger(level)
        ? { [level]: report.byLevel?.[level] }
        : report.byLevel;
    return {
        contractPath,
        evidencePath,
        sourceInputsPath,
        level,
        ...report,
        byLevel,
    };
}

function buildSourceInputReviews({ sourceInputsPath = null, evidence = {} } = {}) {
    if (!sourceInputsPath || !fs.existsSync(sourceInputsPath)) {
        return [];
    }
    const sourceInputs = loadJlptKanjiSourceInputs(sourceInputsPath);
    const reviews = [];

    for (const [sourceId, sourceConfig] of Object.entries(sourceInputs.inputs || {})) {
        const source = evidence.sources?.[sourceId];
        if (!source) {
            continue;
        }
        const reportableStatuses = source.status === "active"
            ? new Set(["blocked", "source_access_gap"])
            : new Set(["reviewed", "blocked", "source_access_gap"]);
        const sourcePath = sourceConfig.sourcePath
            ? path.resolve(process.cwd(), sourceConfig.sourcePath)
            : null;
        if (!sourcePath || !fs.existsSync(sourcePath)) {
            continue;
        }
        const rows = parseSourceAssignmentRows(
            fs.readFileSync(sourcePath, "utf8"),
            sourceConfig.format || "tsv"
        );
        for (const row of rows) {
            const kanji = normalizeText(row[sourceConfig.kanjiColumn || "kanji"]);
            const reviewStatus = normalizeText(row[sourceConfig.reviewStatusColumn || "reviewStatus"])
                || sourceConfig.defaultReviewStatus
                || "needs_review";
            if (!reportableStatuses.has(reviewStatus)) {
                continue;
            }
            const levelValue = normalizeText(row[sourceConfig.levelColumn || "level"]);
            const normalizedLevel = levelValue
                ? normalizeInputLevel(levelValue, sourceConfig.levelMapping)
                : { level: null, levelRange: null };
            reviews.push({
                kanji,
                sourceId,
                reviewStatus,
                level: normalizedLevel.level,
                levelRange: normalizedLevel.levelRange,
            });
        }
    }

    return reviews;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:audit:jlpt:source-levels", options.unknownArgs);

    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const sourceInputsPath = options.sourceInputs
        ? path.resolve(process.cwd(), options.sourceInputs)
        : null;
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract: ${contractPath}`);
    }
    if (!fs.existsSync(evidencePath)) {
        throw new Error(`Missing JLPT kanji source evidence file: ${evidencePath}`);
    }
    if (sourceInputsPath && !fs.existsSync(sourceInputsPath)) {
        throw new Error(`Missing JLPT kanji source input config: ${sourceInputsPath}`);
    }

    const evidence = loadJlptKanjiSourceEvidence(evidencePath);
    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract: loadJlptLevelContract(contractPath),
        evidence,
        limit: options.limit,
        sourceInputReviews: buildSourceInputReviews({ sourceInputsPath, evidence }),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(buildJsonOutput({
            contractPath,
            evidencePath,
            sourceInputsPath,
            level: options.level,
            report,
        }), null, 2)}\n`);
    } else {
        process.stdout.write(formatJlptKanjiSourceLevelDeltaReport({
            contractPath,
            evidencePath,
            sourceInputsPath,
            report,
            level: options.level,
            worklist: options.worklist,
            worklistOnly: options.worklistOnly,
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
    DEFAULT_SOURCE_INPUTS,
    buildSourceInputReviews,
    buildJsonOutput,
    formatWorklistPrioritySummary,
    formatJlptKanjiSourceLevelDeltaReport,
    main,
    parseArgs,
    summarizeWorklistPriorities,
};
