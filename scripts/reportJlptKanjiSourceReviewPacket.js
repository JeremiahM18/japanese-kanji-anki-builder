const fs = require("node:fs");
const path = require("node:path");

const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildSourceLevelDeltaReportFromPaths,
    formatWorklistPrioritySummary,
} = require("../src/services/jlptKanjiSourceLevelDeltaCommandService");

const PACKET_SCHEMA = "jlpt-kanji-source-review-packet/v1";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        source: null,
        limit: 25,
        json: true,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--text") {
            options.json = false;
        } else if (arg === "--no-source-inputs") {
            options.sourceInputs = null;
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--source-inputs=")) {
            options.sourceInputs = parseStringOption(arg, "source-inputs");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatLevel(level) {
    return Number.isInteger(level) ? `N${level}` : null;
}

function formatLevels(levels = []) {
    return (levels || [])
        .filter((level) => Number.isInteger(level))
        .map((level) => formatLevel(level));
}

function formatVoteWeights(voteWeights = {}) {
    return Object.fromEntries(
        Object.entries(voteWeights || {})
            .filter(([, weight]) => Number(weight) > 0)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([level, weight]) => [formatLevel(Number(level)), weight])
    );
}

function normalizeSupportedLevels(levels = []) {
    return new Set((levels || [])
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5));
}

function hasSupportedReviewLevel(row = {}, supportedLevels = new Set()) {
    if (supportedLevels.size === 0) {
        return true;
    }
    return (row.reviewLevels || []).some((level) => supportedLevels.has(Number(level)));
}

function hasSelectedSourceResolution(row = {}, sourceId = null) {
    if (!sourceId) {
        return false;
    }
    return (row.sourceInputReviews || []).some((review) => (
        review.sourceId === sourceId
        && ["reviewed", "blocked", "source_access_gap"].includes(review.reviewStatus)
    ));
}

function summarizePriorityCounts(rows = []) {
    return rows.reduce((counts, row) => {
        const priority = row.reviewPriority || "unknown";
        counts[priority] = (counts[priority] || 0) + 1;
        return counts;
    }, {});
}

function compactReviewedSource(source = {}) {
    return {
        sourceId: source.sourceId,
        level: formatLevel(source.level),
        levelRange: formatLevels(source.levelRange),
    };
}

function compactSourceInputReview(review = {}) {
    return {
        sourceId: review.sourceId,
        status: review.reviewStatus,
        level: formatLevel(review.level),
        levelRange: formatLevels(review.levelRange),
    };
}

function compactWorklistRow(row = {}) {
    return {
        kanji: row.kanji,
        currentLevel: formatLevel(row.currentContractLevel),
        priority: row.reviewPriority,
        reason: row.reviewReason,
        reviewLevels: formatLevels(row.reviewLevels),
        sourceCandidateLevels: formatLevels(row.sourceCandidateLevels),
        missingFromCurrentSourceLevels: formatLevels(row.missingFromCurrentSourceLevels),
        consensusLevel: formatLevel(row.sourceConsensusLevel),
        confidence: row.confidence || "unknown",
        voteWeights: formatVoteWeights(row.voteWeights),
        counts: {
            assignments: row.assignmentCount || 0,
            independentSources: row.independentSourceCount || 0,
            independentEvidenceLineages: row.independentEvidenceLineageCount || 0,
            japanesePublishedSources: row.japanesePublishedSourceCount || 0,
        },
        confidenceReasons: row.confidenceReasons || [],
        reviewedSources: (row.reviewedSources || []).map(compactReviewedSource),
        sourceInputReviews: (row.sourceInputReviews || []).map(compactSourceInputReview),
    };
}

function resolveSelectedSource({ sourceInputsPath = null, sourceId = null, evidence = {} } = {}) {
    if (!sourceId) {
        return null;
    }

    const source = evidence.sources?.[sourceId] || null;
    let sourceInput = null;
    if (sourceInputsPath && fs.existsSync(sourceInputsPath)) {
        const manifest = loadJlptKanjiSourceInputs(sourceInputsPath);
        sourceInput = manifest.inputs?.[sourceId] || null;
    }
    if (!source && !sourceInput) {
        throw new Error(`Unknown JLPT kanji source lane: ${sourceId}`);
    }

    return {
        sourceId,
        status: source?.status || null,
        sourceKind: source?.sourceKind || null,
        allowedUse: source?.allowedUse || null,
        licenseStatus: source?.licenseStatus || null,
        canStoreAssignments: source?.canStoreAssignments === true,
        countsForConsensus: source?.countsForConsensus === true,
        supportedLevels: formatLevels(sourceInput?.supportedLevels || []),
        sourcePath: sourceInput?.sourcePath || null,
    };
}

function buildJlptKanjiSourceReviewPacket({
    contractPath,
    evidencePath,
    sourceInputsPath = null,
    sourceId = null,
    report,
    evidence = {},
    limit = 25,
    generatedAt = new Date().toISOString(),
} = {}) {
    const selectedSource = resolveSelectedSource({ sourceInputsPath, sourceId, evidence });
    const supportedLevelSet = normalizeSupportedLevels(
        selectedSource?.supportedLevels?.map((level) => String(level).replace(/^N/u, "")) || []
    );
    const candidateRows = (report.reviewWorklist || [])
        .filter((row) => hasSupportedReviewLevel(row, supportedLevelSet))
        .filter((row) => !hasSelectedSourceResolution(row, sourceId));
    const maxRows = Number.isInteger(limit) && limit > 0 ? limit : 25;
    const rows = candidateRows.slice(0, maxRows).map(compactWorklistRow);

    return {
        schema: PACKET_SCHEMA,
        generatedAt,
        readOnly: true,
        noDeckMutation: true,
        paths: {
            contract: contractPath,
            evidence: evidencePath,
            sourceInputs: sourceInputsPath,
        },
        selectedSource,
        counts: {
            totalWorklistRows: report.reviewWorklist?.length || 0,
            candidateRows: candidateRows.length,
            returnedRows: rows.length,
            priorityCounts: summarizePriorityCounts(candidateRows),
        },
        instructions: [
            "Use this packet only to choose the next governed source-review surface.",
            "Do not mark a row reviewed unless exact source-level assignment proof exists.",
            "Keep unresolved rows pending, or use source_access_gap only after permitted source material was checked and exact proof is unavailable.",
            "This packet does not import evidence, move kanji, move words, update decks, or change readiness.",
        ],
        rows,
    };
}

function formatJlptKanjiSourceReviewPacket(packet = {}) {
    const source = packet.selectedSource?.sourceId || "all source lanes";
    const rows = packet.rows || [];
    const lines = [
        "JLPT Kanji Source Review Packet",
        "",
        `Source: ${source}`,
        `Rows returned: ${packet.counts?.returnedRows || 0}`,
        `Candidate rows after filters: ${packet.counts?.candidateRows || 0}`,
        `Total worklist rows: ${packet.counts?.totalWorklistRows || 0}`,
        `Priority summary: ${formatWorklistPrioritySummary(rows.map((row) => ({ reviewPriority: row.priority })))}`,
        "",
        "This command is read-only. It does not import evidence, move kanji, move words, update decks, or change readiness.",
    ];

    for (const row of rows) {
        lines.push(
            `- ${row.kanji}: ${row.priority}; current ${row.currentLevel || "none"}; `
            + `review ${row.reviewLevels.join(", ") || "none"}; consensus ${row.consensusLevel || "none"}; `
            + `confidence ${row.confidence}`
        );
    }

    return `${lines.join("\n")}\n`;
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const sourceInputsPath = options.sourceInputs
        ? path.resolve(process.cwd(), options.sourceInputs)
        : null;
    const { evidence, report } = buildSourceLevelDeltaReportFromPaths({
        contractPath,
        evidencePath,
        sourceInputsPath,
        limit: options.limit || 25,
    });

    return buildJlptKanjiSourceReviewPacket({
        contractPath,
        evidencePath,
        sourceInputsPath,
        sourceId: options.source || null,
        report,
        evidence,
        limit: options.limit || 25,
    });
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:packet:jlpt:source-review", options.unknownArgs);
    const packet = run(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatJlptKanjiSourceReviewPacket(packet));
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    PACKET_SCHEMA,
    buildJlptKanjiSourceReviewPacket,
    compactWorklistRow,
    formatJlptKanjiSourceReviewPacket,
    hasSelectedSourceResolution,
    hasSupportedReviewLevel,
    main,
    parseArgs,
    run,
    summarizePriorityCounts,
};
