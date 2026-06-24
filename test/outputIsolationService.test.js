const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    buildOutputScopeSlug,
    normalizeRunId,
    resolveIsolatedOutputDir,
    resolveOutputDir,
} = require("../src/services/outputIsolationService");

test("output isolation builds stable deck and level slugs", () => {
    assert.equal(buildOutputScopeSlug({ deckKind: "word", levels: [5, 4] }), "word-n5-n4");
    assert.equal(buildOutputScopeSlug({ deckKind: "kanji", levels: [3, 5, 3] }), "kanji-n5-n3");
    assert.equal(buildOutputScopeSlug({ deckKind: "kanji-additional", levels: [1] }), "kanji-additional-n1");
});

test("output isolation accepts safe run ids and rejects path-like values", () => {
    assert.equal(normalizeRunId("batch-001.N5_word"), "batch-001.N5_word");
    assert.throws(() => normalizeRunId("../oops"), /Invalid --run-id/);
    assert.throws(() => normalizeRunId("bad/name"), /Invalid --run-id/);
    assert.throws(() => normalizeRunId("-starts-with-dash"), /Invalid --run-id/);
});

test("output isolation resolves run-id roots under governed generated outputs", () => {
    const cwd = process.cwd();
    const outputDir = resolveIsolatedOutputDir({
        cwd,
        runId: "batch-001",
        deckKind: "word",
        levels: [5],
    });

    assert.equal(outputDir, path.join(cwd, "out", "run-outputs", "batch-001", "word-n5"));
});

test("output isolation rejects ambiguous output options", () => {
    assert.throws(() => resolveOutputDir({
        explicitOutDir: "out/manual",
        runId: "batch-001",
        defaultOutDir: "out/build",
    }), /only one of --out-dir or --run-id/);

    assert.throws(() => resolveOutputDir({
        outDirBase: "out/runs",
        defaultOutDir: "out/build",
    }), /--out-dir-base only together with --run-id/);
});

test("output isolation preserves explicit and default output roots", () => {
    const cwd = process.cwd();
    assert.equal(resolveOutputDir({
        explicitOutDir: "out/manual",
        defaultOutDir: "out/build",
        cwd,
    }), path.join(cwd, "out", "manual"));
    assert.equal(resolveOutputDir({
        defaultOutDir: "out/build",
        cwd,
    }), path.join(cwd, "out", "build"));
});
