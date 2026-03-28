const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs: parseBuildArtifactsArgs } = require("../scripts/buildArtifacts");
const { parseArgs: parseSyncArgs } = require("../scripts/syncMedia");
const { parseArgs: parsePrepareArgs } = require("../scripts/prepareDeck");

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

test("prepareDeck parseArgs records unsupported flags and json mode", () => {
    const options = parsePrepareArgs(["--levels=5,4", "--json", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("buildArtifacts parseArgs records unsupported flags", () => {
    const options = parseBuildArtifactsArgs(["--levels=5,4", "--skip-media-sync", "--oops"]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.skipMediaSync, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});
