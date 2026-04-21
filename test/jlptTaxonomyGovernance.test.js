const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { resolveTrackedStarterPaths } = require("../src/datasets/curatedStudyData");
const {
    auditGoldenReviewSetsAgainstContract,
    auditStarterEntriesAgainstContract,
    loadJlptLevelContract,
} = require("../src/datasets/jlptLevelContract");

const repoRoot = path.resolve(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function loadTrackedStarterEntries() {
    const starterPaths = resolveTrackedStarterPaths({
        starterPath: path.join(templatesDir, "starter_curated_study_data.json"),
    });

    return starterPaths.reduce((merged, entryPath) => ({
        ...merged,
        ...loadJson(entryPath),
    }), {});
}

function loadGoldenReviewSets() {
    return Object.fromEntries(
        [2, 3, 4, 5].map((level) => [
            level,
            loadJson(path.join(templatesDir, `golden_n${level}_review_set.json`)),
        ])
    );
}

test("tracked starter curation stays aligned to the canonical JLPT contract", () => {
    const contract = loadJlptLevelContract(path.join(templatesDir, "jlpt_level_contract.json"));
    const audit = auditStarterEntriesAgainstContract(loadTrackedStarterEntries(), contract);

    assert.equal(audit.valid, true, `Starter curation drifted from JLPT contract: ${JSON.stringify(audit.mismatches.slice(0, 10), null, 2)}`);
});

test("tracked golden review sets stay aligned to the canonical JLPT contract", () => {
    const contract = loadJlptLevelContract(path.join(templatesDir, "jlpt_level_contract.json"));
    const audit = auditGoldenReviewSetsAgainstContract(loadGoldenReviewSets(), contract);

    assert.equal(audit.valid, true, `Golden review placement drifted from JLPT contract: ${JSON.stringify(audit.mismatches.slice(0, 10), null, 2)}`);
});
