const path = require("node:path");

const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const {
    auditJlptWordSourceEvidence,
    buildSourceAccessReport,
    buildSourceAdequacyByLevel,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    buildExtraSourceAccessByLevel,
    buildWordCommonExpansionSelectorReport,
    formatWordCommonExpansionSelectorReport,
} = require("../src/services/wordCommonExpansionSelectorService");
const { normalizePlacementMode } = require("../src/services/wordCandidateAgreementService");
const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    buildDictionaryCommonPoolManifestSource,
    buildManifestSourceFromEvidence,
    buildSelectorManifestForSource,
    hasStrictFailure,
    loadSharedInputs,
    loadTriageDecisionsByLevelSource,
    normalizeSelectorSourceId,
    resolveManifestPath,
    sourceAllowsCandidateDiscovery,
    validateCommonPoolOptions,
    validateLevels,
} = require("../src/services/wordExpansionSelectorSupportService");
const { buildWordExpansionSignalReport } = require("../src/services/wordExpansionSignalService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");
const { summarizeReportShape } = require("../src/utils/reportSummary");

function parseArgs(argv) {
    const options = {
        json: false,
        summary: false,
        keysOnly: false,
        levels: [5, 4, 3, 2, 1],
        limit: 40,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        placementMode: process.env.JKB_WORD_PLACEMENT_MODE || "kanji-anchor",
        source: "",
        commonPoolLimit: DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
        commonPoolMode: "editorial",
        frequencySource: "",
        queueMode: "auto",
        sourceEvidence: "templates/jlpt_word_source_evidence.json",
        strict: false,
        triage: "templates/word_inventory_expansion_triage.json",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--summary") {
            options.summary = true;
        } else if (arg === "--keys-only") {
            options.keysOnly = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--manifest=")) {
            options.manifest = String(arg.slice("--manifest=".length) || "").trim();
        } else if (arg.startsWith("--placement-mode=")) {
            options.placementMode = String(arg.slice("--placement-mode=".length) || "").trim();
        } else if (arg.startsWith("--placement=")) {
            options.placementMode = String(arg.slice("--placement=".length) || "").trim();
        } else if (arg.startsWith("--source=")) {
            options.source = String(arg.slice("--source=".length) || "").trim();
        } else if (arg.startsWith("--candidate-source=")) {
            options.source = String(arg.slice("--candidate-source=".length) || "").trim();
        } else if (arg.startsWith("--common-pool-limit=")) {
            options.commonPoolLimit = parseNumericOption(arg, "common-pool-limit");
        } else if (arg.startsWith("--pool-limit=")) {
            options.commonPoolLimit = parseNumericOption(arg, "pool-limit");
        } else if (arg.startsWith("--common-pool-mode=")) {
            options.commonPoolMode = String(arg.slice("--common-pool-mode=".length) || "").trim();
        } else if (arg.startsWith("--pool-mode=")) {
            options.commonPoolMode = String(arg.slice("--pool-mode=".length) || "").trim();
        } else if (arg.startsWith("--queue=")) {
            options.queueMode = String(arg.slice("--queue=".length) || "").trim();
        } else if (arg.startsWith("--queue-mode=")) {
            options.queueMode = String(arg.slice("--queue-mode=".length) || "").trim();
        } else if (arg.startsWith("--frequency-source=")) {
            options.frequencySource = String(arg.slice("--frequency-source=".length) || "").trim();
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

function buildWordCommonExpansionSelectorSummary(report = {}) {
    return {
        levels: report.levels || [],
        routingSupportLevels: report.routingSupportLevels || [],
        configuredSourceOnly: report.configuredSourceOnly === true,
        placementMode: report.placementMode || "",
        summary: report.summary || {},
        blockerCount: (report.blockers || []).length,
        blockers: report.blockers || [],
        levelReports: (report.levelReports || []).map(summarizeSelectorLevelReport),
    };
}

function summarizeSelectorLevelReport(levelReport = {}) {
    const sourceUniverse = levelReport.sourceUniverse || {};
    return {
        level: levelReport.level,
        levelLabel: levelReport.levelLabel,
        rowCount: (levelReport.rows || []).length,
        shownRowCount: (levelReport.shownRows || []).length,
        selectedRows: levelReport.summary?.selectedRows || 0,
        sourceUniverse: {
            sourceLaneLabel: sourceUniverse.sourceLaneLabel,
            sourcePoolLabel: sourceUniverse.sourcePoolLabel,
            levelClaimStatus: sourceUniverse.levelClaimStatus,
            levelClaimLabel: sourceUniverse.levelClaimLabel,
            configuredSourceOnly: sourceUniverse.configuredSourceOnly === true,
            rawRowCount: sourceUniverse.rawRowCount || 0,
            commonPoolSummary: sourceUniverse.commonPoolSummary || null,
            warning: sourceUniverse.warning || "",
        },
        commonWordQueue: levelReport.commonWordQueue || null,
        fallbackSourceGate: levelReport.fallbackSourceGate || null,
        expansionWorkOrder: levelReport.expansionWorkOrder || null,
        routedMoveCandidateSummary: levelReport.routedMoveCandidateSummary || null,
        summary: levelReport.summary || {},
    };
}

function buildWordCommonExpansionSelectorKeysOnly(report = {}) {
    return summarizeReportShape(report, { maxDepth: 3 });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:common-expansion", options.unknownArgs);
    validateLevels(options.levels);
    validateCommonPoolOptions(options);

    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Common expansion selector limit must be a positive integer.");
    }

    const manifest = loadWordSourceManifest(resolveManifestPath(options.manifest));
    const expansionSignalReport = buildWordExpansionSignalReport({ levels: options.levels });
    const readingExpansionSignalsByLevel = Object.fromEntries(
        expansionSignalReport.signals.map((signal) => [signal.level, signal])
    );
    const sharedInputs = loadSharedInputs();
    const wordSourceEvidence = loadJlptWordSourceEvidence(path.resolve(process.cwd(), options.sourceEvidence));
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence,
        sourceId: options.source,
        levels: options.levels,
        commonPoolLimit: options.commonPoolLimit,
        commonPoolMode: options.commonPoolMode,
        frequencySource: options.frequencySource,
        queueMode: options.queueMode,
    });
    const wordSourceEvidenceReport = auditJlptWordSourceEvidence({
        contract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
        evidence: wordSourceEvidence,
        limit: Number.MAX_SAFE_INTEGER,
    });
    const sourceAccessReport = buildSourceAccessReport({
        evidence: wordSourceEvidence,
    });
    const report = buildWordCommonExpansionSelectorReport({
        levels: options.levels,
        manifest: selectorManifest,
        limit,
        placementMode: normalizePlacementMode(options.placementMode),
        triageDecisionsByLevelSource: loadTriageDecisionsByLevelSource(options.triage),
        readingExpansionSignalsByLevel,
        sourceAdequacyByLevel: buildSourceAdequacyByLevel(wordSourceEvidenceReport),
        extraSourceAccessByLevel: buildExtraSourceAccessByLevel({
            sourceAccessReport,
            manifest,
            levels: options.levels,
        }),
        enforceReadingExpansionGate: true,
        includeRoutingSupportLevels: !options.source,
        ...sharedInputs,
    });

    if (options.keysOnly) {
        process.stdout.write(`${JSON.stringify(buildWordCommonExpansionSelectorKeysOnly(report), null, 2)}\n`);
    } else if (options.summary || options.json) {
        process.stdout.write(`${JSON.stringify(options.summary ? buildWordCommonExpansionSelectorSummary(report) : report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordCommonExpansionSelectorReport(report));
    }

    if (options.strict && hasStrictFailure(report)) {
        throw new Error("Word common expansion selector strict mode failed.");
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_WORD_SOURCE_MANIFEST,
    buildWordCommonExpansionSelectorKeysOnly,
    buildWordCommonExpansionSelectorSummary,
    buildDictionaryCommonPoolManifestSource,
    buildManifestSourceFromEvidence,
    buildSelectorManifestForSource,
    hasStrictFailure,
    main,
    normalizeSelectorSourceId,
    parseArgs,
    resolveManifestPath,
    sourceAllowsCandidateDiscovery,
    validateCommonPoolOptions,
    validateLevels,
};
