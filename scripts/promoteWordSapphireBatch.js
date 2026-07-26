const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { buildWordRowsForLevel } = require("../src/services/wordGeneratedRowsService");
const {
    promoteSapphireWordBatch,
} = require("../src/services/sapphireWordPromotionService");
const {
    readFileState,
    runGovernedFileTransactionSync,
} = require("../src/utils/governedFileTransaction");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv) {
    const options = {
        input: "",
        level: null,
        replaceExisting: false,
        unknownArgs: [],
        write: false,
    };

    for (const arg of argv) {
        if (arg === "--write") {
            options.write = true;
        } else if (arg === "--replace-existing") {
            options.replaceExisting = true;
        } else if (arg.startsWith("--input=")) {
            options.input = parseStringOption(arg, "input");
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:sapphire:promote", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Word Sapphire promotion level must be 1-5.");
    }
    if (!options.input) {
        throw new Error("Word Sapphire promotion requires --input=<reviewed-candidate-json>.");
    }

    const config = loadConfig();
    const inputPath = path.resolve(process.cwd(), options.input);
    const targetPath = path.join(process.cwd(), "templates", `sapphire_n${options.level}_word_review_set.json`);
    const goldenPath = path.join(process.cwd(), "templates", `golden_n${options.level}_word_review_set.json`);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing word Sapphire candidate input at ${inputPath}`);
    }
    if (!fs.existsSync(targetPath)) {
        throw new Error(`Missing word Sapphire review set at ${targetPath}`);
    }
    if (!fs.existsSync(goldenPath)) {
        throw new Error(`Missing prior Gold word review set at ${goldenPath}`);
    }

    const targetBeforeState = readFileState(targetPath);
    const existingEntries = readJson(targetPath);
    const goldenExpectations = readJson(goldenPath);
    const candidatePayload = readJson(inputPath);
    const candidateEntries = Array.isArray(candidatePayload)
        ? candidatePayload
        : candidatePayload.entries;
    if (!Array.isArray(candidateEntries)) {
        throw new Error("Word Sapphire candidate input must be an array or an object with an entries array.");
    }

    const rows = await buildWordRowsForLevel({ level: options.level, config });
    const result = promoteSapphireWordBatch({
        existingEntries,
        candidateEntries,
        rows,
        goldenExpectations,
        replaceExisting: options.replaceExisting,
    });

    if (options.write) {
        runGovernedFileTransactionSync({
            changes: [{
                filePath: targetPath,
                expectedBeforeSha256: targetBeforeState.sha256,
                data: `${JSON.stringify(result.entries, null, 2)}\n`,
            }],
            lockPath: path.join(process.cwd(), "out", "file-transactions", `word-sapphire-n${options.level}.lock`),
            transactionName: `word-sapphire-n${options.level}`,
            transactionRoot: path.join(process.cwd(), "out", "file-transactions"),
            workspaceRoot: process.cwd(),
        });
    }

    console.log(JSON.stringify({
        level: options.level,
        inputPath: path.relative(process.cwd(), inputPath),
        targetPath: path.relative(process.cwd(), targetPath),
        write: options.write,
        replaceExisting: options.replaceExisting,
        summary: result.summary,
        validation: {
            passed: result.report.passed,
            failedEntries: result.report.failedCount,
            currentStandardSapphireCount: result.report.currentStandardSapphireCount,
        },
        authority: "Reviewed-input word Sapphire merger only; does not create Platinum certification, Obsidian proof, release readiness, or source truth from the batch report.",
    }, null, 2));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
