const test = require("node:test");
const assert = require("node:assert/strict");

const { formatWordDeckReadyReport, resolveKanjiTsvPath } = require("../scripts/prepareWordDeck");

test("formatWordDeckReadyReport surfaces reading coverage health alongside vocabulary completion", () => {
    const text = formatWordDeckReadyReport({
        outDir: "C:/repo/out/word-build",
        levels: [5],
        exports: [{ level: 5, rows: 258 }],
        governance: {
            canonicalRows: 258,
            curatedOnlyRows: 0,
            inferredOnlyRows: 0,
        },
        completion: {
            contractInventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 6, "5": 271 },
            starterGovernance: {
                coverageByLevel: { 5: 100 },
                canonicalStarterCounts: { 5: 258 },
                defaultDeckStarterCounts: { 5: 258 },
            },
            readingCoverageContract: {
                explicitCoveragePercentByLevel: { 5: 3.69 },
                explicitCoverageEntriesByLevel: { 5: 10 },
                starterEntriesByLevel: { 5: 271 },
            },
            readingCoverageAuditByLevel: {
                N5: {
                    totalReadings: 344,
                    coveredReadings: 181,
                    distinctGapReadings: 147,
                    variantGapReadings: 16,
                },
            },
        },
        referencedKanjiCount: 166,
        package: {
            rootDir: "C:/repo/out/word-build/package",
            mediaAssetCount: 313,
            mediaCounts: {
                strokeOrder: 165,
                strokeOrderImage: 148,
                strokeOrderAnimation: 165,
                audio: 0,
            },
            ankiPackage: { filePath: null },
        },
        settings: {
            includeInferred: false,
        },
    }, {
        enableAudio: false,
    });

    assert.match(text, /N5 starter governance: 100% \(258\/258\)/);
    assert.match(text, /N5 reading coverage: 52\.6% \(181\/344\)/);
    assert.match(text, /distinct missing targets: 147, variant-style gaps: 16/);
    assert.match(text, /Canonical inventory counts: N5=271, N4=6/);
});

test("resolveKanjiTsvPath points word completion back to the kanji export for the same level", () => {
    assert.equal(
        resolveKanjiTsvPath("C:/repo/out/build", 5),
        "C:\\repo\\out\\build\\exports\\jlpt-n5.tsv"
    );
});
