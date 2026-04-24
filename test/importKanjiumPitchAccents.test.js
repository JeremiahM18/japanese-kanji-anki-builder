const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWrittenVariants,
    formatPitchAccentPattern,
    importKanjiumPitchAccents,
} = require("../scripts/importKanjiumPitchAccents");

test("buildWrittenVariants includes conservative full-width numeric variants", () => {
    assert.deepEqual(buildWrittenVariants("一時"), ["一時", "１時"]);
    assert.deepEqual(buildWrittenVariants("時々"), ["時々", "時時"]);
});

test("formatPitchAccentPattern classifies heiban and non-heiban patterns", () => {
    assert.equal(formatPitchAccentPattern("0", "おかね"), "0 [heiban]");
    assert.equal(formatPitchAccentPattern("1", "あめ"), "1 [atamadaka]");
    assert.equal(formatPitchAccentPattern("2,0", "ときどき"), "2 [nakadaka] / 0 [heiban]");
});

test("importKanjiumPitchAccents imports exact deck-eligible matches only", () => {
    const report = importKanjiumPitchAccents({
        kanjiumText: [
            "雨\tあめ\t1",
            "１時\tいちじ\t2",
        ].join("\n"),
        starterEntries: {
            "雨|あめ": { written: "雨", reading: "あめ", jlpt: 5, tags: ["starter"] },
            "一時|いちじ": { written: "一時", reading: "いちじ", jlpt: 5, tags: ["starter"] },
            "雨の日|あめのひ": { written: "雨の日", reading: "あめのひ", jlpt: 5, tags: ["starter"] },
            "高い山|たかいやま": { written: "高い山", reading: "たかいやま", jlpt: 5, tags: ["starter", "phrase"] },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "雨|あめ": { written: "雨", reading: "あめ", jlpt: 5 },
                "一時|いちじ": { written: "一時", reading: "いちじ", jlpt: 5 },
                "雨の日|あめのひ": { written: "雨の日", reading: "あめのひ", jlpt: 5 },
            },
        },
        pitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {},
        },
        levels: [5],
    });

    assert.equal(report.summary.totalDeckEntries, 3);
    assert.equal(report.summary.imported, 2);
    assert.equal(report.summary.missing, 1);
    assert.equal(report.data.entries["雨|あめ"].sourceId, "kanjium-cc-by-sa-4.0");
    assert.equal(report.data.entries["一時|いちじ"].sourceWord, "１時");
});
