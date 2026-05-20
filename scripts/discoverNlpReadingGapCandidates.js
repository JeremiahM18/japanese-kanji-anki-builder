const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const {
    buildWordReadingCoverageReport,
    buildWordReadingGapTriage,
    parseKanjiTsv,
} = require("../src/services/wordReadingCoverageService");
const { buildCoverageWordRows } = require("../src/services/wordDeckCoverageScopeService");
const { buildWordReadingGapPlan } = require("../src/services/wordReadingGapPlanService");
const {
    formatNlpReadingGapCandidateSummary,
    writeNlpReadingGapCandidateArtifact,
} = require("../src/services/nlpReadingGapCandidateDiscoveryService");
const {
    buildCandidateRows,
} = require("./reportWordReadingGapPlan");
const {
    loadCoverageWordTsvByLevel,
    resolveKanjiTsvPath,
    resolveWordTsvPath,
} = require("./reportWordReadingGapTriage");
const { loadConfig } = require("../src/config");

const DEFAULT_MODEL_ID = "paraphrase-multilingual-minilm-l12-v2-q8";

function buildDefaultOutPath(level, modelId) {
    return path.join(process.cwd(), "out", "nlp-suggestions", `word-n${level}-reading-gap-candidates-${modelId}.json`);
}

function parseArgs(argv) {
    const options = {
        json: false,
        includeDeferred: false,
        level: 5,
        limit: 50,
        suggestions: 3,
        minSuggestionScore: 50,
        quality: "weak",
        only: "all",
        minModelScore: 0,
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
        } else if (arg === "--include-deferred") {
            options.includeDeferred = true;
        } else if (arg === "--allow-remote-models") {
            options.allowRemoteModels = true;
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--max-items=")) {
            options.limit = parseNumericOption(arg, "max-items");
        } else if (arg.startsWith("--suggestions=")) {
            options.suggestions = parseNumericOption(arg, "suggestions");
        } else if (arg.startsWith("--min-suggestion-score=")) {
            options.minSuggestionScore = parseNumericOption(arg, "min-suggestion-score");
        } else if (arg.startsWith("--quality=")) {
            options.quality = parseStringOption(arg, "quality").trim();
        } else if (arg.startsWith("--only=")) {
            options.only = parseStringOption(arg, "only").trim();
        } else if (arg.startsWith("--min-model-score=")) {
            options.minModelScore = parseNumericOption(arg, "min-model-score");
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
    if (!Number.isInteger(options.limit) || options.limit < 1) {
        collectUnknownArg(options, "--limit must be a positive integer");
    }
    if (!Number.isInteger(options.suggestions) || options.suggestions < 0) {
        collectUnknownArg(options, "--suggestions must be a non-negative integer");
    }
    if (!Number.isInteger(options.minSuggestionScore)) {
        collectUnknownArg(options, "--min-suggestion-score must be an integer");
    }
    if (!["all", "contract-extensions"].includes(options.only)) {
        collectUnknownArg(options, "--only must be one of: all, contract-extensions");
    }
    if (!["weak", "review", "strong"].includes(options.quality)) {
        collectUnknownArg(options, "--quality must be one of: weak, review, strong");
    }
    if (!Number.isFinite(options.minModelScore) || options.minModelScore < 0 || options.minModelScore > 1) {
        collectUnknownArg(options, "--min-model-score must be a number from 0 to 1");
    }

    return options;
}

function sha256FileWithSize(filePath, workspaceRoot) {
    const bytes = fs.readFileSync(filePath);
    return {
        path: path.relative(workspaceRoot, filePath).replace(/\\/g, "/"),
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        byteSize: bytes.length,
    };
}

function collectExistingInputHashes(paths, workspaceRoot) {
    const seen = new Set();
    const hashes = [];
    for (const filePath of paths) {
        if (!filePath || seen.has(filePath) || !fs.existsSync(filePath)) {
            continue;
        }
        seen.add(filePath);
        hashes.push(sha256FileWithSize(filePath, workspaceRoot));
    }
    return hashes;
}

function buildReadingGapPlanForNlp({ options, config, workspaceRoot }) {
    const level = Number(options.level);
    const kanjiTsvPath = resolveKanjiTsvPath(config, level);
    const wordTsvPath = resolveWordTsvPath(level);

    if (!fs.existsSync(kanjiTsvPath)) {
        throw new Error(`Missing kanji TSV export at ${kanjiTsvPath}. Run npm run deck:ready -- --levels=${level} first.`);
    }
    if (!fs.existsSync(wordTsvPath)) {
        throw new Error(`Missing word TSV export at ${wordTsvPath}. Run npm run deck:words:ready -- --levels=${level} first.`);
    }

    const coverageScope = buildCoverageWordRows({
        level,
        wordTsvByLevel: loadCoverageWordTsvByLevel(level),
    });
    const coverageReport = buildWordReadingCoverageReport({
        kanjiRows: parseKanjiTsv(fs.readFileSync(kanjiTsvPath, "utf8")),
        wordRows: coverageScope.wordRows,
        levelLabel: `N${level}`,
    });
    const triage = buildWordReadingGapTriage(coverageReport);
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const wordStudyEntries = loadWordStudyData({
        localPath: config.wordStudyDataPath,
    });
    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const candidateRows = options.suggestions > 0
        ? buildCandidateRows({
            cacheDir: config.cacheDir,
            sentenceCorpus,
            triage,
            wordStudyEntries,
        })
        : [];
    const gapPlan = buildWordReadingGapPlan(triage, {
        candidateRows,
        coverageSummary: coverageReport.summary,
        includeDeferred: options.includeDeferred,
        jlptOnlyJson,
        limit: options.limit,
        minSuggestionScore: options.minSuggestionScore,
        minSuggestionQuality: options.quality,
        maxSuggestionsPerItem: options.suggestions,
        only: options.only,
        sentenceCorpus,
        targetLevel: level,
        wordStudyEntries,
    });
    const inputHashes = collectExistingInputHashes([
        kanjiTsvPath,
        wordTsvPath,
        config.sentenceCorpusPath,
        config.wordStudyDataPath,
        config.jlptJsonPath,
        path.join(workspaceRoot, "templates", "word_reading_gap_triage_overrides.json"),
    ], workspaceRoot);

    return {
        gapPlan,
        inputHashes,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:reading-gaps:discover", options.unknownArgs);

    const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
    const config = loadConfig();
    const { gapPlan, inputHashes } = buildReadingGapPlanForNlp({
        options,
        config,
        workspaceRoot,
    });
    const result = await writeNlpReadingGapCandidateArtifact({
        gapPlan,
        inputHashes,
        outPath: options.outPath || buildDefaultOutPath(options.level, options.modelId),
        manifestPath: options.manifestPath || undefined,
        workspaceRoot,
        level: options.level,
        modelId: options.modelId,
        limit: options.limit,
        maxCandidatesPerGap: options.suggestions,
        minModelScore: options.minModelScore,
        cacheDir: options.cacheDir || undefined,
        allowRemoteModels: options.allowRemoteModels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpReadingGapCandidateSummary(result));
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
    buildReadingGapPlanForNlp,
    collectExistingInputHashes,
    main,
    parseArgs,
};
