const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    buildStorageManifest,
    buildJlptKanjiSourceEvidenceImport,
    compressAssignmentEvidenceRecords,
    countChangedAssignments,
    formatEvidenceManifestJson,
    formatSourceAssignmentFileJson,
    listChangedAssignments,
    materializeKanjiEvidenceEntries,
    summarizeMaterializedKanjiEvidenceShifts,
    sortAssignments,
} = require("../src/services/jlptKanjiSourceImportService");
const {
    formatImportReport,
    formatMaterializedShiftLine,
    parseArgs,
    run,
} = require("../scripts/importJlptKanjiSourceInput");

function buildFixtureConfidenceLabels() {
    return {
        high_confidence: { releaseMeaning: "High.", blocksRelease: false },
        standard_confidence: { releaseMeaning: "Standard.", blocksRelease: false },
        disputed: { releaseMeaning: "Disputed.", blocksRelease: true },
        weak_evidence: { releaseMeaning: "Weak.", blocksRelease: true },
        unknown: { releaseMeaning: "Unknown.", blocksRelease: true },
    };
}

function buildFixtureConfidenceReasonLabels() {
    return {
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
    };
}

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

test("buildJlptKanjiSourceEvidenceImport ignores storage-order differences for unchanged assignments", () => {
    const evidenceManifest = {
        version: 1,
        sources: {
            source_a: { name: "Source A" },
        },
        assignments: {
            source_a: {
                日: {
                    citation: "Fixture citation",
                    evidenceRef: "fixture:日",
                    notes: "Fixture notes",
                    reviewStatus: "reviewed",
                    level: 5,
                },
            },
        },
    };

    const result = buildJlptKanjiSourceEvidenceImport({
        evidenceManifest,
        sourceId: "source_a",
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

    assert.equal(result.summary.changedAssignmentCount, 0);
    assert.deepEqual(result.summary.changedKanji, []);
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

test("split assignment storage keeps routed sources out of the parent manifest", () => {
    const manifest = {
        version: 1,
        assignmentFiles: {
            source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
        },
        assignments: {
            source_a: {
                日: { level: 5, reviewStatus: "reviewed" },
            },
            source_b: {
                語: { level: 4, reviewStatus: "reviewed" },
            },
        },
    };

    assert.deepEqual(buildStorageManifest(manifest).assignments, {
        source_b: {
            語: { level: 4, reviewStatus: "reviewed" },
        },
    });
    assert.equal(formatSourceAssignmentFileJson({
        sourceId: "source_a",
        assignments: {
            語: { level: 4, reviewStatus: "reviewed" },
            日: { level: 5, reviewStatus: "reviewed" },
        },
    }), [
        "{",
        "  \"sourceId\": \"source_a\",",
        "  \"assignments\": {",
        "    \"語\": {",
        "      \"level\": 4,",
        "      \"reviewStatus\": \"reviewed\"",
        "    },",
        "    \"日\": {",
        "      \"level\": 5,",
        "      \"reviewStatus\": \"reviewed\"",
        "    }",
        "  }",
        "}",
        "",
    ].join("\n"));
});

test("assignment-file serialization deduplicates repeated evidence records without changing row meaning", () => {
    const compressed = compressAssignmentEvidenceRecords({
        日: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Fixture citation with enough repeated source detail to justify a shared evidence record",
            evidenceRef: "fixture:shared-source-page-reference-with-stable-anchor",
            notes: "Shared notes with enough repeated review context to make indirection worthwhile",
        },
        月: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Fixture citation with enough repeated source detail to justify a shared evidence record",
            evidenceRef: "fixture:shared-source-page-reference-with-stable-anchor",
            notes: "Shared notes with enough repeated review context to make indirection worthwhile",
        },
        語: {
            level: 4,
            reviewStatus: "reviewed",
            citation: "Unique citation",
            evidenceRef: "fixture:unique",
            notes: "Unique notes",
        },
        水: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Pair citation with repeated publication and section detail",
            evidenceRef: "fixture:pair-source-page-reference",
            notes: "Water note",
        },
        火: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Pair citation with repeated publication and section detail",
            evidenceRef: "fixture:pair-source-page-reference",
            notes: "Fire note",
        },
        土: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Pair citation with repeated publication and section detail",
            evidenceRef: "fixture:pair-source-page-reference",
            notes: "Earth note",
        },
        金: {
            level: 5,
            reviewStatus: "reviewed",
            citation: "Pair citation with repeated publication and section detail",
            evidenceRef: "fixture:pair-source-page-reference",
            notes: "Metal note",
        },
    });
    const sharedRecordId = compressed.assignments.日.evidenceRecordId;
    const pairRecordId = compressed.assignments.水.evidenceRecordId;

    assert.ok(sharedRecordId);
    assert.equal(compressed.assignments.月.evidenceRecordId, sharedRecordId);
    assert.equal("citation" in compressed.assignments.日, false);
    assert.equal("evidenceRef" in compressed.assignments.日, false);
    assert.equal("notes" in compressed.assignments.日, false);
    assert.deepEqual(compressed.evidenceRecords[sharedRecordId], {
        citation: "Fixture citation with enough repeated source detail to justify a shared evidence record",
        evidenceRef: "fixture:shared-source-page-reference-with-stable-anchor",
        notes: "Shared notes with enough repeated review context to make indirection worthwhile",
    });
    assert.deepEqual(compressed.assignments.語, {
        level: 4,
        reviewStatus: "reviewed",
        citation: "Unique citation",
        evidenceRef: "fixture:unique",
        notes: "Unique notes",
    });
    assert.ok(pairRecordId);
    assert.equal(compressed.assignments.火.evidenceRecordId, pairRecordId);
    assert.equal(compressed.assignments.土.evidenceRecordId, pairRecordId);
    assert.equal(compressed.assignments.金.evidenceRecordId, pairRecordId);
    assert.deepEqual(compressed.evidenceRecords[pairRecordId], {
        citation: "Pair citation with repeated publication and section detail",
        evidenceRef: "fixture:pair-source-page-reference",
    });
    assert.equal(compressed.assignments.水.notes, "Water note");
    assert.equal(compressed.assignments.火.notes, "Fire note");
    assert.equal("citation" in compressed.assignments.水, false);
    assert.equal("evidenceRef" in compressed.assignments.水, false);
});

test("import script writes routed assignment files without embedding split assignments in parent manifest", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-source-import-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const assignmentPath = path.join(tempDir, "jlpt_kanji_source_evidence", "assignments", "source_a.json");
    const evidencePath = path.join(tempDir, "evidence.json");
    const contractPath = path.join(tempDir, "contract.json");
    const configPath = path.join(tempDir, "inputs.json");
    const sourcePath = path.join(tempDir, "source.tsv");
    fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
    fs.writeFileSync(assignmentPath, `${JSON.stringify({ sourceId: "source_a", assignments: {} }, null, 2)}\n`, "utf8");
    fs.writeFileSync(evidencePath, `${JSON.stringify({
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
        confidenceLabels: buildFixtureConfidenceLabels(),
        confidenceReasonLabels: buildFixtureConfidenceReasonLabels(),
        sources: {
            source_a: {
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "restricted",
                allowedUse: "manual-citation-only",
                sourceKind: "assignment",
                canStoreAssignments: true,
                canStoreRawList: false,
                canStoreExcerpts: false,
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
            },
        },
        assignments: {},
        assignmentFiles: {
            source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
        },
        kanji: {
            日: {
                confidence: "unknown",
                agreementScore: 0,
                notes: "Materialized audit note.",
            },
        },
    }, null, 2)}\n`, "utf8");
    fs.writeFileSync(contractPath, `${JSON.stringify({
        version: 1,
        inventoryCounts: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 1,
        },
        kanjiLevels: {
            日: 5,
        },
    }, null, 2)}\n`, "utf8");
    fs.writeFileSync(sourcePath, [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tFixture notes",
        "",
    ].join("\n"), "utf8");
    fs.writeFileSync(configPath, `${JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: false,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            source_a: {
                sourceId: "source_a",
                sourcePath,
                sourceLabel: "Source A",
                format: "tsv",
                kanjiColumn: "kanji",
                levelColumn: "level",
                reviewStatusColumn: "reviewStatus",
                citationColumn: "citation",
                evidenceRefColumn: "evidenceRef",
                notesColumn: "notes",
            },
        },
    }, null, 2)}\n`, "utf8");

    const result = run({
        config: configPath,
        contract: contractPath,
        evidence: evidencePath,
        source: "source_a",
        write: true,
    });
    const parent = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    const assignmentFile = JSON.parse(fs.readFileSync(assignmentPath, "utf8"));

    assert.equal(result.preflightValid, true);
    assert.deepEqual(parent.assignments, {});
    assert.deepEqual(parent.assignmentFiles, {
        source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
    });
    assert.deepEqual(assignmentFile.assignments.日, {
        level: 5,
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:日",
        notes: "Fixture notes",
    });
    assert.equal(parent.kanji.日.consensusLevel, "N5");
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

test("materializeKanjiEvidenceEntries incremental updates match full rematerialization for touched rows", () => {
    const evidenceManifest = {
        version: 1,
        policy: {
            minimumIndependentSources: 2,
            minimumIndependentEvidenceLineages: 0,
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
        confidenceLabels: buildFixtureConfidenceLabels(),
        confidenceReasonLabels: buildFixtureConfidenceReasonLabels(),
        sources: {
            source_a: {
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: "bulk-import",
                sourceKind: "assignment",
                canStoreAssignments: true,
                licenseEvidenceUrl: "https://example.com/source-a-license",
                licenseReviewedAt: "2026-05-05",
            },
            source_b: {
                name: "Source B",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: "bulk-import",
                sourceKind: "assignment",
                canStoreAssignments: true,
                licenseEvidenceUrl: "https://example.com/source-b-license",
                licenseReviewedAt: "2026-05-05",
            },
        },
        assignments: {
            source_a: {
                日: { level: 5, reviewStatus: "reviewed" },
                語: { level: 4, reviewStatus: "reviewed" },
                本: { level: 4, reviewStatus: "reviewed" },
            },
            source_b: {
                日: { level: 5, reviewStatus: "reviewed" },
                語: { level: 4, reviewStatus: "reviewed" },
                本: { level: 4, reviewStatus: "reviewed" },
            },
        },
        kanji: {
            日: { confidence: "unknown", agreementScore: 0, notes: "Stale changed entry." },
            語: { confidence: "unknown", agreementScore: 0, notes: "Stale changed entry." },
            本: { confidence: "unknown", agreementScore: 0, notes: "Stale unchanged entry." },
        },
    };
    const contract = { kanjiLevels: { 日: 5, 語: 4, 本: 4 } };
    const full = materializeKanjiEvidenceEntries({ evidenceManifest, contract });
    const incrementalInput = {
        ...evidenceManifest,
        kanji: {
            ...full.kanji,
            日: evidenceManifest.kanji.日,
            語: evidenceManifest.kanji.語,
        },
    };
    const incremental = materializeKanjiEvidenceEntries({
        evidenceManifest: incrementalInput,
        contract,
        changedKanji: ["日", "語"],
    });
    const summarizeRollup = (entry = {}) => ({
        consensusLevel: entry.consensusLevel || null,
        confidence: entry.confidence,
        agreementScore: entry.agreementScore,
    });

    assert.deepEqual(summarizeRollup(incremental.kanji.日), summarizeRollup(full.kanji.日));
    assert.deepEqual(summarizeRollup(incremental.kanji.語), summarizeRollup(full.kanji.語));
    assert.deepEqual(incremental.kanji.日.sources, full.kanji.日.sources);
    assert.deepEqual(incremental.kanji.語.sources, full.kanji.語.sources);
    assert.deepEqual(incremental.kanji.本, full.kanji.本);
});

test("materializeKanjiEvidenceEntries removes stale rollup sources when source-centric assignments are corrected", () => {
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
        confidenceLabels: buildFixtureConfidenceLabels(),
        confidenceReasonLabels: buildFixtureConfidenceReasonLabels(),
        sources: {
            source_a: {
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "restricted",
                allowedUse: "manual-citation-only",
                sourceKind: "assignment",
                canStoreAssignments: true,
                canStoreRawList: false,
                canStoreExcerpts: false,
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
            },
        },
        assignments: {
            source_a: {
                日: {
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "Fixture citation",
                    evidenceRef: "fixture:日",
                    notes: "Still valid.",
                },
            },
        },
        kanji: {
            月: {
                sources: {
                    source_a: {
                        level: "N5",
                        reviewStatus: "reviewed",
                    },
                },
                consensusLevel: "N5",
                confidence: "standard_confidence",
                agreementScore: 1,
                notes: "Stale removed assignment.",
            },
        },
    };

    const materialized = materializeKanjiEvidenceEntries({
        evidenceManifest,
        contract: { kanjiLevels: { 日: 5, 月: 5 } },
        changedKanji: ["月"],
    });

    assert.deepEqual(materialized.kanji.月.sources, {});
    assert.equal(materialized.kanji.月.consensusLevel, undefined);
    assert.equal(materialized.kanji.月.confidence, "unknown");
    assert.equal(materialized.kanji.月.agreementScore, 0);
});

test("materializeKanjiEvidenceEntries skips work for empty incremental change sets", () => {
    const evidenceManifest = {
        version: 1,
        kanji: {
            日: { confidence: "weak_evidence" },
        },
    };

    assert.equal(materializeKanjiEvidenceEntries({
        evidenceManifest,
        contract: { kanjiLevels: { 日: 5 } },
        changedKanji: [],
    }), evidenceManifest);
});

test("summarizeMaterializedKanjiEvidenceShifts reports only changed rollup fields", () => {
    const shifts = summarizeMaterializedKanjiEvidenceShifts({
        previousManifest: {
            kanji: {
                日: {
                    consensusLevel: "N4",
                    confidence: "weak_evidence",
                    agreementScore: 0.5,
                },
                語: {
                    consensusLevel: "N5",
                    confidence: "weak_evidence",
                    agreementScore: 1,
                },
            },
        },
        nextManifest: {
            kanji: {
                日: {
                    consensusLevel: "N5",
                    confidence: "standard_confidence",
                    agreementScore: 0.75,
                },
                語: {
                    consensusLevel: "N5",
                    confidence: "weak_evidence",
                    agreementScore: 1,
                },
                本: {
                    confidence: "unknown",
                    agreementScore: 0,
                },
            },
        },
        changedKanji: ["語", "日", "日", "本"],
    });

    assert.deepEqual(shifts, [
        {
            kanji: "日",
            consensusLevel: { previous: "N4", next: "N5" },
            confidence: { previous: "weak_evidence", next: "standard_confidence" },
            agreementScore: { previous: 0.5, next: 0.75 },
        },
        {
            kanji: "本",
            confidence: { previous: null, next: "unknown" },
            agreementScore: { previous: null, next: 0 },
        },
    ]);
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
            materializedShiftCount: 1,
            materializedShifts: [
                {
                    kanji: "日",
                    consensusLevel: { previous: "N4", next: "N5" },
                    confidence: { previous: "weak_evidence", next: "standard_confidence" },
                    agreementScore: { previous: 0.6666666666666666, next: 0.75 },
                },
            ],
        },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Materialization: incremental/);
    assert.match(text, /Materialized consensus\/confidence shifts: 1/);
    assert.match(text, /- 日: consensus N4 -> N5; confidence weak_evidence -> standard_confidence; agreement 0.6667 -> 0.75/);
    assert.match(text, /does not move kanji, move words, update decks, or change readiness/);
    assert.equal(formatMaterializedShiftLine({
        kanji: "語",
        consensusLevel: { previous: null, next: "N5" },
    }), "- 語: consensus none -> N5");
});
