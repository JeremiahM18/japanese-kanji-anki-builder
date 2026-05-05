const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceEvidenceImport,
    countChangedAssignments,
    formatEvidenceManifestJson,
    materializeKanjiEvidenceEntries,
    sortAssignments,
} = require("../src/services/jlptKanjiSourceImportService");
const {
    formatImportReport,
    parseArgs,
} = require("../scripts/importJlptKanjiSourceInput");

test("sortAssignments keeps source evidence deterministic by normalized level and kanji", () => {
    assert.deepEqual(sortAssignments({
        日: { level: 5, reviewStatus: "reviewed" },
        亜: { level: 1, reviewStatus: "reviewed" },
        語: { level: 4, reviewStatus: "reviewed" },
    }), {
        亜: { level: 1, reviewStatus: "reviewed", citation: undefined, evidenceRef: undefined, notes: undefined },
        語: { level: 4, reviewStatus: "reviewed", citation: undefined, evidenceRef: undefined, notes: undefined },
        日: { level: 5, reviewStatus: "reviewed", citation: undefined, evidenceRef: undefined, notes: undefined },
    });
});

test("buildJlptKanjiSourceEvidenceImport replaces only the selected source assignments", () => {
    const evidenceManifest = {
        version: 1,
        sources: {
            kanjidic2_legacy: { name: "KANJIDIC2" },
            other_source: { name: "Other" },
        },
        assignments: {
            kanjidic2_legacy: {
                古: { level: 1, reviewStatus: "reviewed" },
            },
            other_source: {
                日: { level: 5, reviewStatus: "reviewed" },
            },
        },
    };

    const result = buildJlptKanjiSourceEvidenceImport({
        evidenceManifest,
        sourceId: "kanjidic2_legacy",
        assignments: {
            日: {
                level: 5,
                reviewStatus: "reviewed",
                citation: "Fixture citation",
                evidenceRef: "fixture:日",
                notes: "Fixture notes",
            },
        },
    });

    assert.equal(result.summary.importedAssignmentCount, 1);
    assert.equal(result.summary.previousAssignmentCount, 1);
    assert.equal(result.summary.changedAssignmentCount, 2);
    assert.deepEqual(result.manifest.assignments.other_source, evidenceManifest.assignments.other_source);
    assert.deepEqual(result.manifest.assignments.kanjidic2_legacy.日, {
        level: 5,
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:日",
        notes: "Fixture notes",
    });
});

test("source import helpers count changes and serialize stable JSON", () => {
    assert.equal(countChangedAssignments(
        { 日: { level: 5 } },
        { 日: { level: 5 }, 語: { level: 4 } }
    ), 1);
    assert.equal(formatEvidenceManifestJson({ version: 1 }), "{\n  \"version\": 1\n}\n");
});

test("materializeKanjiEvidenceEntries keeps declared consensus aligned with active assignments", () => {
    const evidenceManifest = {
        version: 1,
        policy: {
            minimumIndependentSources: 2,
            minimumJapanesePublishedSources: 0,
        },
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture tier.",
            },
        },
        confidenceLabels: {
            high_confidence: { label: "high_confidence", releaseMeaning: "High.", blocksRelease: false },
            standard_confidence: { label: "standard_confidence", releaseMeaning: "Standard.", blocksRelease: false },
            disputed: { label: "disputed", releaseMeaning: "Disputed.", blocksRelease: true },
            weak_evidence: { label: "weak_evidence", releaseMeaning: "Weak.", blocksRelease: true },
            unknown: { label: "unknown", releaseMeaning: "Unknown.", blocksRelease: true },
        },
        sources: {
            current_operational_contract: {
                name: "Current",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: false,
                countsForConsensus: true,
                licenseStatus: "approved",
            },
            kanjidic2_legacy: {
                name: "KANJIDIC2",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
            },
        },
        assignments: {
            current_operational_contract: {
                日: { level: 5, reviewStatus: "reviewed" },
                語: { level: 4, reviewStatus: "reviewed" },
            },
            kanjidic2_legacy: {
                日: {
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "Fixture citation",
                    evidenceRef: "fixture:日",
                    notes: "Fixture notes",
                },
                語: {
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "Fixture citation",
                    evidenceRef: "fixture:語",
                    notes: "Fixture notes",
                },
            },
        },
        kanji: {
            日: { confidence: "weak_evidence" },
            語: { confidence: "weak_evidence", consensusLevel: "N4" },
        },
    };

    const materialized = materializeKanjiEvidenceEntries({
        evidenceManifest,
        contract: { kanjiLevels: { 日: 5, 語: 4 } },
    });

    assert.equal(materialized.kanji.日.consensusLevel, "N5");
    assert.equal(materialized.kanji.日.agreementScore, 1);
    assert.equal(materialized.kanji.日.sources.kanjidic2_legacy.notes, "Fixture notes");
    assert.equal(materialized.kanji.語.consensusLevel, undefined);
    assert.equal(materialized.kanji.語.confidence, "disputed");
    assert.match(materialized.kanji.語.notes, /disagree/);
});

test("importJlptKanjiSourceInput script parses args and formats read-only scope", () => {
    const options = parseArgs([
        "--source=kanjidic2_legacy",
        "--config=templates/custom-inputs.json",
        "--contract=templates/custom-contract.json",
        "--evidence=templates/custom-evidence.json",
        "--write",
        "--json",
    ]);

    assert.equal(options.source, "kanjidic2_legacy");
    assert.equal(options.config, "templates/custom-inputs.json");
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.evidence, "templates/custom-evidence.json");
    assert.equal(options.write, true);
    assert.equal(options.json, true);

    const text = formatImportReport({
        sourceId: "kanjidic2_legacy",
        write: false,
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        preflightValid: true,
        summary: {
            importedAssignmentCount: 1479,
            previousAssignmentCount: 0,
            changedAssignmentCount: 1479,
        },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /does not move kanji, move words, update decks, or change readiness/);
});
