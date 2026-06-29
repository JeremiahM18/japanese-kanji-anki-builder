const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseArgs,
    slimKanjiSapphireEntry,
} = require("../scripts/slimKanjiSapphireReviewSets");

test("slimKanjiSapphireEntry removes Gold-owned and Platinum-only fields only", () => {
    const entry = {
        kanji: "日",
        readingIncludes: ["ひ"],
        meaningIncludes: ["day"],
        exampleIncludes: ["雨の日です。"],
        notesIncludes: ["日本"],
        kanjiMeaningsIncludes: ["day", "sun"],
        levelIncludes: ["N5"],
        sourceEvidence: [{ type: "japanese-source", source: "fixture", detail: "fixture" }],
        internalChecks: [{ type: "generated-surface", source: "fixture", detail: "fixture" }],
        reviewEvidence: [{ type: "manual-review", source: "fixture", detail: "fixture" }],
        qualityGates: { belongsInKanjiDeck: true },
        sapphireReviewAudit: { auditType: "fixture" },
    };
    const goldEntry = {
        kanji: "日",
        readingIncludes: ["ひ"],
        meaningIncludes: ["day"],
        exampleIncludes: ["雨の日です。"],
        notesIncludes: ["日本"],
    };

    const slimmed = slimKanjiSapphireEntry(entry, goldEntry);

    assert.equal(slimmed.readingIncludes, undefined);
    assert.equal(slimmed.meaningIncludes, undefined);
    assert.equal(slimmed.exampleIncludes, undefined);
    assert.equal(slimmed.notesIncludes, undefined);
    assert.equal(slimmed.qualityGates, undefined);
    assert.deepEqual(slimmed.kanjiMeaningsIncludes, ["day", "sun"]);
    assert.deepEqual(slimmed.levelIncludes, ["N5"]);
    assert.deepEqual(slimmed.sourceEvidence, entry.sourceEvidence);
    assert.deepEqual(slimmed.internalChecks, entry.internalChecks);
    assert.deepEqual(slimmed.reviewEvidence, entry.reviewEvidence);
    assert.deepEqual(slimmed.sapphireReviewAudit, entry.sapphireReviewAudit);
});

test("kanji Sapphire slimming args default to dry-run across all levels", () => {
    assert.deepEqual(parseArgs([]), {
        json: false,
        levels: [5, 4, 3, 2, 1],
        unknownArgs: [],
        write: false,
    });
    assert.deepEqual(parseArgs(["--levels=5,3", "--json", "--write"]), {
        json: true,
        levels: [5, 3],
        unknownArgs: [],
        write: true,
    });
});
