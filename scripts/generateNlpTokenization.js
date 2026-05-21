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
    writeNlpKanjiTokenizationArtifact,
    writeNlpWordTokenizationArtifact,
} = require("../src/services/nlpTokenizationGenerationService");

function buildDefaultKanjiTsvPath(level) {
    return path.join(process.cwd(), "out", "build", "exports", `jlpt-n${level}.tsv`);
}

function buildDefaultWordTsvPath(level) {
    return path.join(process.cwd(), "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
}

function buildDefaultOutPath(level, deckKind = "word") {
    return path.join(process.cwd(), "out", "nlp-tokenization", `${deckKind}-n${level}-kuromoji.json`);
}

function parseArgs(argv) {
    const options = {
        json: false,
        deckKind: "word",
        level: 5,
        limit: null,
        kanjiTsvPath: null,
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
        } else if (arg.startsWith("--deck=")) {
            options.deckKind = parseStringOption(arg, "deck").trim();
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--kanji-tsv=")) {
            options.kanjiTsvPath = parseStringOption(arg, "kanji-tsv").trim();
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
    if (!["kanji", "word"].includes(options.deckKind)) {
        collectUnknownArg(options, "--deck must be one of: kanji, word");
    }
    if (options.deckKind === "kanji" && options.wordTsvPath) {
        collectUnknownArg(options, "--word-tsv is only supported with --deck=word");
    }
    if (options.deckKind === "word" && options.kanjiTsvPath) {
        collectUnknownArg(options, "--kanji-tsv is only supported with --deck=kanji");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:tokenization:generate", options.unknownArgs);

    const writer = options.deckKind === "kanji"
        ? writeNlpKanjiTokenizationArtifact
        : writeNlpWordTokenizationArtifact;
    const result = await writer({
        kanjiTsvPath: options.deckKind === "kanji"
            ? options.kanjiTsvPath || buildDefaultKanjiTsvPath(options.level)
            : undefined,
        wordTsvPath: options.deckKind === "word"
            ? options.wordTsvPath || buildDefaultWordTsvPath(options.level)
            : undefined,
        outPath: options.outPath || buildDefaultOutPath(options.level, options.deckKind),
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
    buildDefaultKanjiTsvPath,
    buildDefaultOutPath,
    buildDefaultWordTsvPath,
    main,
    parseArgs,
};
