const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceEvidenceImport,
    countChangedAssignments,
    formatEvidenceManifestJson,
    listChangedAssignments,
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
    assert.deepEqual(result.summary.changedKanji, ["古", "日"]);
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
    assert.deepEqual(listChangedAssignments(
        { 日: { level: 5 }, 語: { level: 4 } },
        { 日: { level: 5 }, 本: { level: 4 } }
    ), ["語", "本"]);
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
            high_confidence: { releaseMeaning: "High.", blocksRelease: false },
            standard_confidence: { releaseMeaning: "Standard.", blocksRelease: false },
            disputed: { releaseMeaning: "Disputed.", blocksRelease: true },
            weak_evidence: { releaseMeaning: "Weak.", blocksRelease: true },
            unknown: { releaseMeaning: "Unknown.", blocksRelease: true },
        },
        confidenceReasonLabels: {
            direct_legacy_mapping: { label: "direct", description: "Direct." },
            estimated_split_evidence: { label: "estimated", description: "Estimated." },
            textbook_agreement: { label: "textbook", description: "Textbook." },
            range_evidence_present: { label: "range", description: "Range present." },
            range_evidence_only: { label: "range only", description: "Range only." },
            disputed_source_votes: { label: "disputed", description: "Disputed." },
            weak_independence_or_missing_japanese_source: { label: "weak", description: "Weak." },
            unknown_no_reviewed_external_evidence: { label: "unknown", description: "Unknown." },
            current_contract_mismatch: { label: "mismatch", description: "Mismatch." },
            source_confidence_threshold_met: { label: "met", description: "Met." },
        },
        sources: {
            current_operational_contract: {
                name: "Current",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: false,
                countsForConsensus: false,
                licenseStatus: "approved",
                allowedUse: "operational-comparator",
                sourceKind: "operational",
                canStoreAssignments: true,
                licenseEvidenceUrl: "templates/jlpt_level_contract.json",
                licenseReviewedAt: "2026-05-05",
            },
            kanjidic2_legacy: {
                name: "KANJIDIC2",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: "bulk-import",
                sourceKind: "assignment",
                canStoreAssignments: true,
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
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
    assert.deepEqual(materialized.kanji.日.sources.kanjidic2_legacy, {
        level: "N5",
        reviewStatus: "reviewed",
    });
    assert.equal(materialized.kanji.語.consensusLevel, "N5");
    assert.equal(materialized.kanji.語.confidence, "weak_evidence");
    assert.match(materialized.kanji.語.notes, /Additional independent/);
});

test("materializeKanjiEvidenceEntries can update only changed kanji rollups", () => {
    const evidenceManifest = {
        version: 1,
        policy: {
            minimumIndependentSources: 1,
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
            high_confidence: { releaseMeaning: "High.", blocksRelease: false },
            standard_confidence: { releaseMeaning: "Standard.", blocksRelease: false },
            disputed: { releaseMeaning: "Disputed.", blocksRelease: true },
            weak_evidence: { releaseMeaning: "Weak.", blocksRelease: true },
            unknown: { releaseMeaning: "Unknown.", blocksRelease: true },
        },
        confidenceReasonLabels: {
            direct_legacy_mapping: { label: "direct", description: "Direct." },
            estimated_split_evidence: { label: "estimated", description: "Estimated." },
            textbook_agreement: { label: "textbook", description: "Textbook." },
            range_evidence_present: { label: "range", description: "Range present." },
            range_evidence_only: { label: "range only", description: "Range only." },
            disputed_source_votes: { label: "disputed", description: "Disputed." },
            weak_independence_or_missing_japanese_source: { label: "weak", description: "Weak." },
            unknown_no_reviewed_external_evidence: { label: "unknown", description: "Unknown." },
            current_contract_mismatch: { label: "mismatch", description: "Mismatch." },
            source_confidence_threshold_met: { label: "met", description: "Met." },
        },
        sources: {
            kanjidic2_legacy: {
                name: "KANJIDIC2",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: "bulk-import",
                sourceKind: "assignment",
                canStoreAssignments: true,
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
            },
        },
        assignments: {
            kanjidic2_legacy: {
                日: {
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "Fixture citation",
                    evidenceRef: "fixture:日",
                    notes: "Fresh notes",
                },
            },
        },
        kanji: {
            日: { confidence: "unknown", agreementScore: 0, notes: "Stale changed entry." },
            語: { confidence: "unknown", agreementScore: 0, notes: "Unchanged entry." },
        },
    };

    const materialized = materializeKanjiEvidenceEntries({
        evidenceManifest,
        contract: { kanjiLevels: { 日: 5, 語: 4 } },
        changedKanji: ["日"],
    });

    assert.equal(materialized.kanji.日.consensusLevel, "N5");
    assert.deepEqual(materialized.kanji.日.sources.kanjidic2_legacy, {
        level: "N5",
        reviewStatus: "reviewed",
    });
    assert.deepEqual(materialized.kanji.語, evidenceManifest.kanji.語);
});

test("importJlptKanjiSourceInput script parses args and formats read-only scope", () => {
    const options = parseArgs([
        "--source=kanjidic2_legacy",
        "--config=templates/custom-inputs.json",
        "--contract=templates/custom-contract.json",
        "--evidence=templates/custom-evidence.json",
        "--write",
        "--full-rematerialize",
        "--json",
    ]);

    assert.equal(options.source, "kanjidic2_legacy");
    assert.equal(options.config, "templates/custom-inputs.json");
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.evidence, "templates/custom-evidence.json");
    assert.equal(options.write, true);
    assert.equal(options.fullRematerialize, true);
    assert.equal(options.json, true);

    const text = formatImportReport({
        sourceId: "kanjidic2_legacy",
        write: false,
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        preflightValid: true,
        fullRematerialize: false,
        summary: {
            importedAssignmentCount: 1479,
            previousAssignmentCount: 0,
            changedAssignmentCount: 1479,
        },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Materialization: incremental/);
    assert.match(text, /does not move kanji, move words, update decks, or change readiness/);
});
