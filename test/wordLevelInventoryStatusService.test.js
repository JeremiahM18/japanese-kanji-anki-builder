const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordLevelInventoryStatusReport,
    formatWordPreSilverInventoryStatusReport,
    formatWordLevelInventoryStatusReport,
} = require("../src/services/wordLevelInventoryStatusService");

test("word inventory status separates active lanes from pre-Silver keep inventory", () => {
    const report = buildWordLevelInventoryStatusReport({
        levels: [5],
        generatedRowsByLevel: {
            5: [
                { word: "本", reading: "ほん" },
                { word: "水", reading: "みず" },
                { word: "外食", reading: "がいしょく" },
                { word: "国語", reading: "こくご" },
                { word: "日時", reading: "にちじ" },
            ],
        },
        goldReviewSetsByLevel: {
            5: [
                { word: "本", readingIncludes: ["ほん"] },
                { word: "水", readingIncludes: ["みず"] },
                { word: "国語", readingIncludes: ["こくご"] },
            ],
        },
        sapphireReviewSetsByLevel: {
            5: [
                { word: "本", readingIncludes: ["ほん"] },
                { word: "水", readingIncludes: ["みず"] },
            ],
        },
        platinumReviewSetsByLevel: {
            5: [
                { word: "本", readingIncludes: ["ほん"] },
                { word: "水", readingIncludes: ["みず"] },
            ],
        },
        proofEventsByLevel: {
            5: [
                { target: { written: "本", reading: "ほん" } },
            ],
        },
        triageDecisionsByLevelSource: {
            N5: {
                "dictionary-common-pool": {
                    "本|ほん": { decision: "keep_candidate" },
                    "日時|にちじ": { decision: "keep_candidate" },
                    "晴れ間|はれま": { decision: "keep_candidate" },
                    "山川|さんせん": { decision: "reject_candidate" },
                    "手紙|てがみ": { decision: "move_candidate" },
                },
            },
        },
        governedPreSilverByLevel: {
            5: {
                available: true,
                source: "dictionary-common-pool",
                eligibleKeepBeforeCap: 1,
                activeWindowRows: 1,
                readyRows: 1,
                blockedRows: 0,
            },
        },
    });

    const level = report.levelReports[0];

    assert.equal(level.certification.denominator, 5);
    assert.deepEqual(level.certification.lanes, {
        silver: 5,
        gold: 3,
        sapphire: 2,
        platinum: 2,
        obsidian: 1,
    });
    assert.deepEqual(level.certification.exclusiveBuckets, {
        silverOnly: 2,
        goldOnly: 1,
        sapphireOnly: 0,
        platinumNeedsObsidian: 1,
        obsidianCertified: 1,
        proofWithoutPlatinum: 0,
    });
    assert.equal(level.triage.raw.totals.keep, 3);
    assert.equal(level.triage.raw.totals.keepAlreadySilver, 2);
    assert.equal(level.triage.raw.totals.keepStillPreSilver, 1);
    assert.equal(level.triage.governedPreSilver.eligibleKeepBeforeCap, 1);
    assert.equal(level.triage.rawKeptOutsideGovernedEligible, 0);
});

test("word inventory status formatter names raw and governed pre-Silver counts", () => {
    const report = buildWordLevelInventoryStatusReport({
        levels: [5],
        generatedRowsByLevel: { 5: [] },
        triageDecisionsByLevelSource: {
            N5: {
                "dictionary-common-pool": {
                    "晴れ間|はれま": { decision: "keep_candidate" },
                    "水洗|すいせん": { decision: "keep_candidate" },
                },
            },
        },
        governedPreSilverByLevel: {
            5: {
                available: true,
                eligibleKeepBeforeCap: 1,
                activeWindowRows: 1,
                readyRows: 1,
            },
        },
    });

    const formatted = formatWordLevelInventoryStatusReport(report);

    assert.match(formatted, /Raw keep still pre-Silver/);
    assert.match(formatted, /Governed eligible keep pre-Silver/);
    assert.match(formatted, /\| N5 \| 2 \| 2 \| 0 \| 2 \| 1 \| 1 \| 1 \| 0 \| 1 \|/);
});

test("word pre-Silver formatter shows the simple kept backlog counts", () => {
    const report = buildWordLevelInventoryStatusReport({
        levels: [5],
        generatedRowsByLevel: {
            5: [
                { word: "本", reading: "ほん" },
            ],
        },
        triageDecisionsByLevelSource: {
            N5: {
                "dictionary-common-pool": {
                    "本|ほん": { decision: "keep_candidate" },
                    "晴れ間|はれま": { decision: "keep_candidate" },
                    "山川|さんせん": { decision: "reject_candidate" },
                },
            },
        },
    });

    const formatted = formatWordPreSilverInventoryStatusReport(report);

    assert.match(formatted, /Previously kept for Silver review/);
    assert.match(formatted, /Still waiting for Silver/);
    assert.match(formatted, /\| N5 \| 3 \| 2 \| 1 \| 1 \| 0 \| 0 \| 1 \|/);
    assert.match(formatted, /does not load Gold, Sapphire, Platinum, Obsidian/);
});
