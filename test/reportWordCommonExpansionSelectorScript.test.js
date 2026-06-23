const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    hasStrictFailure,
    parseArgs,
    resolveManifestPath,
    validateLevels,
} = require("../scripts/reportWordCommonExpansionSelector");

test("parseArgs supports common expansion selector options", () => {
    assert.deepEqual(parseArgs([
        "--levels=5,4,3",
        "--manifest=templates/word-source.json",
        "--triage=templates/triage.json",
        "--limit=25",
        "--strict",
        "--json",
    ]), {
        json: true,
        levels: [5, 4, 3],
        limit: 25,
        manifest: "templates/word-source.json",
        placementMode: "kanji-anchor",
        source: "",
        sourceEvidence: "templates/jlpt_word_source_evidence.json",
        strict: true,
        triage: "templates/triage.json",
        unknownArgs: [],
    });
});

test("parseArgs supports vocabulary-level selector mode", () => {
    assert.equal(
        parseArgs(["--placement-mode=vocabulary-level"]).placementMode,
        "vocabulary-level"
    );
    assert.equal(
        parseArgs(["--placement=vocabulary-level"]).placementMode,
        "vocabulary-level"
    );
});

test("common expansion selector defaults to all JLPT levels", () => {
    const options = parseArgs([]);
    assert.deepEqual(options.levels, [5, 4, 3, 2, 1]);
    assert.equal(options.manifest, DEFAULT_WORD_SOURCE_MANIFEST);
    assert.equal(options.placementMode, "kanji-anchor");
    assert.equal(options.sourceEvidence, "templates/jlpt_word_source_evidence.json");
    assert.equal(
        resolveManifestPath(""),
        path.resolve(process.cwd(), DEFAULT_WORD_SOURCE_MANIFEST)
    );
});

test("validateLevels rejects empty or invalid selector scopes", () => {
    assert.doesNotThrow(() => validateLevels([5, 4, 3, 2, 1]));
    assert.throws(() => validateLevels([]), /requires at least one level/);
    assert.throws(() => validateLevels([6]), /must be 1-5/);
});

test("strict common expansion treats inactive queues as classification, not failure", () => {
    assert.equal(hasStrictFailure({
        blockers: [],
        placementAudit: { violationCount: 0 },
        summary: { inactiveReadingExpansionLevels: 2 },
    }), false);
    assert.equal(hasStrictFailure({
        blockers: ["source blocker"],
        placementAudit: { violationCount: 0 },
        summary: { inactiveReadingExpansionLevels: 0 },
    }), true);
});
