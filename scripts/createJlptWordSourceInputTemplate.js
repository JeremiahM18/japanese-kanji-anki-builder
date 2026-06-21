const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordSourceInputs } = require("../src/datasets/jlptWordSourceInputs");
const { formatRowsAsTsv } = require("../src/services/jlptWordSourceBatchService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_word_source_inputs.json";

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        source: "",
        limit: 10,
        out: "",
        json: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--config=")) {
            options.config = parseStringOption(arg, "config");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out");
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }
    const config = loadJlptWordSourceInputs(path.resolve(process.cwd(), options.config || DEFAULT_CONFIG));
    const sourceConfig = config.inputs?.[options.source];
    const resolvedSourceConfig = sourceConfig || {
        writtenColumn: "written",
        readingColumn: "reading",
        levelColumn: "jlpt",
        reviewStatusColumn: "reviewStatus",
        citationColumn: "citation",
        evidenceRefColumn: "evidenceRef",
        notesColumn: "notes",
    };
    const headers = [
        resolvedSourceConfig.writtenColumn || "written",
        resolvedSourceConfig.readingColumn || "reading",
        resolvedSourceConfig.levelColumn || "jlpt",
        resolvedSourceConfig.reviewStatusColumn || "reviewStatus",
        resolvedSourceConfig.citationColumn || "citation",
        resolvedSourceConfig.evidenceRefColumn || "evidenceRef",
        resolvedSourceConfig.notesColumn || "notes",
    ];
    const rows = Array.from({ length: Math.max(1, options.limit || 10) }, () => Object.fromEntries(headers.map((header) => [header, ""])));
    const outPath = path.resolve(process.cwd(), options.out || path.join("downloads", "word-source-review", `${options.source}-word-source-review.tsv`));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, formatRowsAsTsv({ headers, rows }), "utf8");
    return {
        valid: true,
        outPath,
        sourceId: options.source,
        rows: rows.length,
        noDeckMutation: true,
    };
}

function formatReport(result = {}) {
    return [
        "JLPT Word Source Input Template",
        "",
        `Output: ${result.outPath}`,
        `Source: ${result.sourceId}`,
        `Rows: ${result.rows}`,
        "No deck mutation: yes",
        "",
        "This creates an ignored manual-review worksheet only. Empty rows are not evidence.",
        "",
    ].join("\n");
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:template:jlpt:word-source-input", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatReport(result));
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    formatReport,
    main,
    parseArgs,
    run,
};
