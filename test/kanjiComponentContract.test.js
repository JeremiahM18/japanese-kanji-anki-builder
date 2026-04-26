const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildComponentMapFromContract,
    countComponentCoverageForLevel,
    loadKanjiComponentContract,
    normalizeKanjiComponentContract,
} = require("../src/datasets/kanjiComponentContract");

test("tracked kanji component contract covers the governed JLPT inventory", () => {
    const contract = loadKanjiComponentContract("templates/kanji_component_contract.json");

    assert.equal(Object.keys(contract.components).length, 2212);
    assert.deepEqual(contract.inventoryCounts, {
        "1": 1231,
        "2": 366,
        "3": 359,
        "4": 176,
        "5": 80,
    });
    assert.deepEqual(contract.components.外, ["卜", "夕"]);
});

test("buildComponentMapFromContract returns a deterministic component map", () => {
    const map = buildComponentMapFromContract({
        components: {
            外: ["卜", "夕"],
            日: ["日"],
        },
    });

    assert.deepEqual(map.get("外"), ["卜", "夕"]);
    assert.deepEqual([...map.keys()], ["外", "日"]);
});

test("countComponentCoverageForLevel reports missing governed component rows", () => {
    const coverage = countComponentCoverageForLevel({
        componentContract: {
            components: {
                日: ["日"],
            },
        },
        jlptLevelContract: {
            kanjiLevels: {
                日: 5,
                本: 5,
            },
        },
        level: 5,
    });

    assert.deepEqual(coverage, {
        expected: 2,
        covered: 1,
        missing: 1,
    });
});

test("normalizeKanjiComponentContract rejects blank component rows", () => {
    assert.throws(
        () => normalizeKanjiComponentContract({
            version: 1,
            inventoryCounts: { "5": 1 },
            components: {
                日: [],
            },
        }),
        /must include at least one component/
    );
});
