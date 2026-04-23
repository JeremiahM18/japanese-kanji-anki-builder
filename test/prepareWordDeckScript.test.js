const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
            contractInventoryCounts: { "1": 0, "2": 0, "3": 0, "4": 6, "5": 258 },
            excludedContractCounts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 13 },
            starterGovernance: {
                coverageByLevel: { 5: 100 },
                canonicalStarterCounts: { 5: 258 },
                defaultDeckStarterCounts: { 5: 258 },
            },
            readingCoverageContract: {
                explicitCoveragePercentByLevel: { 5: 3.69 },
                explicitCoverageEntriesByLevel: { 5: 10 },
                starterEntriesByLevel: { 5: 258 },
            },
            readingCoverageAuditByLevel: {
                N5: {
                    totalReadings: 344,
                    coveredReadings: 181,
                    priorLevelCoveredReadings: 0,
                    currentLevelCoveredReadings: 181,
                    distinctGapReadings: 147,
                    variantGapReadings: 16,
                    coverageLabel: "N5",
                    policyAudit: {
                        standaloneViolationCount: 0,
                        badgeViolationCount: 0,
                    },
                    sentenceOrthographyAudit: {
                        suspiciousKanaOnlyCount: 2,
                    },
                    readiness: {
                        status: "incomplete",
                    },
                },
            },
            readingGapTriageByLevel: {
                N5: {
                    editorialReviewItems: 147,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 16,
                },
            },
            trueAnimationCoverage: {
                coveredKanji: 166,
                totalKanji: 166,
                svgFallbackKanji: 0,
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
                trueStrokeOrderAnimation: 165,
                svgStrokeOrderAnimationFallback: 0,
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
    assert.match(text, /N5 readiness status: incomplete/);
    assert.match(text, /N5 reading coverage: 52\.6% \(181\/344\)/);
    assert.match(text, /covered by earlier decks: 0/);
    assert.match(text, /covered by this deck level: 181/);
    assert.match(text, /distinct missing targets: 147, variant-style gaps: 16/);
    assert.match(text, /deck policy: 0 standalone wrong-level cards, 0 missing labels/);
    assert.match(text, /sentence orthography review: 2 suspicious kana-only examples/);
    assert.match(text, /triage backlog: 147 editorial review, 0 promote curated example, 16 defer variant/);
    assert.match(text, /True looping animation coverage: 100% \(166\/166\)/);
    assert.match(text, /True looping animation assets: 165/);
    assert.match(text, /Canonical inventory counts: N5=258, N4=6/);
    assert.match(text, /Tracked source-only exclusions: N5=13, N4=0/);
});

test("resolveKanjiTsvPath points word completion back to the kanji export for the same level", () => {
    assert.equal(
        resolveKanjiTsvPath("C:/repo/out/build", 5),
        path.join("C:/repo/out/build", "exports", "jlpt-n5.tsv")
    );
});
