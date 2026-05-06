const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    buildJlptKanjiSourceInputTemplateRows,
    formatJlptKanjiSourceInputTemplateTsv,
    normalizePriorityMode,
} = require("../src/services/jlptKanjiSourceInputTemplateService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";
const DEFAULT_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";
const DEFAULT_SOURCE = "shin_kanzen_master_kanji";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        config: DEFAULT_CONFIG,
        evidence: DEFAULT_EVIDENCE,
        source: DEFAULT_SOURCE,
        out: null,
        level: null,
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

function formatTemplateReport({ outPath, contractPath, evidencePath, sourceId, rows, level, priority } = {}) {
    return [
        "JLPT Kanji Source Input Template",
        "",
        `Source: ${sourceId || "unknown"}`,
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        `Evidence: ${evidencePath || "not used"}`,
        `Level filter: ${level || "all"}`,
        `Priority mode: ${priority || "contract"}`,
        `Priority summary: ${formatPrioritySummary(rows)}`,
        `Rows written: ${rows.length}`,
        "",
        "This command creates an ignored manual-review worksheet only. It does not import evidence, move kanji, move words, update decks, or change readiness.",
        "Fill only permitted, manually reviewed level judgments for the selected source lane, then pin the source-input integrity before import.",
    ].join("\n");
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const sourceId = options.source || DEFAULT_SOURCE;
    const priority = normalizePriorityMode(options.priority || "contract");
    const sourceInputs = loadJlptKanjiSourceInputs(configPath);
    const sourceInput = sourceInputs.inputs?.[sourceId];
    if (!sourceInput) {
        throw new Error(`Unknown JLPT kanji source input: ${sourceId}`);
    }
    const outPath = path.resolve(process.cwd(), options.out || sourceInput.sourcePath);
    const contract = loadJlptLevelContract(contractPath);
    const evidence = priority === "source-gaps"
        ? loadJlptKanjiSourceEvidence(evidencePath)
        : null;
    const rows = buildJlptKanjiSourceInputTemplateRows({
        contract,
        evidence,
        level: options.level,
        limit: options.limit,
        priority,
    });
    const tsv = formatJlptKanjiSourceInputTemplateTsv(rows);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, tsv, "utf8");

    return {
        outPath,
        contractPath,
        configPath,
        evidencePath: priority === "source-gaps" ? evidencePath : null,
        sourceId,
        level: options.level,
        priority,
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
    formatPrioritySummary,
    main,
    parseArgs,
    run,
    summarizePriorities,
};
