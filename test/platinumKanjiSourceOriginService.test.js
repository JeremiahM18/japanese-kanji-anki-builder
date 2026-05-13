const test = require("node:test");
const assert = require("node:assert/strict");

const {
    assignmentIncludesLevel,
    parseEntryTargetLevel,
    resolveKanjiSourceOriginIds,
    resolveKanjiSourceOriginIdsForEntry,
} = require("../src/services/platinumKanjiSourceOriginService");

function buildEvidence() {
    return {
        sources: {
            kanjidic2_legacy: {
                status: "active",
                sourceKind: "assignment",
            },
            nihongo_sou_matome_kanji: {
                status: "active",
                sourceKind: "assignment",
            },
            blocked_source: {
                status: "blocked",
                sourceKind: "assignment",
            },
            joyo_grade: {
                status: "active",
                sourceKind: "background",
            },
        },
        assignments: {
            kanjidic2_legacy: {
                安: { level: 5, reviewStatus: "reviewed" },
                田: { level: 4, reviewStatus: "reviewed" },
            },
            nihongo_sou_matome_kanji: {
                安: { levelRange: [4, 5], reviewStatus: "reviewed" },
                田: { level: "N5", reviewStatus: "reviewed" },
            },
            blocked_source: {
                安: { level: 5, reviewStatus: "reviewed" },
            },
            joyo_grade: {
                安: { level: 5, reviewStatus: "reviewed" },
            },
        },
    };
}

test("assignmentIncludesLevel handles exact and range assignments", () => {
    assert.equal(assignmentIncludesLevel({ level: "N5" }, 5), true);
    assert.equal(assignmentIncludesLevel({ level: 4 }, 5), false);
    assert.equal(assignmentIncludesLevel({ levelRange: ["N4", "N5"] }, 5), true);
    assert.equal(assignmentIncludesLevel({ levelRange: [2, 3] }, 5), false);
});

test("resolveKanjiSourceOriginIds returns reviewed placement-origin lanes only", () => {
    assert.deepEqual(resolveKanjiSourceOriginIds({
        evidence: buildEvidence(),
        kanji: "安",
        targetLevel: 5,
    }), [
        "kanjidic2_legacy",
        "nihongo_sou_matome_kanji",
    ]);

    assert.deepEqual(resolveKanjiSourceOriginIds({
        evidence: buildEvidence(),
        kanji: "田",
        targetLevel: 5,
    }), [
        "nihongo_sou_matome_kanji",
    ]);
});

test("resolveKanjiSourceOriginIdsForEntry derives the reviewed level from platinum expectations", () => {
    assert.equal(parseEntryTargetLevel({ levelIncludes: ["JLPT N5"] }), 5);
    assert.deepEqual(resolveKanjiSourceOriginIdsForEntry({
        evidence: buildEvidence(),
        entry: {
            kanji: "田",
            levelIncludes: ["N5"],
        },
    }), [
        "nihongo_sou_matome_kanji",
    ]);
});
