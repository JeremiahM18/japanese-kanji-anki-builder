const test = require("node:test");
const assert = require("node:assert/strict");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { parseArgs: parseBuildArtifactsArgs } = require("../scripts/buildArtifacts");
const { parseArgs: parsePreviewArgs } = require("../scripts/previewDeck");
const { parseArgs: parseReadinessArgs } = require("../scripts/reportDeckReadiness");
const { parseArgs: parseSyncArgs } = require("../scripts/syncMedia");
const { parseArgs: parsePrepareArgs } = require("../scripts/prepareDeck");
const { parseArgs: parseImportKanjiVgArgs } = require("../scripts/importKanjiVgStrokeOrder");

test("syncMedia parseArgs accepts --levels alias for one level", () => {
    const options = parseSyncArgs(["--levels=5", "--limit=79"]);

    assert.equal(options.level, 5);
    assert.equal(options.limit, 79);
    assert.deepEqual(options.unknownArgs, []);
});

test("syncMedia parseArgs records unsupported flags", () => {
    const options = parseSyncArgs(["--bogus=1", "--kanji=日,本"]);

    assert.deepEqual(options.unknownArgs, ["--bogus=1"]);
    assert.deepEqual(options.kanji, ["日", "本"]);
});

test("syncMedia parseArgs rejects multi-level alias input", () => {
    assert.throws(() => parseSyncArgs(["--levels=5,4"]), /one level at a time/);
});

test("importKanjiVg parseArgs accepts explicit kanji outside JLPT inventory", () => {
    const options = parseImportKanjiVgArgs(["--input-dir=downloads/kanjivg", "--kanji=椅,瓜", "--json"]);

    assert.equal(options.inputDir, "downloads/kanjivg");
    assert.deepEqual(options.kanji, ["椅", "瓜"]);
    assert.equal(options.json, true);
});

test("prepareDeck parseArgs records unsupported flags, json mode, and strict override", () => {
    const options = parsePrepareArgs(["--levels=5,4", "--json", "--allow-export-fallbacks", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.json, true);
    assert.equal(options.allowExportFallbacks, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("buildArtifacts parseArgs records unsupported flags and export issue gates", () => {
    const options = parseBuildArtifactsArgs(["--levels=5,4", "--skip-media-sync", "--fail-on-export-issues", "--max-fallback-ratio=0.05", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.skipMediaSync, true);
    assert.equal(options.failOnExportIssues, true);
    assert.equal(options.maxFallbackRatio, 0.05);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("previewDeck parseArgs records unsupported flags", () => {
    const options = parsePreviewArgs(["--level=5", "--kanji=日,本", "--json", "--oops"]);

    assert.equal(options.level, 5);
    assert.deepEqual(options.kanji, ["日", "本"]);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("reportDeckReadiness parseArgs records unsupported flags", () => {
    const options = parseReadinessArgs(["--json", "--oops"]);

    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});


test("invokeCliMain resolves both sync and async entrypoints", async () => {
    await assert.doesNotReject(() => invokeCliMain(() => 42));
    await assert.doesNotReject(() => invokeCliMain(async () => 42));
    await assert.rejects(() => invokeCliMain(() => { throw new Error("boom"); }), /boom/);
});
