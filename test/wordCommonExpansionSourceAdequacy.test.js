const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWordCommonExpansionSelectorReport,
    formatWordCommonExpansionSelectorReport,
} = require("../src/services/wordCommonExpansionSelectorService");

function buildManifest() {
    return {
        version: 1,
        checkedAt: "2026-06-21",
        sources: {
            source_n5: {
                name: "Source N5",
                status: "active",
                allowedUse: ["candidate-discovery"],
                local: {
                    path: "source.tsv",
                    format: "tsv",
                    sha256: "placeholder",
                    byteSize: 0,
                    rowCount: 0,
                },
                candidatePolicy: {
                    levels: [5],
                    kanjiScope: "known-jlpt",
                    requireSourceLevel: true,
                },
                licenseUse: {
                    status: "needs_review",
                    notes: "test",
                },
            },
        },
    };
}

test("common expansion report displays source adequacy separately from queue status", () => {
    const sourceText = "written\treading\tmeaning\tjlpt\n水\tみず\twater\tN5\n";
    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        manifest: buildManifest(),
        jlptLevelContract: {
            kanjiLevels: {
                水: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "水|みず": {
                    written: "水",
                    reading: "みず",
                    jlpt: 5,
                },
            },
            excludedWordLevels: {},
        },
        starterEntries: {},
        wordPitchAccentData: {},
        triageDecisionsByLevelSource: {},
        limit: 1,
        placementMode: "vocabulary-level",
        readingExpansionSignalsByLevel: {
            5: {
                reading: {
                    status: "exhausted",
                    activeItems: 0,
                },
                enhancement: {
                    status: "exhausted",
                    keepCandidates: 0,
                    untriagedCandidates: 0,
                },
                placement: {
                    status: "resolved",
                    violationCount: 0,
                },
                fullyExpanded: true,
            },
        },
        sourceAdequacyByLevel: {
            5: {
                checked: 287,
                sourceDepthComplete: false,
                levelUniverseStandardRows: 0,
                sourceOriginNotEvaluatedRows: 287,
                singleSourceFamilyRows: 0,
                multiSourceSupportedRows: 0,
                disputedLevelClaimRows: 0,
            },
        },
        enforceReadingExpansionGate: true,
        readFile: () => Buffer.from(sourceText, "utf8"),
    });

    assert.equal(report.levelReports[0].commonWordQueue.active, true);
    assert.equal(report.levelReports[0].sourceAdequacy.sourceDepthComplete, false);
    const formatted = formatWordCommonExpansionSelectorReport(report);
    assert.match(formatted, /Level source adequacy/);
    assert.match(formatted, /source-depth incomplete/);
});
