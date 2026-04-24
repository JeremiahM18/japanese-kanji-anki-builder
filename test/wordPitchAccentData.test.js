const test = require("node:test");
const assert = require("node:assert/strict");

const {
    normalizeWordPitchAccentData,
    resolveWordPitchAccent,
} = require("../src/datasets/wordPitchAccentData");

test("normalizeWordPitchAccentData rejects entries with unknown source ids", () => {
    assert.throws(() => normalizeWordPitchAccentData({
        sources: {},
        entries: {
            "雨|あめ": {
                pattern: "1 [atamadaka]",
                sourceId: "missing-source",
            },
        },
    }), /unknown source/);
});

test("resolveWordPitchAccent uses exact written-reading keys", () => {
    const data = normalizeWordPitchAccentData({
        sources: {
            "kanjium-cc-by-sa-4.0": {
                name: "Kanjium",
                license: "CC BY-SA 4.0",
            },
        },
        entries: {
            "雨|あめ": {
                pattern: "1 [atamadaka]",
                sourceId: "kanjium-cc-by-sa-4.0",
            },
        },
    });

    assert.equal(resolveWordPitchAccent({ written: "雨", reading: "あめ", wordPitchAccentData: data }).pattern, "1 [atamadaka]");
    assert.equal(resolveWordPitchAccent({ written: "飴", reading: "あめ", wordPitchAccentData: data }), null);
});
