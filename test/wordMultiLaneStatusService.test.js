"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseArgs,
} = require("../scripts/reportWordMultiLaneStatus");
const {
    createImmutableReviewIndex,
    deepFreeze,
} = require("../src/services/immutableReviewIndexService");
const {
    loadWordReviewSharedContext,
} = require("../src/services/wordReviewSharedContextService");
const {
    FAILURE_CLASSIFICATIONS,
    WORD_CERTIFICATION_LANES,
    buildCompactWordMultiLaneStatus,
    buildWordMultiLaneStatus,
    classifyObsidianReport,
    formatWordMultiLaneStatus,
    normalizeSelectedLanes,
    summarizeLaneReport,
} = require("../src/services/wordMultiLaneStatusService");
const {
    evaluateWordSilverGeneratedSurface,
} = require("../src/services/wordSilverStatusService");

test("Silver status validates exact generated written|reading identity without claiming review", () => {
    const passing = evaluateWordSilverGeneratedSurface({
        rows: [{ word: "今日", reading: "きょう" }],
    });
    assert.equal(passing.passed, true);
    assert.equal(passing.authority.includes("generated"), true);

    const failing = evaluateWordSilverGeneratedSurface({
        rows: [
            { word: "今日", reading: "きょう" },
            { word: "今日", reading: "きょう" },
            { word: "本", reading: "" },
        ],
    });
    assert.equal(failing.passed, false);
    assert.deepEqual(failing.duplicateIdentities, ["今日|きょう"]);
    assert.equal(failing.failedCount, 3);
});

test("immutable review indexes expose frozen buckets without mutation methods", () => {
    const values = deepFreeze([
        { word: "今日", reading: "きょう" },
        { word: "今日", reading: "こんにち" },
    ]);
    const index = createImmutableReviewIndex(values, {
        getKeys: (value) => value.word,
    });

    assert.equal(Object.isFrozen(values), true);
    assert.equal(Object.isFrozen(values[0]), true);
    assert.equal(Object.isFrozen(index), true);
    assert.equal(Object.isFrozen(index.get("今日")), true);
    assert.equal(index.get("今日").length, 2);
    assert.deepEqual(index.get("missing"), []);
    assert.deepEqual(index.keys(), ["今日"]);
    assert.equal(index.set, undefined);
    assert.equal(index.delete, undefined);
    assert.throws(() => {
        values[0].word = "変更";
    }, TypeError);
    assert.throws(() => {
        index.get("今日").push({ word: "今日" });
    }, TypeError);
    assert.throws(() => deepFreeze(new Map([["今日", []]])), /mutable collection inputs/);
});

test("shared word context loads each immutable input once and builds read-only indexes", async () => {
    const calls = new Map();
    const count = (name) => calls.set(name, (calls.get(name) || 0) + 1);
    const config = {
        jlptJsonPath: "fixture-jlpt.json",
        wordStudyDataPath: "fixture-words.json",
    };
    const context = await loadWordReviewSharedContext({
        level: 4,
        cwd: "C:\\fixture",
        config,
        dependencies: {
            buildWordRowsForLevel: async () => {
                count("rows");
                return [{ word: "今日", reading: "きょう" }];
            },
            readRequiredJson: (filePath) => {
                if (filePath.includes("golden_")) {
                    count("gold");
                    return [{ word: "今日", readingIncludes: ["きょう"] }];
                }
                count("sapphire");
                return [{ word: "今日", readingIncludes: ["きょう"], status: "sapphire", reviewStandard: "word-sapphire-v1-evidence-lanes" }];
            },
            parseSapphireWordReviewSet: (value) => value,
            loadReviewSetWithObsidianProof: () => {
                count("platinum");
                return { entries: [{ word: "今日", readingIncludes: ["きょう"] }] };
            },
            loadWordPitchAccentData: () => {
                count("pitch");
                return { entries: {} };
            },
            loadJlptOnlyJson: () => {
                count("kanji-levels");
                return { 今: { jlpt: 5 } };
            },
            buildWordStudyDataStalenessReport: () => {
                count("staleness");
                return { inSync: true };
            },
        },
    });

    assert.deepEqual(Object.fromEntries(calls), {
        rows: 1,
        gold: 1,
        sapphire: 1,
        platinum: 1,
        pitch: 1,
        "kanji-levels": 1,
        staleness: 1,
    });
    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.rows[0]), true);
    assert.equal(context.indexes.rowsByWritten.get("今日")[0], context.rows[0]);
    assert.equal(context.indexes.goldenByIdentity.get("今日|きょう").length, 1);
    assert.equal(context.indexes.currentSapphireByIdentity.get("今日|きょう").length, 1);
    assert.match(context.sharingBoundary.notShared, /approval/);
});

test("shared word context fails closed when a loader returns a non-array lane input", async () => {
    await assert.rejects(() => loadWordReviewSharedContext({
        level: 4,
        cwd: "C:\\fixture",
        config: { jlptJsonPath: "fixture-jlpt.json", wordStudyDataPath: "fixture-words.json" },
        dependencies: {
            buildWordRowsForLevel: async () => ({ word: "not-an-array" }),
        },
    }), /Generated word rows must be an array/);
});

test("multi-lane status preserves canonical order and independently evaluates every lane", async () => {
    const calls = [];
    const sapphireReports = [];
    const context = deepFreeze({
        level: 4,
        rows: [{ word: "今日", reading: "きょう" }],
        goldenExpectations: [{ word: "今日", readingIncludes: ["きょう"] }],
        sapphireEntries: [{ word: "今日", readingIncludes: ["きょう"] }],
        platinumEntries: [{ word: "今日", readingIncludes: ["きょう"] }],
        wordPitchAccentData: {},
        kanjiLevelData: {},
        wordStudyPreflight: { inSync: true },
        indexes: {
            rowsByWritten: createImmutableReviewIndex([{ word: "今日", reading: "きょう" }], { getKeys: (row) => row.word }),
            goldenByWritten: createImmutableReviewIndex([{ word: "今日", readingIncludes: ["きょう"] }], { getKeys: (entry) => entry.word }),
            goldenByIdentity: createImmutableReviewIndex([{ word: "今日", readingIncludes: ["きょう"] }], { getKeys: () => "今日|きょう" }),
            currentSapphireByIdentity: createImmutableReviewIndex([{ word: "今日", readingIncludes: ["きょう"] }], { getKeys: () => "今日|きょう" }),
        },
        sharingBoundary: {
            shared: "inputs and indexes",
            notShared: "results and approval",
        },
    });

    const status = await buildWordMultiLaneStatus({
        levels: [4],
        lanes: ["obsidian", "gold", "silver", "platinum", "sapphire"],
        dependencies: {
            loadWordReviewSharedContext: async () => {
                calls.push("load");
                return context;
            },
            evaluateWordSilverGeneratedSurface: () => {
                calls.push("silver");
                return { passed: true, totalRows: 1, passedCount: 1, failedCount: 0 };
            },
            evaluateGoldenWordReviewSet: () => {
                calls.push("gold");
                return { passed: true, totalCards: 1, passedCount: 1, failedCount: 0, missingExpectationWords: [] };
            },
            evaluateSapphireWordReviewSet: () => {
                const report = { passed: true, generatedRowCount: 1, currentStandardSapphireCount: 1, failedCount: 0, missingCurrentStandardRows: [], results: [{ passed: true, identity: `sapphire-${sapphireReports.length}` }] };
                sapphireReports.push(report);
                calls.push(`sapphire-${sapphireReports.length}`);
                return report;
            },
            evaluatePlatinumWordReviewSet: (options) => {
                calls.push("platinum");
                assert.equal(options.sapphireResults, sapphireReports[1].results);
                assert.notEqual(options.sapphireResults, sapphireReports[0].results);
                return { passed: false, generatedRowCount: 1, currentStandardPlatinumCount: 0, failedCount: 0, missingCurrentStandardRows: ["今日 (きょう)"] };
            },
            buildPlatinumWordRereviewStatusReport: (options) => {
                calls.push("obsidian-rereview");
                assert.equal(options.sapphireResults, sapphireReports[2].results);
                assert.notEqual(options.sapphireResults, sapphireReports[1].results);
                return { level: 4 };
            },
            buildObsidianWordCertificationStatusSummary: () => ({
                passed: false,
                failureCount: 1,
                failures: [{ category: "needs_substantive_rereview", field: "rereviewProvenance" }],
                totals: { generatedRows: 1, substantive_current_standard_review_proven: 0, needs_substantive_rereview: 1, blocked_or_failing: 0 },
            }),
        },
    });

    assert.deepEqual(status.selectedLanes, WORD_CERTIFICATION_LANES);
    assert.deepEqual(calls, ["load", "silver", "gold", "sapphire-1", "sapphire-2", "platinum", "sapphire-3", "obsidian-rereview"]);
    assert.equal(status.independentLaneEvaluations, true);
    assert.equal(status.sharedInputsOnly, true);
    assert.equal(status.passed, false);
    assert.deepEqual(status.levels[0].lanes.map((lane) => lane.classification), [
        FAILURE_CLASSIFICATIONS.PASS,
        FAILURE_CLASSIFICATIONS.PASS,
        FAILURE_CLASSIFICATIONS.PASS,
        FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG,
        FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG,
    ]);

    const compact = buildCompactWordMultiLaneStatus(status);
    assert.equal(Object.hasOwn(compact.levels[0].lanes[0], "report"), false);
    assert.match(formatWordMultiLaneStatus(status), /Silver -> Gold -> Sapphire -> Platinum -> Obsidian/);
    assert.match(formatWordMultiLaneStatus(status), /no result, approval, proof, or certification is shared/i);
});

test("multi-lane parsing requires explicit scope and rejects ambiguous output modes", () => {
    assert.deepEqual(parseArgs(["--levels=4", "--lanes=obsidian,gold", "--summary"]), {
        json: false,
        summary: true,
        levels: [4],
        lanes: ["obsidian", "gold"],
        proofProvider: "ledger-if-available",
        unknownArgs: [],
    });
    assert.deepEqual(normalizeSelectedLanes(["obsidian", "gold"]), ["gold", "obsidian"]);
    assert.throws(() => parseArgs([]), /requires --level/);
    assert.throws(() => parseArgs(["--level=4", "--json", "--summary"]), /exactly one/);
    assert.throws(() => normalizeSelectedLanes(["diamond"]), /Unsupported/);
});

test("multi-lane classifications never hide denominator drift or reviewed authority failures", () => {
    const gold = summarizeLaneReport("gold", {
        passed: false,
        generatedRowCount: 2,
        totalCards: 1,
        passedCount: 1,
        failedCount: 0,
        missingExpectationWords: ["明日 (あした)"],
    });
    assert.equal(gold.generatedRows, 2);
    assert.equal(gold.coveredRows, 1);
    assert.equal(gold.classification, FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG);

    assert.equal(classifyObsidianReport({
        passed: false,
        failures: [{
            category: "blocked_or_failing",
            field: "qualityGates.naturalJapanese",
            actual: "false",
        }],
    }), FAILURE_CLASSIFICATIONS.REVIEWED_ROW_OR_AUTHORITY_FAILURE);
});
