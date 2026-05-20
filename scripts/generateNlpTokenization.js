const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    formatNlpTokenizationGenerationSummary,
    writeNlpWordTokenizationArtifact,
} = require("../src/services/nlpTokenizationGenerationService");

function buildDefaultWordTsvPath(level) {
    return path.join(process.cwd(), "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
}

function buildDefaultOutPath(level) {
    return path.join(process.cwd(), "out", "nlp-tokenization", `word-n${level}-kuromoji.json`);
}

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        limit: null,
        wordTsvPath: null,
        outPath: null,
        manifestPath: null,
        runtimeId: "kuromoji-js",
        workspaceRoot: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--word-tsv=")) {
            options.wordTsvPath = parseStringOption(arg, "word-tsv").trim();
        } else if (arg.startsWith("--out=")) {
            options.outPath = parseStringOption(arg, "out").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--runtime-id=")) {
            options.runtimeId = parseStringOption(arg, "runtime-id").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        collectUnknownArg(options, "--level must be an integer from 1 to 5");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:tokenization:generate", options.unknownArgs);

    const result = await writeNlpWordTokenizationArtifact({
        wordTsvPath: options.wordTsvPath || buildDefaultWordTsvPath(options.level),
        outPath: options.outPath || buildDefaultOutPath(options.level),
        manifestPath: options.manifestPath || undefined,
        workspaceRoot: options.workspaceRoot || process.cwd(),
        level: options.level,
        runtimeId: options.runtimeId,
        limit: Number.isFinite(options.limit) ? options.limit : null,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpTokenizationGenerationSummary(result));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildDefaultOutPath,
    buildDefaultWordTsvPath,
    main,
    parseArgs,
};
