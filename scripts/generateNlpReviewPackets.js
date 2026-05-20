const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildDefaultNlpReviewPacketMarkdownPath,
    buildDefaultNlpReviewPacketPath,
    formatNlpReviewPacketSummary,
    writeNlpReviewPacketArtifact,
} = require("../src/services/nlpReviewPacketService");

function parseArgs(argv) {
    const options = {
        json: false,
        deckKind: "word",
        level: 5,
        limit: null,
        outPath: null,
        markdownOutPath: null,
        suggestionArtifactDir: null,
        suggestionArtifactPath: null,
        tokenizationArtifactDir: null,
        tokenizationArtifactPath: null,
        manifestPath: null,
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
        } else if (arg.startsWith("--out=")) {
            options.outPath = parseStringOption(arg, "out").trim();
        } else if (arg.startsWith("--markdown-out=")) {
            options.markdownOutPath = parseStringOption(arg, "markdown-out").trim();
        } else if (arg.startsWith("--suggestions-dir=")) {
            options.suggestionArtifactDir = parseStringOption(arg, "suggestions-dir").trim();
        } else if (arg.startsWith("--suggestion-path=")) {
            options.suggestionArtifactPath = parseStringOption(arg, "suggestion-path").trim();
        } else if (arg.startsWith("--tokenization-dir=")) {
            options.tokenizationArtifactDir = parseStringOption(arg, "tokenization-dir").trim();
        } else if (arg.startsWith("--tokenization-path=")) {
            options.tokenizationArtifactPath = parseStringOption(arg, "tokenization-path").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (!["kanji", "word", "all"].includes(options.deckKind)) {
        collectUnknownArg(options, "--deck must be one of: kanji, word, all");
    }
    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        collectUnknownArg(options, "--level must be an integer from 1 to 5");
    }
    if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
        collectUnknownArg(options, "--limit must be a positive integer");
    }
    if (options.suggestionArtifactDir && options.suggestionArtifactPath) {
        collectUnknownArg(options, "use only one of --suggestions-dir or --suggestion-path");
    }
    if (options.tokenizationArtifactDir && options.tokenizationArtifactPath) {
        collectUnknownArg(options, "use only one of --tokenization-dir or --tokenization-path");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:review-packets:generate", options.unknownArgs);

    const result = writeNlpReviewPacketArtifact({
        outPath: options.outPath || buildDefaultNlpReviewPacketPath({
            deckKind: options.deckKind === "all" ? "mixed" : options.deckKind,
            level: options.level,
        }),
        markdownOutPath: options.markdownOutPath || buildDefaultNlpReviewPacketMarkdownPath({
            deckKind: options.deckKind === "all" ? "mixed" : options.deckKind,
            level: options.level,
        }),
        suggestionArtifactDir: options.suggestionArtifactDir || undefined,
        suggestionArtifactPath: options.suggestionArtifactPath || undefined,
        tokenizationArtifactDir: options.tokenizationArtifactDir || undefined,
        tokenizationArtifactPath: options.tokenizationArtifactPath || undefined,
        manifestPath: options.manifestPath || undefined,
        workspaceRoot: options.workspaceRoot || process.cwd(),
        deckKind: options.deckKind,
        level: options.level,
        limit: Number.isFinite(options.limit) ? options.limit : null,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpReviewPacketSummary(result));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
