const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordSourceInputs } = require("../src/datasets/jlptWordSourceInputs");
const { buildJlptWordSourceBatchMerge } = require("../src/services/jlptWordSourceBatchService");
const {
    requiresWordSourceAccessPacket,
    validateWordSourceAccessPacketFile,
} = require("../src/services/jlptWordSourceAccessPacketService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    openVerifiedRegularFileSync,
    resolveGovernedDirectChildPath,
} = require("../src/utils/fs");
const { runGovernedFileTransactionSync } = require("../src/utils/governedFileTransaction");

const DEFAULT_CONFIG = "templates/jlpt_word_source_inputs.json";

function resolveGovernedWordSourceInputPath({
    cwd = process.cwd(),
    sourcePath,
    evidenceMode = "placement",
} = {}) {
    const governedDirectory = evidenceMode === "support"
        ? path.join(cwd, "downloads", "word-source-support")
        : path.join(cwd, "downloads");
    return resolveGovernedDirectChildPath({
        baseDirectory: cwd,
        governedDirectory,
        declaredPath: sourcePath,
        extension: ".tsv",
        label: "JLPT word source worksheet path",
        rejectWindowsReservedName: true,
    });
}

function readGovernedWordSourceText({ sourcePath, evidenceMode = "placement", label }) {
    const filePath = resolveGovernedWordSourceInputPath({ sourcePath, evidenceMode });
    const pathStatsBeforeOpen = fs.lstatSync(filePath, { bigint: true });
    const fileHandle = openVerifiedRegularFileSync(filePath, { label });
    try {
        const descriptorStatsBeforeRead = fs.fstatSync(fileHandle, { bigint: true });
        if (descriptorStatsBeforeRead.dev !== pathStatsBeforeOpen.dev
            || descriptorStatsBeforeRead.ino !== pathStatsBeforeOpen.ino) {
            throw new Error(`${label} changed after its governed path was resolved: ${filePath}`);
        }
        resolveGovernedWordSourceInputPath({ sourcePath, evidenceMode });
        const text = fs.readFileSync(fileHandle, "utf8");
        const descriptorStatsAfterRead = fs.fstatSync(fileHandle, { bigint: true });
        if (descriptorStatsBeforeRead.dev !== descriptorStatsAfterRead.dev
            || descriptorStatsBeforeRead.ino !== descriptorStatsAfterRead.ino
            || descriptorStatsBeforeRead.size !== descriptorStatsAfterRead.size
            || descriptorStatsBeforeRead.mtimeNs !== descriptorStatsAfterRead.mtimeNs
            || descriptorStatsBeforeRead.ctimeNs !== descriptorStatsAfterRead.ctimeNs) {
            throw new Error(`${label} changed while it was being read: ${filePath}`);
        }
        return { filePath, text };
    } finally {
        fs.closeSync(fileHandle);
    }
}

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        source: "",
        batch: "",
        sourceAccessPacket: "",
        allowAdditions: false,
        allowReviewedDowngrades: false,
        reviewedDowngradeReason: "",
        write: false,
        json: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--dry-run") {
            options.write = false;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg === "--allow-additions") {
            options.allowAdditions = true;
        } else if (arg === "--allow-reviewed-downgrades") {
            options.allowReviewedDowngrades = true;
        } else if (arg.startsWith("--config=")) {
            options.config = parseStringOption(arg, "config");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--batch=")) {
            options.batch = parseStringOption(arg, "batch");
        } else if (arg.startsWith("--source-access-packet=")) {
            options.sourceAccessPacket = parseStringOption(arg, "source-access-packet");
        } else if (arg.startsWith("--reviewed-downgrade-reason=")) {
            options.reviewedDowngradeReason = parseStringOption(arg, "reviewed-downgrade-reason");
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
    if (!options.batch) {
        throw new Error("Missing required --batch=<ignored-batch.tsv>.");
    }
    const config = loadJlptWordSourceInputs(path.resolve(process.cwd(), options.config || DEFAULT_CONFIG));
    const sourceConfig = config.inputs?.[options.source];
    if (!sourceConfig) {
        throw new Error(`Unknown word source input: ${options.source}`);
    }
    const sourceRead = readGovernedWordSourceText({
        sourcePath: sourceConfig.sourcePath,
        evidenceMode: sourceConfig.evidenceMode || "placement",
        label: "JLPT word source worksheet",
    });
    const batchRead = readGovernedWordSourceText({
        sourcePath: options.batch,
        evidenceMode: sourceConfig.evidenceMode || "placement",
        label: "JLPT word source review batch",
    });
    const { filePath: sourcePath, text: sourceText } = sourceRead;
    const { filePath: batchPath, text: batchText } = batchRead;
    const sourceAccessValidation = requiresWordSourceAccessPacket(batchText.split(/\r?\n/).filter((line) => line.trim()).length - 1)
        ? validateWordSourceAccessPacketFile({
            packetPath: options.sourceAccessPacket,
            expectedSourceId: options.source,
            expectedEvidenceRole: sourceConfig.evidenceMode === "support" ? "support-only" : "jlpt-placement",
            expectedSupportClaims: sourceConfig.evidenceMode === "support"
                ? [sourceConfig.supportProfile === "jmdict-exact-identity" ? "dictionary-identity" : "commonness"]
                : [],
        })
        : { valid: true, blockers: [] };
    const merge = buildJlptWordSourceBatchMerge({
        allowAdditions: options.allowAdditions,
        allowReviewedDowngrades: options.allowReviewedDowngrades,
        reviewedDowngradeReason: options.reviewedDowngradeReason,
        sourceConfig,
        sourceText,
        batchText,
    });
    const blockers = [
        ...(sourceAccessValidation.valid ? [] : sourceAccessValidation.blockers),
        ...merge.blockers,
    ];
    const result = {
        valid: blockers.length === 0,
        blockers,
        warnings: merge.warnings || [],
        mode: options.write ? "write" : "dry-run",
        sourceId: options.source,
        sourcePath,
        batchPath,
        sourceAccessPacketRequired: sourceAccessValidation.valid !== true && options.sourceAccessPacket === "",
        merge,
        noDeckMutation: true,
    };
    if (result.valid && options.write) {
        runGovernedFileTransactionSync({
            transactionName: `jlpt-word-source-batch-${options.source}`,
            workspaceRoot: process.cwd(),
            prepareChanges: () => {
                const currentSource = readGovernedWordSourceText({
                    sourcePath: sourceConfig.sourcePath,
                    evidenceMode: sourceConfig.evidenceMode || "placement",
                    label: "JLPT word source worksheet",
                });
                if (currentSource.text !== sourceText) {
                    throw new Error(`JLPT word source worksheet changed concurrently before write: ${sourcePath}`);
                }
                return {
                    changes: [{ filePath: currentSource.filePath, data: merge.tsv }],
                };
            },
            validateAfterWrite: () => {
                const writtenSource = readGovernedWordSourceText({
                    sourcePath: sourceConfig.sourcePath,
                    evidenceMode: sourceConfig.evidenceMode || "placement",
                    label: "JLPT word source worksheet",
                });
                if (writtenSource.text !== merge.tsv) {
                    throw new Error(`Post-write JLPT word source worksheet reconciliation failed: ${sourcePath}`);
                }
            },
        });
    }
    return result;
}

function formatReport(result = {}) {
    const lines = [
        "JLPT Word Source Batch Merge",
        "",
        `Source: ${result.sourceId}`,
        `Mode: ${result.mode}`,
        `Result: ${result.valid ? "passing" : "blocked"}`,
        `Changed rows: ${result.merge?.changedRowCount || 0}`,
        `Reviewed rows in batch: ${result.merge?.reviewedRowCount || 0}`,
        `Pending rows in batch: ${result.merge?.pendingRowCount || 0}`,
        "No deck mutation: yes",
        "",
        "This only merges source-review worksheet rows into an ignored source input when --write is passed. It does not import evidence, add words, move words, or touch kanji lanes.",
    ];
    if (result.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of result.blockers) {
            lines.push(`- ${blocker}`);
        }
    }
    if (result.warnings?.length > 0) {
        lines.push("", "Warnings:");
        for (const warning of result.warnings) {
            lines.push(`- ${warning}`);
        }
    }
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:merge:jlpt:word-source-batch", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatReport(result));
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
    formatReport,
    main,
    parseArgs,
    readGovernedWordSourceText,
    resolveGovernedWordSourceInputPath,
    run,
};
