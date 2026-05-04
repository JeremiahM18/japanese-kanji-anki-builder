const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    loadTriageDecisions,
    parseArgs,
    resolveSourcePath,
    resolveTriagePath,
} = require("../scripts/reportWordInventoryExpansionCandidates");

test("parseArgs supports expansion candidate report options", () => {
    assert.deepEqual(parseArgs([
        "--level=4",
        "--source=downloads/n4.tsv",
        "--source-label=fixture",
        "--format=tsv",
        "--kanji-scope=target-level",
        "--limit=25",
        "--triage=templates/triage.json",
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
        triage: "templates/triage.json",
        unknownArgs: [],
    });
});

test("resolveSourcePath requires an explicit source file", () => {
    assert.throws(() => resolveSourcePath(""), /Missing --source path/);
    assert.equal(resolveSourcePath("fixture.tsv"), path.resolve(process.cwd(), "fixture.tsv"));
});

test("resolveTriagePath defaults to the tracked expansion triage file", () => {
    assert.equal(
        resolveTriagePath("templates/triage.json"),
        path.resolve(process.cwd(), "templates", "triage.json")
    );
    assert.equal(
        resolveTriagePath(""),
        path.resolve(process.cwd(), "templates", "word_inventory_expansion_triage.json")
    );
});

test("loadTriageDecisions selects decisions by level and source label", () => {
    const decisions = loadTriageDecisions({
        triagePath: "templates/word_inventory_expansion_triage.json",
        level: 5,
        sourceLabel: "jlptstudy.net-n5",
    });

    assert.equal(decisions["男の子|おとこのこ"].decision, "keep_candidate");
    assert.equal(decisions["行く|ゆく"].decision, "reject_candidate");
});
