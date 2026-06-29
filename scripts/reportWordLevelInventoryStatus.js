const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const {
    buildWordLevelInventoryStatusReport,
    formatWordPreSilverInventoryStatusReport,
    formatWordLevelInventoryStatusReport,
} = require("../src/services/wordLevelInventoryStatusService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_WORD_SOURCE_MANIFEST = "templates/word_source_manifest.json";

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        commonPoolLimit: 200,
        frequencySource: "tubelex-ja-frequency",
        includeGovernedSelector: false,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        preSilverOnly: false,
        sourceEvidence: "templates/jlpt_word_source_evidence.json",
        triage: "templates/word_inventory_expansion_triage.json",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-governed-selector") {
            options.includeGovernedSelector = true;
        } else if (arg === "--pre-silver-only") {
            options.preSilverOnly = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
        } else if (arg.startsWith("--common-pool-limit=")) {
            options.commonPoolLimit = parseNumericOption(arg, "common-pool-limit");
        } else if (arg.startsWith("--frequency-source=")) {
            options.frequencySource = String(arg.slice("--frequency-source=".length) || "").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.manifest = String(arg.slice("--manifest=".length) || "").trim();
        } else if (arg.startsWith("--source-evidence=")) {
            options.sourceEvidence = String(arg.slice("--source-evidence=".length) || "").trim();
        } else if (arg.startsWith("--triage=")) {
            options.triage = String(arg.slice("--triage=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readJsonIfExists(filePath, fallback = []) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadTriageDecisionsByLevelSource(triagePath = "") {
    const normalizedPath = String(triagePath || "").trim();
    if (!normalizedPath) {
        return {};
    }
    const resolvedPath = path.resolve(process.cwd(), normalizedPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Word inventory expansion triage file does not exist: ${resolvedPath}`);
    }
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function readJsonlIfExists(filePath) {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    return fs.readFileSync(filePath, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function readReviewSetByLevel(levels, fileNameForLevel) {
    return Object.fromEntries(levels.map((level) => [
        level,
        readJsonIfExists(path.join(process.cwd(), "templates", fileNameForLevel(level)), []),
    ]));
}

function readProofEventsByLevel(levels) {
    return Object.fromEntries(levels.map((level) => [
        level,
        readJsonlIfExists(path.join(process.cwd(), "templates", "obsidian_proof_ledger", `word_n${level}.jsonl`)),
    ]));
}

async function buildGeneratedRowsByLevel(levels) {
    const contract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    return Object.fromEntries(levels.map((level) => [
        level,
        Object.values(contract.wordLevels || {})
            .filter((entry) => entry.jlpt === level)
            .map((entry) => ({
                word: entry.written,
                reading: entry.reading,
            })),
    ]));
}

function buildGovernedPreSilverByLevel({
    levels,
    manifestPath,
    sourceEvidencePath,
    triagePath,
    commonPoolLimit,
    frequencySource,
} = {}) {
    const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
    const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
    const {
        auditJlptWordSourceEvidence,
        buildSourceAccessReport,
        buildSourceAdequacyByLevel,
    } = require("../src/services/jlptWordSourceEvidenceService");
    const {
        DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        buildExtraSourceAccessByLevel,
        buildWordCommonExpansionSelectorReport,
    } = require("../src/services/wordCommonExpansionSelectorService");
    const {
        buildSelectorManifestForSource,
    } = require("./reportWordCommonExpansionSelector");
    const {
        loadSharedInputs,
        resolveManifestPath,
    } = require("./reportWordCandidateAgreement");
    const { buildWordExpansionSignalReport } = require("./reportWordExpansionSignals");

    const sharedInputs = loadSharedInputs();
    const manifest = loadWordSourceManifest(resolveManifestPath(manifestPath));
    const wordSourceEvidence = loadJlptWordSourceEvidence(path.resolve(process.cwd(), sourceEvidencePath));
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence,
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels,
        commonPoolLimit,
        commonPoolMode: "editorial",
        frequencySource,
        queueMode: "silver",
    });
    const expansionSignalReport = buildWordExpansionSignalReport({ levels });
    const readingExpansionSignalsByLevel = Object.fromEntries(
        expansionSignalReport.signals.map((signal) => [signal.level, signal])
    );
    const wordSourceEvidenceReport = auditJlptWordSourceEvidence({
        contract: sharedInputs.jlptWordLevelContract,
        evidence: wordSourceEvidence,
        limit: Number.MAX_SAFE_INTEGER,
    });
    const sourceAccessReport = buildSourceAccessReport({
        evidence: wordSourceEvidence,
    });
    const selectorReport = buildWordCommonExpansionSelectorReport({
        levels,
        manifest: selectorManifest,
        limit: commonPoolLimit,
        placementMode: "vocabulary-level",
        triageDecisionsByLevelSource: loadTriageDecisionsByLevelSource(triagePath),
        readingExpansionSignalsByLevel,
        sourceAdequacyByLevel: buildSourceAdequacyByLevel(wordSourceEvidenceReport),
        extraSourceAccessByLevel: buildExtraSourceAccessByLevel({
            sourceAccessReport,
            manifest,
            levels,
        }),
        enforceReadingExpansionGate: true,
        includeRoutingSupportLevels: false,
        ...sharedInputs,
    });

    return Object.fromEntries((selectorReport.levelReports || []).map((levelReport) => {
        const commonPool = levelReport.sourceUniverse?.commonPoolSummary || {};
        return [levelReport.level, {
            available: true,
            source: "dictionary-common-pool",
            eligibleKeepBeforeCap: commonPool.queueModeIncludedRowsBeforeLimit || 0,
            activeWindowRows: commonPool.editorialQueueRows || 0,
            readyRows: levelReport.summary?.readyForEditorialReviewRows || 0,
            blockedRows: levelReport.summary?.blockedRows || 0,
            cappedRows: commonPool.deprioritizedByEditorialQueueLimit || 0,
            reviewableRowsBeforeFilter: commonPool.reviewableRowsBeforeEditorialFilter || 0,
            auditOnlyRowsBeforeFilter: commonPool.auditOnlyRowsBeforeEditorialFilter || 0,
        }];
    }));
}

async function main({ commandName = "deck:words:inventory-status" } = {}) {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs(commandName, options.unknownArgs);

    const levels = options.levels.filter((level) => Number.isInteger(level) && level >= 1 && level <= 5);
    if (levels.length !== options.levels.length) {
        throw new Error("Word inventory status levels must be 1-5.");
    }

    const generatedRowsByLevel = await buildGeneratedRowsByLevel(levels);
    const report = buildWordLevelInventoryStatusReport({
        levels,
        generatedRowsByLevel,
        goldReviewSetsByLevel: options.preSilverOnly
            ? {}
            : readReviewSetByLevel(levels, (level) => `golden_n${level}_word_review_set.json`),
        sapphireReviewSetsByLevel: options.preSilverOnly
            ? {}
            : readReviewSetByLevel(levels, (level) => `sapphire_n${level}_word_review_set.json`),
        platinumReviewSetsByLevel: options.preSilverOnly
            ? {}
            : readReviewSetByLevel(levels, (level) => `platinum_n${level}_word_review_set.json`),
        proofEventsByLevel: options.preSilverOnly ? {} : readProofEventsByLevel(levels),
        triageDecisionsByLevelSource: loadTriageDecisionsByLevelSource(options.triage),
        governedPreSilverByLevel: !options.preSilverOnly && options.includeGovernedSelector
            ? buildGovernedPreSilverByLevel({
                levels,
                manifestPath: options.manifest,
                sourceEvidencePath: options.sourceEvidence,
                triagePath: options.triage,
                commonPoolLimit: options.commonPoolLimit,
                frequencySource: options.frequencySource,
            })
            : {},
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(options.preSilverOnly
        ? formatWordPreSilverInventoryStatusReport(report)
        : formatWordLevelInventoryStatusReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildGeneratedRowsByLevel,
    buildGovernedPreSilverByLevel,
    main,
    parseArgs,
    readJsonIfExists,
    readJsonlIfExists,
    readProofEventsByLevel,
    readReviewSetByLevel,
};
