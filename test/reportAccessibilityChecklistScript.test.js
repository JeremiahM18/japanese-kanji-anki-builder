const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    parseArgs,
    resolvePackageSummaryPath,
} = require("../scripts/reportAccessibilityChecklist");

test("parseArgs defaults to kanji and supports json output", () => {
    const options = parseArgs(["--json"]);
    assert.equal(options.deckKind, "kanji");
    assert.equal(options.json, true);
});

test("parseArgs accepts word deck kind", () => {
    const options = parseArgs(["--deck-kind=word"]);
    assert.equal(options.deckKind, "word");
    assert.equal(options.json, false);
});

test("resolvePackageSummaryPath points to the expected package summaries", () => {
    const config = {
        buildOutDir: path.join("out", "build"),
    };

    assert.equal(
        resolvePackageSummaryPath(config, "kanji"),
        path.join("out", "build", "package", "package-summary.json"),
    );
    assert.equal(
        resolvePackageSummaryPath(config, "word"),
        path.join("out", "word-build", "package", "package-summary.json"),
    );
});
