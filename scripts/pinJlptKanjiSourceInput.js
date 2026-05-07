const fs = require("node:fs");
const path = require("node:path");

const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    buildSourceFileIntegrity,
    parseSourceAssignmentRows,
} = require("../src/services/jlptKanjiSourceInputService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";

function formatLocalDate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        source: null,
        checkedAt: formatLocalDate(),
        reason: "",
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
        } else if (arg.startsWith("--checked-at=")) {
            options.checkedAt = arg.slice("--checked-at=".length);
        } else if (arg.startsWith("--reason=")) {
            options.reason = arg.slice("--reason=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function validateCheckedAt(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
        throw new Error(`Invalid --checked-at date: ${value || "missing"}`);
    }
}

function buildPinnedManifest({ manifest = {}, sourceId, integrity, checkedAt }) {
    return {
        ...manifest,
        inputs: {
            ...(manifest.inputs || {}),
            [sourceId]: {
                ...(manifest.inputs?.[sourceId] || {}),
                checkedAt,
                sha256: integrity.sha256,
                byteSize: integrity.byteSize,
                rowCount: integrity.rowCount,
            },
        },
    };
}

function hasIntegrityPinChanges(sourceConfig = {}, integrity = {}) {
    return String(sourceConfig.sha256 || "").toLowerCase() !== String(integrity.sha256 || "").toLowerCase()
        || sourceConfig.byteSize !== integrity.byteSize
        || sourceConfig.rowCount !== integrity.rowCount;
}

function formatManifestJson(manifest = {}) {
    return `${JSON.stringify(manifest, null, 2)}\n`;
}

function run(options = {}) {
    if (!options.source) {
        throw new Error("Missing required --source=<source-id>.");
    }
    validateCheckedAt(options.checkedAt);

    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const manifest = loadJlptKanjiSourceInputs(configPath);
    const sourceConfig = manifest.inputs?.[options.source];
    if (!sourceConfig) {
        return {
            valid: false,
            write: options.write === true,
            changed: false,
            sourceId: options.source,
            configPath,
            sourcePath: "",
            blockers: [`unknown source input: ${options.source}`],
        };
    }

    const sourcePath = path.resolve(process.cwd(), sourceConfig.sourcePath);
    if (!fs.existsSync(sourcePath)) {
        return {
            valid: false,
            write: options.write === true,
            changed: false,
            sourceId: options.source,
            configPath,
            sourcePath,
            blockers: [`source file is missing: ${sourcePath}`],
        };
    }

    const sourceBuffer = fs.readFileSync(sourcePath);
    const sourceRows = parseSourceAssignmentRows(sourceBuffer.toString("utf8"), sourceConfig.format || "tsv");
    const integrity = buildSourceFileIntegrity({ sourceBuffer, sourceRows });
    const changed = hasIntegrityPinChanges(sourceConfig, integrity);
    const blockers = [];
    if (options.write && !String(options.reason || "").trim()) {
        blockers.push("write mode requires --reason=<why-this-source-input-is-being-repinned>");
    }
    if (options.write && !changed) {
        blockers.push("source input integrity pins already match; refusing to update checkedAt without source changes");
    }

    const nextManifest = changed
        ? buildPinnedManifest({
            manifest,
            sourceId: options.source,
            integrity,
            checkedAt: options.checkedAt,
        })
        : manifest;

    if (options.write && blockers.length === 0) {
        fs.writeFileSync(configPath, formatManifestJson(nextManifest), "utf8");
    }

    return {
        valid: blockers.length === 0,
        write: options.write === true,
        changed,
        sourceId: options.source,
        configPath,
        sourcePath,
        checkedAt: options.checkedAt,
        reason: options.reason,
        current: {
            checkedAt: sourceConfig.checkedAt,
            sha256: sourceConfig.sha256,
            byteSize: sourceConfig.byteSize,
            rowCount: sourceConfig.rowCount,
        },
        next: {
            checkedAt: changed ? options.checkedAt : sourceConfig.checkedAt,
            sha256: integrity.sha256,
            byteSize: integrity.byteSize,
            rowCount: integrity.rowCount,
        },
        blockers,
    };
}

function formatPinReport(result = {}) {
    const lines = [
        "JLPT Kanji Source Input Pin",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.write ? "write" : "dry-run"}`,
        `Result: ${result.valid ? "passing" : "blocked"}`,
        `Changed pins: ${result.changed ? "yes" : "no"}`,
        `Config: ${result.configPath || ""}`,
        `Source file: ${result.sourcePath || ""}`,
        `Reason: ${result.reason || ""}`,
        "",
        `Current sha256: ${result.current?.sha256 || ""}`,
        `Next sha256: ${result.next?.sha256 || ""}`,
        `Current byte size: ${result.current?.byteSize ?? ""}`,
        `Next byte size: ${result.next?.byteSize ?? ""}`,
        `Current row count: ${result.current?.rowCount ?? ""}`,
        `Next row count: ${result.next?.rowCount ?? ""}`,
        `Current checkedAt: ${result.current?.checkedAt || ""}`,
        `Next checkedAt: ${result.next?.checkedAt || ""}`,
        "",
        "This command only updates tracked source-input integrity pins. It does not import assignments, move kanji, move words, update decks, or change readiness.",
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
    assertNoUnknownArgs("data:pin:jlpt:source-input", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatPinReport(result)}\n`);
    }
    if (!result.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONFIG,
    buildPinnedManifest,
    formatLocalDate,
    formatManifestJson,
    formatPinReport,
    hasIntegrityPinChanges,
    main,
    parseArgs,
    run,
};
