"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../config");
const { loadJlptOnlyJson } = require("../datasets/jlptOnlyJson");
const { parseSapphireWordReviewSet } = require("../datasets/sapphireWordReviewSet");
const { loadWordPitchAccentData } = require("../datasets/wordPitchAccentData");
const {
    buildWordStudyDataStalenessReport,
} = require("../datasets/wordStudyData");
const {
    createImmutableReviewIndex,
    deepFreeze,
} = require("./immutableReviewIndexService");
const {
    buildWordEntryIdentity,
} = require("./reviewLanePreconditionService");
const {
    hasCurrentStandardWordSapphireStatus,
} = require("./reviewLaneContextService");
const { buildWordRowsForLevel } = require("./wordGeneratedRowsService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
} = require("./obsidianProofProviderService");

function readRequiredJson(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing ${label} at ${filePath}`);
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertWordReviewLevel(level) {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Word multi-lane status level must be 1-5.");
    }
}

function freezeRequiredArray(value, label) {
    if (!Array.isArray(value)) {
        throw new TypeError(`${label} must be an array.`);
    }
    return deepFreeze(value);
}

/**
 * Loads one word level once, deep-freezes every shared input, and exposes only
 * read-only lookup indexes. No lane result or approval is stored here.
 *
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function loadWordReviewSharedContext({
    level,
    cwd = process.cwd(),
    config = loadConfig(),
    proofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
    dependencies = {},
} = {}) {
    assertWordReviewLevel(level);

    const buildRows = dependencies.buildWordRowsForLevel || buildWordRowsForLevel;
    const loadPitch = dependencies.loadWordPitchAccentData || loadWordPitchAccentData;
    const loadKanjiLevels = dependencies.loadJlptOnlyJson || loadJlptOnlyJson;
    const loadPlatinum = dependencies.loadReviewSetWithObsidianProof || loadReviewSetWithObsidianProof;
    const parseSapphire = dependencies.parseSapphireWordReviewSet || parseSapphireWordReviewSet;
    const readJson = dependencies.readRequiredJson || readRequiredJson;
    const buildStaleness = dependencies.buildWordStudyDataStalenessReport || buildWordStudyDataStalenessReport;

    const templateDir = path.join(cwd, "templates");
    const goldenPath = path.join(templateDir, `golden_n${level}_word_review_set.json`);
    const sapphirePath = path.join(templateDir, `sapphire_n${level}_word_review_set.json`);
    const pitchPath = path.join(templateDir, "word_pitch_accent_data.json");
    const starterWordPath = path.join(templateDir, "starter_word_study_data.json");

    const rows = freezeRequiredArray(await buildRows({ level, config }), "Generated word rows");
    const goldenExpectations = freezeRequiredArray(
        readJson(goldenPath, "Gold word review set"),
        "Gold word review set"
    );
    const sapphireEntries = freezeRequiredArray(parseSapphire(
        readJson(sapphirePath, "Sapphire word review set"),
        path.relative(cwd, sapphirePath).replaceAll("\\", "/")
    ), "Sapphire word review set");
    const platinumEntries = freezeRequiredArray(loadPlatinum({
        cwd,
        deckKind: "word",
        level,
        proofProvider,
    }).entries, "Platinum word review set");
    const wordPitchAccentData = deepFreeze(loadPitch(pitchPath));
    const kanjiLevelData = deepFreeze(loadKanjiLevels(config.jlptJsonPath));
    const wordStudyPreflight = deepFreeze(buildStaleness({
        localPath: config.wordStudyDataPath,
        starterPath: starterWordPath,
    }));

    const indexes = Object.freeze({
        rowsByWritten: createImmutableReviewIndex(rows, {
            getKeys: (row) => row.word,
        }),
        goldenByIdentity: createImmutableReviewIndex(goldenExpectations, {
            getKeys: buildWordEntryIdentity,
        }),
        goldenByWritten: createImmutableReviewIndex(goldenExpectations, {
            getKeys: (entry) => entry.word,
        }),
        currentSapphireByIdentity: createImmutableReviewIndex(sapphireEntries, {
            getKeys: buildWordEntryIdentity,
            includeValue: hasCurrentStandardWordSapphireStatus,
        }),
    });

    return Object.freeze({
        level,
        rows,
        goldenExpectations,
        sapphireEntries,
        platinumEntries,
        wordPitchAccentData,
        kanjiLevelData,
        wordStudyPreflight,
        indexes,
        sharingBoundary: Object.freeze({
            shared: "deep-frozen loaded inputs and read-only lookup indexes",
            notShared: "lane evaluator results, approvals, certification, proof, or pass/fail decisions",
        }),
    });
}

module.exports = {
    assertWordReviewLevel,
    freezeRequiredArray,
    loadWordReviewSharedContext,
    readRequiredJson,
};
