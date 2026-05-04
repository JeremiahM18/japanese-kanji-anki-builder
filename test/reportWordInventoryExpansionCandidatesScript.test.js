const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    parseArgs,
    resolveSourcePath,
} = require("../scripts/reportWordInventoryExpansionCandidates");

test("parseArgs supports expansion candidate report options", () => {
    assert.deepEqual(parseArgs([
        "--level=4",
        "--source=downloads/n4.tsv",
        "--source-label=fixture",
        "--format=tsv",
        "--kanji-scope=target-level",
        "--limit=25",
        "--require-source-level",
        "--json",
    ]), {
        format: "tsv",
        json: true,
        kanjiScope: "target-level",
        level: 4,
        limit: 25,
        requireSourceLevel: true,
        source: "downloads/n4.tsv",
        sourceLabel: "fixture",
        unknownArgs: [],
    });
});

test("resolveSourcePath requires an explicit source file", () => {
    assert.throws(() => resolveSourcePath(""), /Missing --source path/);
    assert.equal(resolveSourcePath("fixture.tsv"), path.resolve(process.cwd(), "fixture.tsv"));
});
