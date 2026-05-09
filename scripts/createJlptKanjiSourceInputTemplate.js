const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const { parseSourceAssignmentRows } = require("../src/services/jlptKanjiSourceInputService");
const {
    buildJlptKanjiSourceInputTemplateRows,
    formatJlptKanjiSourceInputTemplateTsv,
    normalizePriorityMode,
} = require("../src/services/jlptKanjiSourceInputTemplateService");
const {
    LARGE_SOURCE_ACCESS_PACKET_BATCH_SIZE,
    requiresSourceAccessPacket,
    summarizeSourceAccessPacket,
    validateSourceAccessPacketFile,
} = require("../src/services/jlptKanjiSourceAccessPacketService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";
const DEFAULT_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";
const DEFAULT_SOURCE = "shin_kanzen_master_kanji";
const LARGE_SOURCE_REVIEW_WORKLIST_LIMIT = 10;

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        config: DEFAULT_CONFIG,
        evidence: DEFAULT_EVIDENCE,
        source: DEFAULT_SOURCE,
        out: null,
        level: null,
        sourceLevel: null,
        sourceAccessNote: "",
        sourceAccessPacket: "",
        limit: null,
        priority: "contract",
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
        } else if (arg.startsWith("--config=")) {
            options.config = arg.slice("--config=".length);
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = arg.slice("--evidence=".length);
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        } else if (arg.startsWith("--level=")) {
            options.level = arg.slice("--level=".length);
        } else if (arg.startsWith("--source-level=")) {
            options.sourceLevel = arg.slice("--source-level=".length);
        } else if (arg.startsWith("--source-access-note=")) {
            options.sourceAccessNote = arg.slice("--source-access-note=".length);
        } else if (arg.startsWith("--source-access-packet=")) {
            options.sourceAccessPacket = arg.slice("--source-access-packet=".length);
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--priority=")) {
            options.priority = normalizePriorityMode(arg.slice("--priority=".length));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function summarizePriorities(rows = []) {
    return rows.reduce((counts, row) => {
        const priority = row.reviewPriority || "unknown";
        counts[priority] = (counts[priority] || 0) + 1;
        return counts;
    }, {});
}

function formatPrioritySummary(rows = []) {
    const counts = summarizePriorities(rows);
    return Object.entries(counts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([priority, count]) => `${priority}: ${count}`)
        .join(", ") || "none";
}

function formatTemplateRows(rows = [], limit = 10) {
    const cappedRows = rows.slice(0, Math.max(1, limit || 10));
    if (cappedRows.length === 0) {
        return ["Rows: none"];
    }
    return [
        "Rows:",
        ...cappedRows.map((row) => (
            `- ${row.kanji}: current ${row.currentContractLevel || "none"}; `
            + `priority ${row.reviewPriority || "unknown"}; `
            + `${row.reviewReason || "No priority reason recorded."}`
        )),
    ];
}

function formatSupportedLevels(levels = []) {
    return (levels || [])
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= 5)
        .sort((a, b) => a - b)
        .map((level) => `N${level}`)
        .join(", ") || "all";
}

function formatSourceAccessNote(note) {
    const text = normalizeText(note);
    return text || "none";
}

function formatSourceAccessPacketLine(packetPath, packet = null) {
    if (!normalizeText(packetPath)) {
        return "none";
    }
    return packet ? `${packetPath} (${summarizeSourceAccessPacket(packet)})` : packetPath;
}

function formatTemplateReport({ outPath, contractPath, evidencePath, sourceId, rows, level, sourceLevel, sourceAccessNote = "", sourceAccessPacket = "", sourceAccessPacketData = null, priority, skippedExistingSourceRows = 0, supportedLevels = [] } = {}) {
    return [
        "JLPT Kanji Source Input Template",
        "",
        `Source: ${sourceId || "unknown"}`,
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath || "not used"}`,
        `Level filter: ${level || "all"}`,
        `Source level filter: ${sourceLevel || "none"}`,
        `Supported source levels: ${formatSupportedLevels(supportedLevels)}`,
        `Source access note: ${formatSourceAccessNote(sourceAccessNote)}`,
        `Source access packet: ${formatSourceAccessPacketLine(sourceAccessPacket, sourceAccessPacketData)}`,
        `Priority mode: ${priority || "contract"}`,
        `Priority summary: ${formatPrioritySummary(rows)}`,
        `Already resolved source rows skipped: ${skippedExistingSourceRows}`,
        `Rows written: ${rows.length}`,
        ...formatTemplateRows(rows),
        "",
        "This command creates an ignored manual-review worksheet only. It does not import evidence, move kanji, move words, update decks, or change readiness.",
        "Fill only permitted, manually reviewed level judgments for the selected source lane, then pin the source-input integrity before import.",
    ].join("\n");
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function assertSourceReviewWorklistAccessGate({ priority, limit, sourceAccessNote, sourceAccessPacket } = {}) {
    if (priority !== "source-review-worklist") {
        return;
    }
    if (requiresSourceAccessPacket(limit)) {
        if (normalizeText(sourceAccessPacket)) {
            return;
        }
        throw new Error(
            `source-review-worklist batches with no limit or at least ${LARGE_SOURCE_ACCESS_PACKET_BATCH_SIZE} rows require `
            + "--source-access-packet=<ignored-source-access-packet.json>."
        );
    }
    if (limit <= LARGE_SOURCE_REVIEW_WORKLIST_LIMIT) {
        return;
    }
    if (normalizeText(sourceAccessNote) || normalizeText(sourceAccessPacket)) {
        return;
    }
    throw new Error(
        `source-review-worklist batches over ${LARGE_SOURCE_REVIEW_WORKLIST_LIMIT} rows require `
        + "--source-access-note=<exact source surface reviewed>. Generate 10 rows, or name the exact source-access session before creating a larger batch."
    );
}

function buildSkippedSourceKanjiSet(sourceInput = {}) {
    const sourcePath = sourceInput.sourcePath
        ? path.resolve(process.cwd(), sourceInput.sourcePath)
        : null;
    if (!sourcePath || !fs.existsSync(sourcePath)) {
        return new Set();
    }

    const rows = parseSourceAssignmentRows(
        fs.readFileSync(sourcePath, "utf8"),
        sourceInput.format || "tsv"
    );
    const kanjiColumn = sourceInput.kanjiColumn || "kanji";
    const reviewStatusColumn = sourceInput.reviewStatusColumn || "reviewStatus";
    const defaultReviewStatus = sourceInput.defaultReviewStatus || "needs_review";
    const skippedStatuses = new Set(["reviewed", "blocked", "source_access_gap"]);

    return rows.reduce((skipped, row) => {
        const kanji = normalizeText(row[kanjiColumn]);
        const status = normalizeText(row[reviewStatusColumn]) || defaultReviewStatus;
        if (kanji && skippedStatuses.has(status)) {
            skipped.add(kanji);
        }
        return skipped;
    }, new Set());
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const sourceId = options.source || DEFAULT_SOURCE;
    const priority = normalizePriorityMode(options.priority || "contract");
    assertSourceReviewWorklistAccessGate({
        priority,
        limit: options.limit,
        sourceAccessNote: options.sourceAccessNote,
        sourceAccessPacket: options.sourceAccessPacket,
    });
    let sourceAccessPacketResult = null;
    if (normalizeText(options.sourceAccessPacket)) {
        sourceAccessPacketResult = validateSourceAccessPacketFile({
            packetPath: options.sourceAccessPacket,
            expectedSourceId: sourceId,
        });
        if (!sourceAccessPacketResult.valid) {
            throw new Error(`Invalid source-access packet: ${sourceAccessPacketResult.blockers.join("; ")}`);
        }
    }
    const sourceInputs = loadJlptKanjiSourceInputs(configPath);
    const sourceInput = sourceInputs.inputs?.[sourceId];
    if (!sourceInput) {
        throw new Error(`Unknown JLPT kanji source input: ${sourceId}`);
    }
    if (["source-level-deltas", "source-review-worklist"].includes(priority) && !options.out) {
        throw new Error(`${priority} priority requires --out=<batch.tsv> so it does not overwrite the configured full source worksheet.`);
    }
    const outPath = path.resolve(process.cwd(), options.out || sourceInput.sourcePath);
    const contract = loadJlptLevelContract(contractPath);
    const needsEvidence = priority === "source-gaps"
        || priority === "source-level-deltas"
        || priority === "source-review-worklist";
    const evidence = needsEvidence
        ? loadJlptKanjiSourceEvidence(evidencePath)
        : null;
    const skippedSourceKanji = options.out ? buildSkippedSourceKanjiSet(sourceInput) : new Set();
    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        level: options.level,
        limit: options.limit,
        priority,
        skippedSourceKanji,
        sourceLevel: options.sourceLevel,
        supportedLevels: sourceInput.supportedLevels || [],
    });
    const tsv = formatJlptKanjiSourceInputTemplateTsv(rows);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, tsv, "utf8");

    return {
        outPath,
        contractPath,
        configPath,
        evidencePath: needsEvidence ? evidencePath : null,
        sourceId,
        level: options.level,
        sourceLevel: options.sourceLevel,
        sourceAccessNote: normalizeText(options.sourceAccessNote),
        sourceAccessPacket: normalizeText(options.sourceAccessPacket),
        sourceAccessPacketData: sourceAccessPacketResult?.packet || null,
        supportedLevels: sourceInput.supportedLevels || [],
        priority,
        skippedExistingSourceRows: skippedSourceKanji.size,
        rows,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:template:jlpt:source-input", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatTemplateReport(result)}\n`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_CONFIG,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE,
    formatTemplateReport,
    formatTemplateRows,
    formatPrioritySummary,
    assertSourceReviewWorklistAccessGate,
    main,
    parseArgs,
    run,
    summarizePriorities,
};
