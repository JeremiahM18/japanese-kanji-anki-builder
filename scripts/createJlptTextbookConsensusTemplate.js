const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    buildJlptTextbookConsensusTemplateRows,
    formatJlptTextbookConsensusTemplateTsv,
} = require("../src/services/jlptTextbookConsensusTemplateService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";
const DEFAULT_SOURCE = "shin_kanzen_master_kanji";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        config: DEFAULT_CONFIG,
        source: DEFAULT_SOURCE,
        out: null,
        level: null,
        limit: null,
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
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        } else if (arg.startsWith("--level=")) {
            options.level = arg.slice("--level=".length);
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatTemplateReport({ outPath, contractPath, sourceId, rows, level } = {}) {
    return [
        "JLPT Japanese Textbook Source Template",
        "",
        `Source: ${sourceId || "unknown"}`,
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        `Level filter: ${level || "all"}`,
        `Rows written: ${rows.length}`,
        "",
        "This command creates an ignored manual-review worksheet only. It does not import evidence, move kanji, move words, update decks, or change readiness.",
        "Fill only permitted, manually reviewed level judgments for the selected Japanese-published source lane, then pin the source-input integrity before import.",
    ].join("\n");
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const sourceId = options.source || DEFAULT_SOURCE;
    const sourceInputs = loadJlptKanjiSourceInputs(configPath);
    const sourceInput = sourceInputs.inputs?.[sourceId];
    if (!sourceInput) {
        throw new Error(`Unknown JLPT kanji textbook source input: ${sourceId}`);
    }
    const outPath = path.resolve(process.cwd(), options.out || sourceInput.sourcePath);
    const contract = loadJlptLevelContract(contractPath);
    const rows = buildJlptTextbookConsensusTemplateRows({
        contract,
        level: options.level,
        limit: options.limit,
    });
    const tsv = formatJlptTextbookConsensusTemplateTsv(rows);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, tsv, "utf8");

    return {
        outPath,
        contractPath,
        configPath,
        sourceId,
        level: options.level,
        rows,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:template:jlpt:textbook-source", options.unknownArgs);
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
    DEFAULT_SOURCE,
    formatTemplateReport,
    main,
    parseArgs,
    run,
};
