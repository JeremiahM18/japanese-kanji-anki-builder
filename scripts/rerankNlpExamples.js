const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    formatNlpExampleRerankingSummary,
    writeNlpExampleRerankingArtifact,
} = require("../src/services/nlpExampleRerankingService");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";

function buildDefaultWordTsvPath(level) {
    return path.join(process.cwd(), "out", "word-build", "exports", `jlpt-n${level}-words.tsv`);
}

function buildDefaultSentenceCorpusPath() {
    return path.join(process.cwd(), "data", "sentence_corpus.json");
}

function buildDefaultEmbeddingArtifactPath(level, modelId) {
    return path.join(process.cwd(), "out", "nlp-embeddings", `word-n${level}-${modelId}.json`);
}

function buildDefaultOutPath(level, modelId) {
    return path.join(process.cwd(), "out", "nlp-suggestions", `word-n${level}-example-reranking-${modelId}.json`);
}

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        limit: null,
        minCandidates: 2,
        wordTsvPath: null,
        sentenceCorpusPath: null,
        embeddingArtifactPath: null,
        outPath: null,
        manifestPath: null,
        modelId: DEFAULT_MODEL_ID,
        workspaceRoot: null,
        cacheDir: null,
        allowRemoteModels: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--allow-remote-models") {
            options.allowRemoteModels = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--min-candidates=")) {
            options.minCandidates = parseNumericOption(arg, "min-candidates");
        } else if (arg.startsWith("--word-tsv=")) {
            options.wordTsvPath = parseStringOption(arg, "word-tsv").trim();
        } else if (arg.startsWith("--sentence-corpus=")) {
            options.sentenceCorpusPath = parseStringOption(arg, "sentence-corpus").trim();
        } else if (arg.startsWith("--embeddings=")) {
            options.embeddingArtifactPath = parseStringOption(arg, "embeddings").trim();
        } else if (arg.startsWith("--out=")) {
            options.outPath = parseStringOption(arg, "out").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else if (arg.startsWith("--model-id=")) {
            options.modelId = parseStringOption(arg, "model-id").trim();
        } else if (arg.startsWith("--workspace-root=")) {
            options.workspaceRoot = parseStringOption(arg, "workspace-root").trim();
        } else if (arg.startsWith("--cache-dir=")) {
            options.cacheDir = parseStringOption(arg, "cache-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        collectUnknownArg(options, "--level must be an integer from 1 to 5");
    }
    if (!Number.isInteger(options.minCandidates) || options.minCandidates < 1) {
        collectUnknownArg(options, "--min-candidates must be a positive integer");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:examples:rerank", options.unknownArgs);

    const result = await writeNlpExampleRerankingArtifact({
        wordTsvPath: options.wordTsvPath || buildDefaultWordTsvPath(options.level),
        sentenceCorpusPath: options.sentenceCorpusPath || buildDefaultSentenceCorpusPath(),
        embeddingArtifactPath: options.embeddingArtifactPath || buildDefaultEmbeddingArtifactPath(options.level, options.modelId),
        outPath: options.outPath || buildDefaultOutPath(options.level, options.modelId),
        manifestPath: options.manifestPath || undefined,
        workspaceRoot: options.workspaceRoot || process.cwd(),
        level: options.level,
        modelId: options.modelId,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        minCandidates: options.minCandidates,
        cacheDir: options.cacheDir || undefined,
        allowRemoteModels: options.allowRemoteModels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpExampleRerankingSummary(result));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildDefaultEmbeddingArtifactPath,
    buildDefaultOutPath,
    buildDefaultSentenceCorpusPath,
    buildDefaultWordTsvPath,
    main,
    parseArgs,
};
