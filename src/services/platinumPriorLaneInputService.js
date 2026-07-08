const fs = require("node:fs");
const path = require("node:path");

const { parseSapphireWordReviewSet } = require("../datasets/sapphireWordReviewSet");
const { evaluateSapphireKanjiReviewSet } = require("./sapphireKanjiReviewService");
const { evaluateSapphireWordReviewSet } = require("./sapphireWordReviewService");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readKanjiPriorLaneInputs(level, { rows, cwd = process.cwd() } = {}) {
    const goldenPath = path.join(cwd, "templates", `golden_n${level}_review_set.json`);
    const sapphirePath = path.join(cwd, "templates", `sapphire_n${level}_review_set.json`);
    if (!fs.existsSync(goldenPath)) {
        throw new Error(`Missing prior Gold kanji review set at ${goldenPath}`);
    }
    if (!fs.existsSync(sapphirePath)) {
        throw new Error(`Missing prior Sapphire kanji review set at ${sapphirePath}`);
    }
    const goldenExpectations = readJson(goldenPath);
    const sapphireEntries = readJson(sapphirePath);
    const sapphireReport = evaluateSapphireKanjiReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    return {
        goldenExpectations,
        sapphireEntries,
        sapphireResults: sapphireReport.results,
    };
}

function readWordPriorLaneInputs(level, { rows, cwd = process.cwd() } = {}) {
    const goldenPath = path.join(cwd, "templates", `golden_n${level}_word_review_set.json`);
    const sapphirePath = path.join(cwd, "templates", `sapphire_n${level}_word_review_set.json`);
    if (!fs.existsSync(goldenPath)) {
        throw new Error(`Missing prior Gold word review set at ${goldenPath}`);
    }
    if (!fs.existsSync(sapphirePath)) {
        throw new Error(`Missing prior Sapphire word review set at ${sapphirePath}`);
    }
    const goldenExpectations = readJson(goldenPath);
    const sapphireEntries = parseSapphireWordReviewSet(
        readJson(sapphirePath),
        `templates/sapphire_n${level}_word_review_set.json`
    );
    const sapphireReport = evaluateSapphireWordReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    return {
        goldenExpectations,
        sapphireEntries,
        sapphireResults: sapphireReport.results,
    };
}

module.exports = {
    readKanjiPriorLaneInputs,
    readWordPriorLaneInputs,
};
