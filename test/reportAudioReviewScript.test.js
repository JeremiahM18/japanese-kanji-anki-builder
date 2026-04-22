const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reportAudioReview");

test("reportAudioReview parseArgs supports levels, kanji, limit, and json", () => {
    const result = parseArgs([
        "--levels=5,4",
        "--kanji=日,月",
        "--limit=12",
        "--json",
    ]);

    assert.deepEqual(result.levels, [5, 4]);
    assert.deepEqual(result.kanji, ["日", "月"]);
    assert.equal(result.limit, 12);
    assert.equal(result.json, true);
});

test("reportAudioReview parseArgs records unsupported flags", () => {
    const result = parseArgs(["--wat"]);
    assert.deepEqual(result.unknownArgs, ["--wat"]);
});
