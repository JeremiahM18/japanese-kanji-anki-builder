const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    parseArgs,
    resolveManifestPath,
} = require("../scripts/reportWordCandidateAgreement");

test("parseArgs supports word candidate agreement report options", () => {
    assert.deepEqual(parseArgs([
        "--levels=5,4",
        "--manifest=templates/word-source.json",
        "--triage=templates/triage.json",
        "--limit=25",
        "--strict",
        "--json",
    ]), {
        json: true,
        levels: [5, 4],
        limit: 25,
        manifest: "templates/word-source.json",
        placementMode: "kanji-anchor",
        strict: true,
        triage: "templates/triage.json",
        unknownArgs: [],
    });
});

test("parseArgs supports vocabulary-level candidate agreement mode", () => {
    assert.equal(
        parseArgs(["--placement-mode=vocabulary-level"]).placementMode,
        "vocabulary-level"
    );
    assert.equal(
        parseArgs(["--placement=vocabulary-level"]).placementMode,
        "vocabulary-level"
    );
});

test("resolveManifestPath defaults to tracked word source manifest", () => {
    assert.equal(
        resolveManifestPath(""),
        path.resolve(process.cwd(), DEFAULT_WORD_SOURCE_MANIFEST)
    );
});
