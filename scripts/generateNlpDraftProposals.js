const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildDefaultNlpDraftProposalMarkdownPath,
    buildDefaultNlpDraftProposalPath,
    formatNlpDraftProposalSummary,
    writeNlpDraftProposalArtifact,
} = require("../src/services/nlpDraftProposalService");

function parseArgs(argv) {
    const options = {
        json: false,
        includeTokenizationDrafts: true,
        deckKind: "word",
        level: 5,
        limit: null,
        outPath: null,
        markdownOutPath: null,
        suggestionArtifactDir: null,
        suggestionArtifactPath: null,
        reviewPacketArtifactDir: null,
        reviewPacketArtifactPath: null,
        manifestPath: null,
        workspaceRoot: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--no-tokenization-drafts") {
            options.includeTokenizationDrafts = false;
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
        } else if (arg.startsWith("--review-packets-dir=")) {
            options.reviewPacketArtifactDir = parseStringOption(arg, "review-packets-dir").trim();
        } else if (arg.startsWith("--review-packet-path=")) {
            options.reviewPacketArtifactPath = parseStringOption(arg, "review-packet-path").trim();
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
    if (options.reviewPacketArtifactDir && options.reviewPacketArtifactPath) {
        collectUnknownArg(options, "use only one of --review-packets-dir or --review-packet-path");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:drafts:generate", options.unknownArgs);

    const result = writeNlpDraftProposalArtifact({
        outPath: options.outPath || buildDefaultNlpDraftProposalPath({
            deckKind: options.deckKind === "all" ? "mixed" : options.deckKind,
            level: options.level,
        }),
        markdownOutPath: options.markdownOutPath || buildDefaultNlpDraftProposalMarkdownPath({
            deckKind: options.deckKind === "all" ? "mixed" : options.deckKind,
            level: options.level,
        }),
        suggestionArtifactDir: options.suggestionArtifactDir || undefined,
        suggestionArtifactPath: options.suggestionArtifactPath || undefined,
        reviewPacketArtifactDir: options.reviewPacketArtifactDir || undefined,
        reviewPacketArtifactPath: options.reviewPacketArtifactPath || undefined,
        manifestPath: options.manifestPath || undefined,
        workspaceRoot: options.workspaceRoot || process.cwd(),
        deckKind: options.deckKind,
        level: options.level,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        includeTokenizationDrafts: options.includeTokenizationDrafts,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpDraftProposalSummary(result));
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
