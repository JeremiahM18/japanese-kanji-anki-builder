const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { loadWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const { loadWordStudyData } = require("../datasets/wordStudyData");
const {
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    DICTIONARY_COMMON_POOL_SOURCE_ID,
    SOURCE_POOL_DICTIONARY_COMMON,
    SOURCE_POOL_DICTIONARY_COMMON_LABEL,
    normalizeCommonPoolQueueMode,
} = require("./wordCommonExpansionSelectorService");

const DEFAULT_WORD_SOURCE_MANIFEST = "templates/word_source_manifest.json";

function resolveManifestPath(manifestPath = DEFAULT_WORD_SOURCE_MANIFEST) {
    return path.resolve(process.cwd(), manifestPath || DEFAULT_WORD_SOURCE_MANIFEST);
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

function loadSharedInputs() {
    return {
        jlptLevelContract: loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json")),
        jlptWordLevelContract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
        starterEntries: loadWordStudyData({
            starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
            localPath: null,
        }),
        wordPitchAccentData: loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json")),
    };
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

function validateCommonPoolOptions({
    commonPoolMode = "editorial",
    commonPoolLimit = DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    queueMode = "auto",
} = {}) {
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

module.exports = {
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
};
