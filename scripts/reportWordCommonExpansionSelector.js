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
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    DICTIONARY_COMMON_POOL_SOURCE_ID,
    SOURCE_POOL_DICTIONARY_COMMON,
    SOURCE_POOL_DICTIONARY_COMMON_LABEL,
    buildExtraSourceAccessByLevel,
    buildWordCommonExpansionSelectorReport,
    formatWordCommonExpansionSelectorReport,
    normalizeCommonPoolQueueMode,
} = require("../src/services/wordCommonExpansionSelectorService");
const { normalizePlacementMode } = require("../src/services/wordCandidateAgreementService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");
const { summarizeReportShape } = require("../src/utils/reportSummary");
const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    loadSharedInputs,
    loadTriageDecisionsByLevelSource,
    resolveManifestPath,
} = require("./reportWordCandidateAgreement");
const { buildWordExpansionSignalReport } = require("./reportWordExpansionSignals");

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

function validateLevels(levels = []) {
    if (!Array.isArray(levels) || levels.length === 0) {
        throw new Error("Common expansion selector requires at least one level.");
    }
    for (const level of levels) {
        if (!Number.isInteger(level) || level < 1 || level > 5) {
            throw new Error("Common expansion selector levels must be 1-5.");
        }
    }
}

function validateCommonPoolOptions({ commonPoolMode = "editorial", commonPoolLimit = DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT, queueMode = "auto" } = {}) {
    if (!["editorial", "raw"].includes(commonPoolMode)) {
        throw new Error("Common expansion selector --common-pool-mode must be one of: editorial, raw.");
    }
    if (!Number.isInteger(commonPoolLimit) || commonPoolLimit < 1) {
        throw new Error("Common expansion selector --common-pool-limit must be a positive integer.");
    }
    normalizeCommonPoolQueueMode(queueMode);
}

function sourceAllowsCandidateDiscovery(source = {}) {
    return (source.allowedUse || []).includes("candidate-discovery");
}

function normalizeSelectorSourceId(sourceId = "") {
    const normalized = String(sourceId || "").trim();
    if ([
        DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        DICTIONARY_COMMON_POOL_SOURCE_ID,
        "jmdict-common-pool",
        "dictionary-common-pool",
    ].includes(normalized)) {
        return DICTIONARY_COMMON_POOL_SOURCE_ID;
    }
    return normalized;
}

function assertActiveApprovedManifestSource(sourceId, source = {}, requiredUse = "") {
    if (!source) {
        throw new Error(`Dictionary common pool requires ${sourceId} in the word source manifest.`);
    }
    if (source.status !== "active") {
        throw new Error(`Dictionary common pool requires ${sourceId} to be active.`);
    }
    if (source.licenseUse?.status !== "approved") {
        throw new Error(`Dictionary common pool requires approved source-use posture for ${sourceId}.`);
    }
    if (requiredUse && !(source.allowedUse || []).includes(requiredUse)) {
        throw new Error(`Dictionary common pool requires ${sourceId} allowedUse ${requiredUse}.`);
    }
}

function buildDictionaryCommonPoolManifestSource(manifest = {}, levels = [], {
    commonPoolLimit = DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    commonPoolMode = "editorial",
    frequencySource = "",
    queueMode = "auto",
} = {}) {
    const dictionarySource = manifest.sources?.jmdict || null;
    const commonnessSource = manifest.sources?.["jmdict-priority-commonness"] || null;
    assertActiveApprovedManifestSource("jmdict", dictionarySource, "dictionary-verification");
    assertActiveApprovedManifestSource("jmdict-priority-commonness", commonnessSource, "frequency-sanity");
    if (!dictionarySource.local?.path || !commonnessSource.local?.path) {
        throw new Error("Dictionary common pool requires pinned local JMdict dictionary/commonness paths.");
    }
    if (dictionarySource.local.path !== commonnessSource.local.path) {
        throw new Error("Dictionary common pool requires JMdict dictionary and priority sources to share the same pinned local TSV.");
    }

    return {
        name: "JMdict dictionary common pool",
        tier: 3,
        status: "active",
        sourceType: SOURCE_POOL_DICTIONARY_COMMON,
        origin: {
            url: dictionarySource.origin?.url || commonnessSource.origin?.url || "",
            localPath: dictionarySource.local.path,
            notes: "Virtual extra expansion pool synthesized from pinned JMdict exact identity rows with priority/commonness markers; no raw dictionary rows are tracked.",
        },
        licenseUse: {
            status: "approved",
            license: dictionarySource.licenseUse?.license || commonnessSource.licenseUse?.license || "CC BY-SA 4.0",
            notes: "Extra expansion discovery only. JMdict verifies exact written/reading/meaning identity and priority markers support commonness; neither proves JLPT level or approves cards.",
        },
        checkedAt: dictionarySource.checkedAt || commonnessSource.checkedAt || "",
        levels,
        local: {
            ...(dictionarySource.local || {}),
            columns: dictionarySource.local?.columns || [
                "written",
                "reading",
                "meaning",
                "frequencyRank",
                "source",
                "notes",
            ],
        },
        intendedUse: [
            "candidate-discovery",
            "dictionary-verification",
            "reading-verification",
            "meaning-verification",
            "frequency-sanity",
            "usefulness-support",
        ],
        allowedUse: [
            "candidate-discovery",
            "dictionary-verification",
            "reading-verification",
            "meaning-verification",
            "frequency-sanity",
            "usefulness-support",
        ],
        disallowedUse: [
            "card-approval",
            "level-truth",
            "pitch-verification",
        ],
        candidatePolicy: {
            levels,
            kanjiScope: "known-jlpt",
            requireSourceLevel: false,
        },
        extraSourceLane: true,
        extraSourcePool: SOURCE_POOL_DICTIONARY_COMMON,
        extraSourcePoolLabel: SOURCE_POOL_DICTIONARY_COMMON_LABEL,
        commonPool: {
            type: SOURCE_POOL_DICTIONARY_COMMON,
            requireCommonness: true,
            excludeKanaOnly: true,
            requireTargetKanji: true,
            qualityMode: commonPoolMode,
            queueMode,
            editorialQueueLimit: commonPoolLimit,
            frequencySourceIds: frequencySource ? [frequencySource] : [],
            outsideJlptSupportPolicy: "label_not_deprioritize",
        },
    };
}

function buildManifestSourceFromEvidence(sourceId, source = {}, levels = []) {
    if (!source.local?.path) {
        throw new Error(`Source ${sourceId} does not have a local source path.`);
    }
    return {
        name: source.name || sourceId,
        tier: 4,
        status: "active",
        sourceType: source.sourceType || source.sourceKind || "jlpt_level_list",
        origin: {
            url: source.url || "",
            localPath: source.local.path,
            notes: "Extra/free source-family selector preview; discovery and weak level hints only.",
        },
        licenseUse: {
            status: source.licenseStatus || "needs_review",
            license: source.licenseStatus === "approved" ? "CC BY" : "",
            notes: "Source is used only as candidate discovery and weak level-hint evidence, not card approval, dictionary evidence, meaning evidence, pitch evidence, or frequency evidence.",
        },
        checkedAt: source.checkedAt || "",
        levels: source.levels || levels,
        local: {
            ...(source.local || {}),
            columns: source.local?.columns || [
                "written",
                "reading",
                "meaning",
                "jlpt",
                "source",
                "reviewStatus",
                "citation",
                "evidenceRef",
                "notes",
            ],
        },
        intendedUse: source.allowedUse || ["candidate-discovery", "level-hint"],
        allowedUse: source.allowedUse || ["candidate-discovery", "level-hint"],
        disallowedUse: [
            "card-approval",
            "dictionary-verification",
            "reading-verification",
            "meaning-verification",
            "pitch-verification",
            "frequency-sanity",
        ],
        candidatePolicy: {
            levels: source.levels || levels,
            kanjiScope: "known-jlpt",
            requireSourceLevel: true,
        },
        extraSourceLane: true,
    };
}

function buildSelectorManifestForSource({
    manifest = {},
    wordSourceEvidence = {},
    sourceId = "",
    levels = [],
    commonPoolLimit = DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    commonPoolMode = "editorial",
    frequencySource = "",
    queueMode = "auto",
} = {}) {
    const normalizedSourceId = normalizeSelectorSourceId(sourceId);
    if (!normalizedSourceId) {
        return manifest;
    }

    const selectorManifest = JSON.parse(JSON.stringify(manifest || {}));
    selectorManifest.sources = selectorManifest.sources || {};
    const evidenceSource = wordSourceEvidence.sources?.[normalizedSourceId] || null;
    const existingSource = selectorManifest.sources[normalizedSourceId] || null;
    if (!existingSource && !evidenceSource) {
        if (normalizedSourceId !== DICTIONARY_COMMON_POOL_SOURCE_ID) {
            throw new Error(`Unknown word selector source: ${normalizedSourceId}`);
        }
    }

    for (const source of Object.values(selectorManifest.sources)) {
        if (source.status === "active" && sourceAllowsCandidateDiscovery(source)) {
            source.status = "inactive";
        }
    }

    const overrideSource = normalizedSourceId === DICTIONARY_COMMON_POOL_SOURCE_ID
        ? buildDictionaryCommonPoolManifestSource(selectorManifest, levels, { commonPoolLimit, commonPoolMode, frequencySource, queueMode })
        : (existingSource ? {
            ...existingSource,
            status: "active",
            candidatePolicy: {
                ...(existingSource.candidatePolicy || {}),
                levels: existingSource.candidatePolicy?.levels || existingSource.levels || levels,
                requireSourceLevel: existingSource.candidatePolicy?.requireSourceLevel ?? true,
            },
            extraSourceLane: true,
        } : buildManifestSourceFromEvidence(normalizedSourceId, evidenceSource, levels));
    selectorManifest.sources[normalizedSourceId] = overrideSource;
    return selectorManifest;
}

function hasStrictFailure(report = {}) {
    return (report.blockers?.length || 0) > 0
        || (report.placementAudit?.violationCount || 0) > 0;
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
    resolveManifestPath: (manifestPath = DEFAULT_WORD_SOURCE_MANIFEST) => path.resolve(process.cwd(), manifestPath || DEFAULT_WORD_SOURCE_MANIFEST),
    sourceAllowsCandidateDiscovery,
    validateCommonPoolOptions,
    validateLevels,
};
