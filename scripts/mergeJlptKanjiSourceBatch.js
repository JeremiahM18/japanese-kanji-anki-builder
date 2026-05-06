const fs = require("node:fs");
const path = require("node:path");

const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const { buildJlptKanjiSourceBatchMerge } = require("../src/services/jlptKanjiSourceBatchService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        source: null,
        batch: null,
        write: false,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--config=")) {
            options.config = arg.slice("--config=".length);
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else if (arg.startsWith("--batch=")) {
            options.batch = arg.slice("--batch=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readRequiredText(filePath, label) {
    if (!fs.existsSync(filePath)) {
        return {
            text: "",
            blocker: `${label} file is missing: ${filePath}`,
        };
    }
    return {
        text: fs.readFileSync(filePath, "utf8"),
        blocker: null,
    };
}

function formatStatusCounts(statusCounts = {}) {
    const ordered = ["reviewed", "needs_review", "blocked", "source_access_gap"];
    const parts = ordered
        .filter((status) => statusCounts[status])
        .map((status) => `${status}: ${statusCounts[status]}`);
    const extra = Object.keys(statusCounts)
        .filter((status) => !ordered.includes(status))
        .sort()
        .map((status) => `${status}: ${statusCounts[status]}`);
    return [...parts, ...extra].join(", ") || "none";
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }
    if (!options.batch) {
        throw new Error("Missing required --batch=<path-to-batch-tsv>.");
    }

    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const manifest = loadJlptKanjiSourceInputs(configPath);
    const sourceConfig = manifest.inputs?.[options.source];
    if (!sourceConfig) {
        return {
            valid: false,
            write: options.write === true,
            noDeckMutation: manifest.policy?.noDeckMutation !== false,
            sourceId: options.source,
            configPath,
            sourcePath: "",
            batchPath: path.resolve(process.cwd(), options.batch),
            blockers: [`unknown source input: ${options.source}`],
            sourceRowCount: 0,
            batchRowCount: 0,
            changedRowCount: 0,
            reviewedRowCount: 0,
            pendingRowCount: 0,
            blockedRowCount: 0,
            sourceAccessGapRowCount: 0,
            statusCounts: {},
        };
    }

    const sourcePath = path.resolve(process.cwd(), sourceConfig.sourcePath);
    const batchPath = path.resolve(process.cwd(), options.batch);
    const sourceFile = readRequiredText(sourcePath, "source worksheet");
    const batchFile = readRequiredText(batchPath, "batch worksheet");
    const fileBlockers = [sourceFile.blocker, batchFile.blocker].filter(Boolean);

    if (fileBlockers.length > 0) {
        return {
            valid: false,
            write: options.write === true,
            noDeckMutation: manifest.policy?.noDeckMutation !== false,
            sourceId: options.source,
            configPath,
            sourcePath,
            batchPath,
            blockers: fileBlockers,
            sourceRowCount: 0,
            batchRowCount: 0,
            changedRowCount: 0,
            reviewedRowCount: 0,
            pendingRowCount: 0,
            blockedRowCount: 0,
            sourceAccessGapRowCount: 0,
            statusCounts: {},
        };
    }

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig,
        sourceText: sourceFile.text,
        batchText: batchFile.text,
    });

    if (options.write && result.valid) {
        fs.writeFileSync(sourcePath, result.tsv, "utf8");
    }

    return {
        ...result,
        write: options.write === true,
        noDeckMutation: manifest.policy?.noDeckMutation !== false,
        sourceId: options.source,
        configPath,
        sourcePath,
        batchPath,
        tsv: undefined,
    };
}

function formatBatchMergeReport(result = {}) {
    const lines = [
        "JLPT Kanji Source Evidence Batch Merge",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.write ? "write" : "dry-run"}`,
        `Result: ${result.valid ? "passing" : "blocked"}`,
        `Config: ${result.configPath || ""}`,
        `Source worksheet: ${result.sourcePath || ""}`,
        `Batch worksheet: ${result.batchPath || ""}`,
        `Source rows parsed: ${result.sourceRowCount || 0}`,
        `Batch rows parsed: ${result.batchRowCount || 0}`,
        `Changed source rows: ${result.changedRowCount || 0}`,
        `Batch statuses: ${formatStatusCounts(result.statusCounts)}`,
        `No deck mutation: ${result.noDeckMutation === false ? "no" : "yes"}`,
        "",
        "This command only merges local source-evidence worksheet decisions. It does not import assignments, move kanji, move words, update decks, or change readiness.",
    ];

    if (result.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of result.blockers) {
            lines.push(`- ${blocker}`);
        }
    }

    return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:merge:jlpt:source-batch", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatBatchMergeReport(result)}\n`);
    }
    if (!result.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    formatBatchMergeReport,
    formatStatusCounts,
    main,
    parseArgs,
    run,
};
