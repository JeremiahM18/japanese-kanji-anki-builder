const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildMissingManagedAnimationsReport,
    formatMissingManagedAnimationsReport,
    parseArgs,
} = require("../scripts/reportMissingManagedAnimations");

test("parseArgs supports levels, limit, and json output for missing animation reports", () => {
    const parsed = parseArgs(["--level=1", "--limit=40", "--json"]);
    assert.deepEqual(parsed, {
        levels: [1],
        limit: 40,
        json: true,
        unknownArgs: [],
    });
});

test("buildMissingManagedAnimationsReport lists only kanji missing true animations", async () => {
    const report = await buildMissingManagedAnimationsReport({
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
        },
        mediaRootDir: "unused",
        levels: [5],
        limit: 10,
        loadMediaRowsImpl: async () => [
            {
                kanji: "日",
                strokeOrderAsset: { source: "kanjivg" },
                trueAnimationAsset: null,
            },
            {
                kanji: "本",
                strokeOrderAsset: { source: "kanjivg" },
                trueAnimationAsset: { source: "remote" },
            },
        ],
    });

    assert.equal(report.totalKanji, 2);
    assert.equal(report.missingTrueAnimations, 1);
    assert.equal(report.trueAnimationCoverageCount, 1);
    assert.deepEqual(report.rows, [
        {
            kanji: "日",
            level: 5,
            hasStrokeOrder: true,
            strokeOrderSource: "kanjivg",
            hasTrueAnimation: false,
        },
    ]);
});

test("formatMissingManagedAnimationsReport highlights the remaining animation queue", () => {
    const text = formatMissingManagedAnimationsReport({
        levels: [1],
        totalKanji: 10,
        trueAnimationCoverageCount: 7,
        trueAnimationCoverageRatio: 0.7,
        missingTrueAnimations: 3,
        rows: [
            { kanji: "彪", level: 1, hasStrokeOrder: true, strokeOrderSource: "kanjivg", hasTrueAnimation: false },
            { kanji: "舜", level: 1, hasStrokeOrder: false, strokeOrderSource: null, hasTrueAnimation: false },
        ],
        truncated: true,
        totalMissingRows: 3,
    });

    assert.match(text, /Missing Managed Animations/);
    assert.match(text, /True animation coverage: 7\/10 \(70\.0%\)/);
    assert.match(text, /- 彪 \(N1, static stroke-order present via kanjivg\)/);
    assert.match(text, /- 舜 \(N1, no managed stroke-order asset yet\)/);
    assert.match(text, /Showing 2 of 3 missing true-animation rows/);
    assert.match(text, /approved GitHub animation mirror/);
});
