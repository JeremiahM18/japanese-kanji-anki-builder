const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildGoldenCoverageRows,
    buildGoldenReviewCoverageSummary,
    buildStarterCuratedBuckets,
} = require("../src/datasets/goldenReviewCoverage");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { parseArgs } = require("../scripts/reportGoldenReviewCoverage");

const templatesDir = path.join(__dirname, "..", "templates");

function loadTemplateJson(fileName) {
    return JSON.parse(fs.readFileSync(path.join(templatesDir, fileName), "utf8"));
}

test("buildStarterCuratedBuckets keeps only starter-curated jlpt kanji", () => {
    const buckets = buildStarterCuratedBuckets({
        日: { jlpt: 5, source: "starter-curated" },
        本: { jlpt: 5, source: "starter-curated" },
        難: { jlpt: 4, source: "local" },
        語: { jlpt: 4, source: "starter-curated" },
    });

    assert.deepEqual(buckets.get(5), ["日", "本"]);
    assert.deepEqual(buckets.get(4), ["語"]);
});

test("buildGoldenCoverageRows reports missing golden review coverage by level", () => {
    const rows = buildGoldenCoverageRows({
        starterCuratedData: {
            日: { jlpt: 5, source: "starter-curated" },
            本: { jlpt: 5, source: "starter-curated" },
            語: { jlpt: 4, source: "starter-curated" },
            会: { jlpt: 4, source: "starter-curated" },
        },
        goldenReviewSets: {
            4: [{ kanji: "会" }],
            5: [{ kanji: "日" }],
        },
        levels: [4, 5],
    });

    assert.deepEqual(rows, [
        {
            level: 4,
            starterCuratedKanji: 2,
            goldenCoveredKanji: 1,
            missingKanji: 1,
            coverageRatio: 0.5,
            sampleMissing: ["語"],
        },
        {
            level: 5,
            starterCuratedKanji: 2,
            goldenCoveredKanji: 1,
            missingKanji: 1,
            coverageRatio: 0.5,
            sampleMissing: ["本"],
        },
    ]);
});

test("buildGoldenReviewCoverageSummary aggregates overall coverage", () => {
    const summary = buildGoldenReviewCoverageSummary({
        starterCuratedData: {
            日: { jlpt: 5, source: "starter-curated" },
            本: { jlpt: 5, source: "starter-curated" },
            語: { jlpt: 4, source: "starter-curated" },
        },
        goldenReviewSets: {
            4: [{ kanji: "語" }],
            5: [{ kanji: "日" }],
        },
        levels: [4, 5],
    });

    assert.equal(summary.starterCuratedKanji, 3);
    assert.equal(summary.goldenCoveredKanji, 2);
    assert.equal(summary.missingKanji, 1);
    assert.equal(summary.coverageRatio, 0.6667);
});

test("tracked N3 golden review coverage protects every starter-curated kanji", () => {
    const summary = buildGoldenReviewCoverageSummary({
        starterCuratedData: loadTemplateJson("starter_curated_study_data.json"),
        goldenReviewSets: {
            3: loadTemplateJson("golden_n3_review_set.json"),
        },
        levels: [3],
    });

    assert.equal(summary.coverageRatio, 1);
    assert.equal(summary.missingKanji, 0);
});

test("tracked N2 golden review coverage protects every starter-curated kanji", () => {
    const summary = buildGoldenReviewCoverageSummary({
        starterCuratedData: loadTemplateJson("starter_curated_study_data.json"),
        goldenReviewSets: {
            2: loadTemplateJson("golden_n2_review_set.json"),
        },
        levels: [2],
    });

    assert.equal(summary.starterCuratedKanji, 366);
    assert.equal(summary.goldenCoveredKanji, 366);
    assert.equal(summary.missingKanji, 0);
});

test("tracked N1 golden review coverage reports the started review queue against batch files", () => {
    const summary = buildGoldenReviewCoverageSummary({
        starterCuratedData: loadCuratedStudyData(path.join(__dirname, "..", "data", "__tracked_starter_only__.json"), {
            starterPath: path.join(templatesDir, "starter_curated_study_data.json"),
        }),
        goldenReviewSets: {
            1: loadTemplateJson("golden_n1_review_set.json"),
        },
        levels: [1],
    });

    assert.equal(summary.starterCuratedKanji, 1231);
    assert.equal(summary.goldenCoveredKanji, 784);
    assert.equal(summary.missingKanji, 447);
});

test("reportGoldenReviewCoverage parseArgs accepts level and limit", () => {
    const options = parseArgs(["--level=4", "--limit=10"]);

    assert.equal(options.level, 4);
    assert.equal(options.limit, 10);
    assert.deepEqual(options.unknownArgs, []);
});

test("reportGoldenReviewCoverage parseArgs records unsupported flags", () => {
    const options = parseArgs(["--json"]);

    assert.deepEqual(options.unknownArgs, ["--json"]);
});
