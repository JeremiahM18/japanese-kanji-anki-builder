const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    loadJlptKanjiSourceEvidence,
    normalizeJlptKanjiSourceEvidence,
    normalizeJlptLevelAssignmentEntry,
    normalizeJlptLevelAssignment,
} = require("../src/datasets/jlptKanjiSourceEvidence");
const {
    auditJlptKanjiSourceEvidence,
    computeConsensus,
    evaluateKanjiSourceEvidence,
} = require("../src/services/jlptKanjiSourceEvidenceService");
const {
    formatJlptKanjiSourceEvidenceReport,
    parseArgs,
} = require("../scripts/auditJlptKanjiSourceEvidence");

/**
 * @typedef {Record<string, unknown>} SourceFixtureOverrides
 * @typedef {{ allowedUse?: string, sourceKind?: string, overrides?: SourceFixtureOverrides }} NonVotingSourceOptions
 */

function buildConfidenceLabels() {
    return {
        high_confidence: {
            releaseMeaning: "Fixture high confidence label.",
            blocksRelease: false,
        },
        standard_confidence: {
            releaseMeaning: "Fixture standard confidence label.",
            blocksRelease: false,
        },
        disputed: {
            releaseMeaning: "Fixture disputed confidence label.",
            blocksRelease: true,
        },
        weak_evidence: {
            releaseMeaning: "Fixture weak confidence label.",
            blocksRelease: true,
        },
        unknown: {
            releaseMeaning: "Fixture unknown confidence label.",
            blocksRelease: true,
        },
    };
}

function buildConfidenceReasonLabels() {
    return {
        direct_legacy_mapping: { label: "direct", description: "Fixture direct legacy reason." },
        estimated_split_evidence: { label: "estimated", description: "Fixture estimated reason." },
        textbook_agreement: { label: "textbook", description: "Fixture textbook reason." },
        range_evidence_present: { label: "range", description: "Fixture range-present reason." },
        range_evidence_only: { label: "range only", description: "Fixture range-only reason." },
        disputed_source_votes: { label: "disputed", description: "Fixture disputed reason." },
        weak_independence_or_missing_japanese_source: { label: "weak", description: "Fixture weak reason." },
        unknown_no_reviewed_external_evidence: { label: "unknown", description: "Fixture unknown reason." },
        current_contract_mismatch: { label: "mismatch", description: "Fixture mismatch reason." },
        source_confidence_threshold_met: { label: "met", description: "Fixture met reason." },
    };
}

/**
 * @param {SourceFixtureOverrides} [overrides]
 * @returns {SourceFixtureOverrides}
 */
function buildGovernedAssignmentSource(overrides = {}) {
    return {
        allowedUse: "bulk-import",
        sourceKind: "assignment",
        canStoreAssignments: true,
        canStoreRawList: false,
        canStoreExcerpts: false,
        requiresCitation: true,
        positiveEvidenceOnly: false,
        licenseEvidenceUrl: "https://example.com/source-license",
        licenseReviewedAt: "2026-05-05",
        ...overrides,
    };
}

/**
 * @param {NonVotingSourceOptions} [options]
 * @returns {SourceFixtureOverrides}
 */
function buildGovernedNonVotingSource({ allowedUse, sourceKind, overrides = {} } = {}) {
    return {
        allowedUse,
        sourceKind,
        canStoreAssignments: false,
        canStoreRawList: false,
        canStoreExcerpts: false,
        requiresCitation: true,
        positiveEvidenceOnly: false,
        licenseEvidenceUrl: "https://example.com/source-license",
        licenseReviewedAt: "2026-05-05",
        ...overrides,
    };
}

/**
 * @param {Record<string, unknown>} [assignments]
 * @returns {Record<string, unknown>}
 */
function buildEvidence(assignments = {}) {
    return normalizeJlptKanjiSourceEvidence({
        version: 1,
        policy: {
            minimumIndependentSources: 3,
            minimumJapanesePublishedSources: 1,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sourceTiers: {
            community: {
                label: "Tier 2 - Community source",
                rank: 2,
                role: "supporting-evidence",
                description: "Fixture community source tier.",
            },
            "japanese-published": {
                label: "Tier 1 - Japanese-published source",
                rank: 1,
                role: "primary-evidence",
                description: "Fixture Japanese-published source tier.",
            },
            "official-background": {
                label: "Background source",
                rank: 4,
                role: "background-only",
                description: "Fixture background tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            tanos: buildGovernedAssignmentSource({
                name: "Tanos",
                tier: "community",
                status: "active",
                sourceType: "jlpt-kanji-list",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
            jlptsensei: buildGovernedAssignmentSource({
                name: "JLPT Sensei",
                tier: "community",
                status: "active",
                sourceType: "jlpt-kanji-list",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
            textbook: buildGovernedAssignmentSource({
                allowedUse: "manual-citation-only",
                name: "Japanese textbook source",
                tier: "japanese-published",
                status: "active",
                sourceType: "japanese-published-textbook-kanji-review",
                independent: true,
                japanesePublished: true,
                countsForConsensus: true,
                weight: 2,
                licenseStatus: "restricted",
            }),
            joyo_grade: buildGovernedNonVotingSource({
                allowedUse: "background-only",
                sourceKind: "background",
                overrides: {
                    name: "Joyo grade",
                    tier: "official-background",
                    status: "active",
                    sourceType: "official-background",
                    independent: true,
                    japanesePublished: true,
                    countsForConsensus: false,
                    weight: 1,
                    licenseStatus: "needs_review",
                },
            }),
        },
        assignments,
    });
}

test("normalizeJlptLevelAssignment accepts common JLPT level spellings", () => {
    assert.equal(normalizeJlptLevelAssignment(5), 5);
    assert.equal(normalizeJlptLevelAssignment("N4"), 4);
    assert.equal(normalizeJlptLevelAssignment("jlpt n3"), 3);
    assert.equal(normalizeJlptLevelAssignment("bad"), null);
});

test("normalizeJlptKanjiSourceEvidence rejects sources outside governed source tiers", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            approved_tier: {
                label: "Approved tier",
                rank: 1,
                role: "primary-evidence",
                description: "Fixture tier.",
            },
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "missing_tier",
                status: "planned",
                sourceType: "fixture",
            },
        },
    }), /Unknown JLPT kanji source tiers/);
});

test("normalizeJlptKanjiSourceEvidence rejects sources outside governed evidence lineages", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            approved_tier: {
                label: "Approved tier",
                rank: 1,
                role: "primary-evidence",
                description: "Fixture tier.",
            },
        },
        sourceLineages: {
            approved_lineage: {
                label: "Approved lineage",
                role: "direct-legacy-jlpt",
                description: "Fixture lineage.",
            },
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "approved_tier",
                evidenceLineage: "missing_lineage",
                status: "planned",
                sourceType: "fixture",
            },
        },
    }), /Unknown JLPT kanji source lineages/);
});

test("normalizeJlptKanjiSourceEvidence rejects mismatched lineage aliases", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            approved_tier: {
                label: "Approved tier",
                rank: 1,
                role: "primary-evidence",
                description: "Fixture tier.",
            },
        },
        sourceLineages: {
            lineage_a: {
                label: "Lineage A",
                role: "direct-legacy-jlpt",
                description: "Fixture lineage.",
            },
            lineage_b: {
                label: "Lineage B",
                role: "community-study-list",
                description: "Fixture lineage.",
            },
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "approved_tier",
                evidenceLineage: "lineage_a",
                lineage: "lineage_b",
                status: "planned",
                sourceType: "fixture",
            },
        },
    }), /Mismatched JLPT kanji source lineage fields/);
});

test("normalizeJlptKanjiSourceEvidence validates derived source references", () => {
    const base = {
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
    };

    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        ...base,
        sources: {
            derived_source: buildGovernedNonVotingSource({
                allowedUse: "derived-summary",
                sourceKind: "derived",
                overrides: {
                    name: "Derived source",
                    tier: "fixture",
                    status: "active",
                    sourceType: "derived",
                    licenseStatus: "approved",
                    derivedFromSources: ["missing_source"],
                },
            }),
        },
    }), /Unknown JLPT kanji derived source references/);

    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        ...base,
        sources: {
            background_source: buildGovernedNonVotingSource({
                allowedUse: "background-only",
                sourceKind: "background",
                overrides: {
                    name: "Background source",
                    tier: "fixture",
                    status: "active",
                    sourceType: "background",
                    licenseStatus: "approved",
                },
            }),
            derived_source: buildGovernedNonVotingSource({
                allowedUse: "derived-summary",
                sourceKind: "derived",
                overrides: {
                    name: "Derived source",
                    tier: "fixture",
                    status: "active",
                    sourceType: "derived",
                    licenseStatus: "approved",
                    derivedFromSources: ["background_source"],
                },
            }),
        },
    }), /must reference assignment sources/);
});

test("normalizeJlptKanjiSourceEvidence requires governed confidence labels", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {},
        sources: {},
    }), /Missing JLPT kanji confidence labels/);
});

test("normalizeJlptKanjiSourceEvidence defaults to two independent evidence lineages", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
    });

    assert.equal(evidence.policy.minimumIndependentEvidenceLineages, 2);
});

test("normalizeJlptKanjiSourceEvidence requires governed confidence reason labels", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {},
        confidenceLabels: buildConfidenceLabels(),
        sources: {},
    }), /Missing JLPT kanji confidence reason labels/);
});

test("normalizeJlptKanjiSourceEvidence rejects prose-only kanji notes", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        kanji: {
            日: {
                notes: "Manual note without source evidence or materialized audit state.",
            },
        },
    }), /notes require sources or derived audit values/);
});

test("normalizeJlptKanjiSourceEvidence permits kanji notes backed by source or derived audit state", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        kanji: {
            日: {
                sources: {
                    fixture_source: 5,
                },
                notes: "Backed by a source assignment.",
            },
            本: {
                agreementScore: 0,
                confidence: "unknown",
                notes: "Materialized audit note without source assignments yet.",
            },
        },
    });

    assert.equal(evidence.kanji.日.notes, "Backed by a source assignment.");
    assert.equal(evidence.kanji.本.confidence, "unknown");
});

test("normalizeJlptLevelAssignmentEntry preserves reviewed structured evidence", () => {
    assert.deepEqual(normalizeJlptLevelAssignmentEntry({
        level: "N4",
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:n4",
        notes: "Manual review fixture",
    }), {
        level: 4,
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:n4",
        notes: "Manual review fixture",
    });
});

test("normalizeJlptKanjiSourceEvidence keeps source-centric assignments authoritative", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
        },
        assignments: {
            source_a: {
                日: {
                    level: "N5",
                    reviewStatus: "reviewed",
                    evidenceRef: "source_a:fresh",
                    notes: "Fresh source-centric assignment.",
                },
            },
        },
        kanji: {
            日: {
                sources: {
                    source_a: {
                        level: "N5",
                        reviewStatus: "reviewed",
                        evidenceRef: "source_a:stale-materialized-summary",
                        notes: "Stale materialized summary.",
                    },
                },
            },
        },
    });

    assert.deepEqual(evidence.assignments.source_a.日, {
        level: 5,
        reviewStatus: "reviewed",
        citation: undefined,
        evidenceRef: "source_a:fresh",
        notes: "Fresh source-centric assignment.",
    });
});

test("normalizeJlptKanjiSourceEvidence does not resurrect removed source-centric assignments from the materialized rollup", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
            source_b: buildGovernedAssignmentSource({
                name: "Source B",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
        },
        assignments: {
            source_a: {
                日: {
                    level: "N5",
                    reviewStatus: "reviewed",
                    evidenceRef: "source_a:fresh",
                },
            },
        },
        kanji: {
            月: {
                sources: {
                    source_a: {
                        level: "N5",
                        reviewStatus: "reviewed",
                        evidenceRef: "source_a:stale-removed-rollup",
                    },
                },
            },
            火: {
                sources: {
                    source_b: {
                        level: "N4",
                        reviewStatus: "reviewed",
                        evidenceRef: "source_b:legacy-rollup-only",
                    },
                },
            },
        },
    });

    assert.equal(evidence.assignments.source_a.月, undefined);
    assert.equal(evidence.assignments.source_a.日.level, 5);
    assert.deepEqual(evidence.assignments.source_b.火, {
        level: 4,
        reviewStatus: "reviewed",
        citation: undefined,
        evidenceRef: "source_b:legacy-rollup-only",
        notes: undefined,
    });
});

test("loadJlptKanjiSourceEvidence merges split assignment files into normalized evidence", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-source-evidence-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const assignmentDir = path.join(tempDir, "jlpt_kanji_source_evidence", "assignments");
    fs.mkdirSync(assignmentDir, { recursive: true });
    fs.writeFileSync(path.join(assignmentDir, "source_a.json"), JSON.stringify({
        sourceId: "source_a",
        evidenceRecords: {
            fixture_shared: {
                citation: "Fixture citation",
                evidenceRef: "fixture:shared",
                notes: "Fixture notes",
            },
        },
        assignments: {
            日: {
                level: "N5",
                reviewStatus: "reviewed",
                evidenceRecordId: "fixture_shared",
            },
        },
    }, null, 2), "utf8");
    const manifestPath = path.join(tempDir, "evidence.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
        },
        assignments: {},
        assignmentFiles: {
            source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
        },
    }, null, 2), "utf8");

    const evidence = loadJlptKanjiSourceEvidence(manifestPath);

    assert.deepEqual(evidence.assignments.source_a.日, {
        level: 5,
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:shared",
        notes: "Fixture notes",
    });
    assert.deepEqual(evidence.assignmentFiles, {
        source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
    });
});

test("loadJlptKanjiSourceEvidence rejects split assignment files with unknown evidence records", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-source-evidence-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const assignmentDir = path.join(tempDir, "jlpt_kanji_source_evidence", "assignments");
    fs.mkdirSync(assignmentDir, { recursive: true });
    fs.writeFileSync(path.join(assignmentDir, "source_a.json"), JSON.stringify({
        sourceId: "source_a",
        assignments: {
            日: {
                level: "N5",
                reviewStatus: "reviewed",
                evidenceRecordId: "missing_record",
            },
        },
    }, null, 2), "utf8");
    const manifestPath = path.join(tempDir, "evidence.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
        },
        assignments: {},
        assignmentFiles: {
            source_a: "jlpt_kanji_source_evidence/assignments/source_a.json",
        },
    }, null, 2), "utf8");

    assert.throws(
        () => loadJlptKanjiSourceEvidence(manifestPath),
        /references unknown evidence record missing_record/
    );
});

test("computeConsensus detects weighted agreement and ties", () => {
    const consensus = computeConsensus([
        { level: 5, weight: 1 },
        { level: 5, weight: 2 },
        { level: 4, weight: 1 },
    ]);

    assert.equal(consensus.consensusLevel, 5);
    assert.equal(consensus.agreementScore, 0.75);

    const tied = computeConsensus([
        { level: 5, weight: 1 },
        { level: 4, weight: 1 },
    ]);

    assert.equal(tied.consensusLevel, null);
    assert.equal(tied.disputed, true);
});

test("evaluateKanjiSourceEvidence classifies source-backed consensus", () => {
    const evidence = buildEvidence({
        tanos: { 日: 5 },
        jlptsensei: { 日: "N5" },
        textbook: { 日: 5 },
        joyo_grade: { 日: 1 },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 5,
        evidence,
    });

    assert.equal(result.consensusLevel, 5);
    assert.equal(result.confidence, "high_confidence");
    assert.equal(result.contractMatchesConsensus, true);
    assert.equal(result.assignmentCount, 3);
    assert.equal(result.japanesePublishedSourceCount, 1);
});

test("evaluateKanjiSourceEvidence counts unique independent source groups", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        policy: {
            minimumIndependentSources: 2,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                independenceGroup: "shared-list",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
            source_b: buildGovernedAssignmentSource({
                name: "Source B",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                independenceGroup: "shared-list",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
        },
        assignments: {
            source_a: { 日: 5 },
            source_b: { 日: 5 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 5,
        evidence,
    });

    assert.equal(result.assignmentCount, 2);
    assert.equal(result.independentSourceCount, 1);
    assert.equal(result.confidence, "weak_evidence");
});

test("evaluateKanjiSourceEvidence separates publisher independence from evidence lineage", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        sourceLineages: {
            old_jlpt: {
                label: "Old JLPT lineage",
                role: "direct-legacy-jlpt",
                description: "Fixture old JLPT lineage.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        policy: {
            minimumIndependentSources: 2,
            minimumIndependentEvidenceLineages: 2,
            minimumJapanesePublishedSources: 0,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
        sources: {
            source_a: buildGovernedAssignmentSource({
                name: "Publisher A",
                tier: "fixture",
                evidenceLineage: "old_jlpt",
                status: "active",
                sourceType: "fixture",
                independent: true,
                publisherIndependence: "publisher_a",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
            source_b: buildGovernedAssignmentSource({
                name: "Publisher B",
                tier: "fixture",
                evidenceLineage: "old_jlpt",
                status: "active",
                sourceType: "fixture",
                independent: true,
                publisherIndependence: "publisher_b",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            }),
        },
        assignments: {
            source_a: { 日: 5 },
            source_b: { 日: 5 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 5,
        evidence,
    });

    assert.equal(result.independentSourceCount, 2);
    assert.equal(result.independentEvidenceLineageCount, 1);
    assert.equal(result.confidence, "weak_evidence");
});

test("evaluateKanjiSourceEvidence keeps current operational contract comparison-only", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            current_operational_contract: buildGovernedNonVotingSource({
                allowedUse: "operational-comparator",
                sourceKind: "operational",
                overrides: {
                name: "Current contract",
                tier: "fixture",
                status: "active",
                sourceType: "tracked-operational-taxonomy",
                independent: false,
                publisherIndependence: "repository_contract",
                countsForConsensus: false,
                licenseStatus: "approved",
                },
            }),
            external_source: buildGovernedAssignmentSource({
                name: "External source",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
            }),
        },
        assignments: {
            current_operational_contract: { 日: 4 },
            external_source: { 日: 5 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 4,
        evidence,
    });

    assert.equal(result.assignmentCount, 1);
    assert.equal(result.consensusLevel, 5);
    assert.deepEqual(result.agreementSourceIds, ["external_source"]);
    assert.equal(result.contractMatchesConsensus, false);
});

test("evaluateKanjiSourceEvidence preserves range evidence without an exact vote", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        policy: {
            minimumIndependentSources: 1,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            kanjidic2_legacy: buildGovernedAssignmentSource({
                name: "KANJIDIC2 legacy",
                tier: "fixture",
                status: "active",
                sourceType: "legacy-jlpt-kanji-list",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                evidenceLineage: "pre_2010_direct_jlpt",
            }),
        },
        assignments: {
            kanjidic2_legacy: {
                橋: {
                    levelRange: ["N2", "N3"],
                    reviewStatus: "reviewed",
                    citation: "Fixture range citation.",
                },
            },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "橋",
        contractLevel: 2,
        evidence,
    });

    assert.equal(result.assignmentCount, 1);
    assert.equal(result.votingAssignmentCount, 0);
    assert.equal(result.consensusLevel, null);
    assert.deepEqual(result.disagreementSources[0].levelRange, [2, 3]);
    assert.deepEqual(result.confidenceReasons, [
        "range_evidence_only",
        "direct_legacy_mapping",
        "weak_independence_or_missing_japanese_source",
    ]);
});

test("evaluateKanjiSourceEvidence derives Japanese textbook consensus from individual lanes", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {
            textbook: {
                label: "Textbook tier",
                rank: 1,
                role: "primary-evidence",
                description: "Fixture textbook tier.",
            },
        },
        sourceLineages: {
            japanese_published_textbook_review: {
                label: "Japanese textbook review",
                role: "japanese-published-study",
                description: "Fixture textbook lineage.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        policy: {
            minimumIndependentSources: 2,
            minimumIndependentEvidenceLineages: 1,
            minimumJapanesePublishedSources: 1,
        },
        sources: {
            shin_kanzen_master_kanji: buildGovernedAssignmentSource({
                allowedUse: "manual-citation-only",
                name: "Shin Kanzen Master",
                tier: "textbook",
                status: "active",
                sourceType: "japanese-published-textbook-kanji-review",
                independent: true,
                publisherIndependence: "3a_corporation",
                japanesePublished: true,
                countsForConsensus: true,
                licenseStatus: "restricted",
                evidenceLineage: "japanese_published_textbook_review",
            }),
            nihongo_sou_matome_kanji: buildGovernedAssignmentSource({
                allowedUse: "manual-citation-only",
                name: "Nihongo Sou Matome",
                tier: "textbook",
                status: "active",
                sourceType: "japanese-published-textbook-kanji-review",
                independent: true,
                publisherIndependence: "ask_publishing_sou_matome",
                japanesePublished: true,
                countsForConsensus: true,
                licenseStatus: "restricted",
                evidenceLineage: "japanese_published_textbook_review",
            }),
            japanese_textbook_consensus: buildGovernedNonVotingSource({
                allowedUse: "derived-summary",
                sourceKind: "derived",
                overrides: {
                name: "Derived textbook consensus",
                tier: "textbook",
                status: "active",
                sourceType: "derived-textbook-consensus",
                independent: false,
                japanesePublished: true,
                countsForConsensus: false,
                licenseStatus: "restricted",
                evidenceLineage: "japanese_published_textbook_review",
                derivedFromSources: ["shin_kanzen_master_kanji", "nihongo_sou_matome_kanji"],
                },
            }),
        },
        assignments: {
            shin_kanzen_master_kanji: { 語: 4 },
            nihongo_sou_matome_kanji: { 語: 4 },
            japanese_textbook_consensus: { 語: 3 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "語",
        contractLevel: 4,
        evidence,
    });

    assert.equal(result.assignmentCount, 2);
    assert.equal(result.textbookConsensus.consensusLevel, 4);
    assert.deepEqual(result.textbookConsensus.sourceIds, ["shin_kanzen_master_kanji", "nihongo_sou_matome_kanji"]);
    assert.ok(result.confidenceReasons.includes("textbook_agreement"));
});

test("evaluateKanjiSourceEvidence ignores non-active source lifecycle statuses until activated", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        policy: {
            minimumIndependentSources: 1,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            planned_source: buildGovernedAssignmentSource({
                name: "Planned source",
                tier: "fixture",
                status: "planned",
                sourceType: "fixture",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "needs_review",
            }),
            in_review_source: buildGovernedAssignmentSource({
                name: "In-review source",
                tier: "fixture",
                status: "in_review",
                sourceType: "fixture",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "restricted",
            }),
        },
        assignments: {
            planned_source: { 日: 5 },
            in_review_source: { 日: 5 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 5,
        evidence,
    });

    assert.equal(result.assignmentCount, 0);
    assert.equal(result.confidence, "unknown");
});

test("auditJlptKanjiSourceEvidence fails on unreviewed assignments and unapproved active voting sources", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        policy: {
            minimumIndependentSources: 1,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            unapproved_source: buildGovernedAssignmentSource({
                name: "Unapproved Source",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "needs_review",
            }),
        },
        assignments: {
            unapproved_source: {
                日: {
                    level: 5,
                    reviewStatus: "needs_review",
                    citation: "Fixture citation",
                },
            },
        },
    });

    const report = auditJlptKanjiSourceEvidence({
        contract: { kanjiLevels: { 日: 5 } },
        evidence,
        limit: 5,
    });

    assert.equal(report.valid, false);
    assert.equal(report.issueCounts.unreviewedAssignments, 1);
    assert.equal(report.issueCounts.unapprovedActiveSources, 1);
    assert.deepEqual(report.issues.unreviewedAssignments[0], {
        sourceId: "unapproved_source",
        kanji: "日",
        level: 5,
        reviewStatus: "needs_review",
    });
});

test("evaluateKanjiSourceEvidence excludes active sources without assignment-use permission", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        policy: {
            minimumIndependentSources: 1,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            legal_source: buildGovernedAssignmentSource({
                name: "Legal Source",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
            }),
            frequency_source: buildGovernedNonVotingSource({
                allowedUse: "frequency-sanity-only",
                sourceKind: "frequency",
                overrides: {
                    name: "Frequency Source",
                    tier: "fixture",
                    status: "active",
                    sourceType: "frequency",
                    independent: true,
                    countsForConsensus: true,
                    licenseStatus: "approved",
                },
            }),
        },
        assignments: {
            legal_source: { 日: 5 },
            frequency_source: { 日: 4 },
        },
    });

    const result = evaluateKanjiSourceEvidence({
        kanji: "日",
        contractLevel: 5,
        evidence,
    });

    assert.equal(result.assignmentCount, 1);
    assert.equal(result.consensusLevel, 5);
    assert.deepEqual(result.agreementSourceIds, ["legal_source"]);
});

test("auditJlptKanjiSourceEvidence blocks unsafe source-use profiles", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sourceTiers: {
            fixture: {
                label: "Fixture tier",
                rank: 1,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        policy: {
            minimumIndependentSources: 1,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            incomplete_source: {
                name: "Incomplete Source",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: false,
                licenseStatus: "approved",
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
            },
            frequency_source: buildGovernedNonVotingSource({
                allowedUse: "frequency-sanity-only",
                sourceKind: "frequency",
                overrides: {
                    name: "Frequency Source",
                    tier: "fixture",
                    status: "active",
                    sourceType: "frequency",
                    independent: true,
                    countsForConsensus: true,
                    licenseStatus: "approved",
                },
            }),
        },
        assignments: {
            frequency_source: { 日: 5 },
        },
    });

    const report = auditJlptKanjiSourceEvidence({
        contract: { kanjiLevels: { 日: 5 } },
        evidence,
        limit: 5,
    });

    assert.equal(report.valid, false);
    assert.equal(report.issueCounts.missingSourceUseProfile, 1);
    assert.equal(report.issueCounts.illegalConsensusSourceUse, 1);
    assert.equal(report.issueCounts.disallowedStoredAssignments, 1);
    assert.deepEqual(report.issues.illegalConsensusSourceUses[0], {
        sourceId: "frequency_source",
        allowedUse: "frequency-sanity-only",
        sourceKind: "frequency",
        canStoreAssignments: false,
    });
});

test("auditJlptKanjiSourceEvidence emits governed confidence manifest entries", () => {
    const report = auditJlptKanjiSourceEvidence({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: buildEvidence({
            tanos: { 日: 5 },
            jlptsensei: { 日: 5 },
            textbook: { 日: 5 },
        }),
        limit: 5,
    });

    assert.equal(report.kanjiConfidenceManifest.length, 1);
    assert.deepEqual(report.kanjiConfidenceManifest[0], {
        kanji: "日",
        currentContractLevel: 5,
        contractLevel: 5,
        confidence: "high_confidence",
        sourceConsensusLevel: 5,
        consensusLevel: 5,
        agreementScore: 1,
        agreementCount: 3,
        voteWeights: {
            1: 0,
            2: 0,
            3: 0,
            4: 0,
            5: 4,
        },
        assignmentCount: 3,
        votingAssignmentCount: 3,
        independentSourceCount: 3,
        independentEvidenceLineageCount: 3,
        japanesePublishedSourceCount: 1,
        textbookConsensus: {
            sourceId: "japanese_textbook_consensus",
            sourceIds: [],
            assignmentCount: 0,
            votingAssignmentCount: 0,
            consensusLevel: null,
            agreementScore: 0,
            agreementCount: 0,
            agreementSourceIds: [],
            disagreementSources: [],
            disputed: false,
        },
        confidenceReasons: ["source_confidence_threshold_met"],
        disagreementSources: [],
        currentContractMatchesConsensus: true,
        reviewedSources: [
            {
                sourceId: "tanos",
                level: 5,
                tier: "community",
                tierLabel: "Tier 2 - Community source",
                publisherIndependence: "tanos",
                citation: undefined,
                evidenceRef: undefined,
                notes: undefined,
            },
            {
                sourceId: "jlptsensei",
                level: 5,
                tier: "community",
                tierLabel: "Tier 2 - Community source",
                publisherIndependence: "jlptsensei",
                citation: undefined,
                evidenceRef: undefined,
                notes: undefined,
            },
            {
                sourceId: "textbook",
                level: 5,
                tier: "japanese-published",
                tierLabel: "Tier 1 - Japanese-published source",
                publisherIndependence: "textbook",
                citation: undefined,
                evidenceRef: undefined,
                notes: undefined,
            },
        ],
    });
    assert.equal(report.sourceCoverage.tanos.tierLabel, "Tier 2 - Community source");
});

test("auditJlptKanjiSourceEvidence reports agreement counts and disagreement sources", () => {
    const report = auditJlptKanjiSourceEvidence({
        contract: { kanjiLevels: { 日: 5 } },
        evidence: buildEvidence({
            tanos: { 日: 5 },
            jlptsensei: { 日: 4 },
            textbook: { 日: 5 },
        }),
        limit: 5,
    });

    const [entry] = report.kanjiConfidenceManifest;
    assert.equal(entry.currentContractLevel, 5);
    assert.equal(entry.sourceConsensusLevel, 5);
    assert.equal(entry.agreementCount, 2);
    assert.equal(entry.assignmentCount, 3);
    assert.deepEqual(entry.disagreementSources, [
        {
            sourceId: "jlptsensei",
            level: 4,
            tier: "community",
            tierLabel: "Tier 2 - Community source",
        },
    ]);
    assert.equal(entry.currentContractMatchesConsensus, true);
});

test("formatJlptKanjiSourceEvidenceReport renders disputed vote weights outside the main sample", () => {
    const report = auditJlptKanjiSourceEvidence({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 5,
            },
        },
        evidence: buildEvidence({
            tanos: { 学: 5 },
            jlptsensei: { 学: 5 },
            textbook: { 学: 4 },
        }),
        limit: 1,
    });
    const text = formatJlptKanjiSourceEvidenceReport({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        report,
    });

    assert.equal(report.issueCounts.disputedConsensus, 1);
    assert.match(text, /Current contract comparison samples \(1 shown\):/);
    assert.match(text, /- 日: current N5; consensus none/);
    assert.match(text, /Disputed consensus samples \(1 shown\):/);
    assert.match(text, /- 学 \(N5\); votes N5:2, N4:2/);
});

test("auditJlptKanjiSourceEvidence reports missing evidence and mismatches", () => {
    const evidence = buildEvidence({
        tanos: { 日: 5, 学: 4 },
        jlptsensei: { 日: 5, 学: 5 },
        textbook: { 日: 5, 学: 5 },
    });
    const report = auditJlptKanjiSourceEvidence({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 4,
                本: 5,
            },
        },
        evidence,
        limit: 10,
    });

    assert.equal(report.valid, false);
    assert.equal(report.governanceValid, true);
    assert.equal(report.evidenceDepthValid, false);
    assert.equal(report.issueCounts.missingEvidence, 1);
    assert.equal(report.issueCounts.contractConsensusMismatch, 1);
    assert.deepEqual(report.issues.missingEvidence, [{ kanji: "本", contractLevel: 5 }]);
    assert.deepEqual(report.issues.contractConsensusMismatches[0].kanji, "学");
});

test("formatJlptKanjiSourceEvidenceReport renders policy and blocker counts", () => {
    const text = formatJlptKanjiSourceEvidenceReport({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        report: auditJlptKanjiSourceEvidence({
            contract: { kanjiLevels: { 日: 5 } },
            evidence: buildEvidence({}),
            limit: 5,
        }),
    });

    assert.match(text, /JLPT Kanji Source Evidence Audit/);
    assert.match(text, /Overall result: failing/);
    assert.match(text, /Governance result: passing/);
    assert.match(text, /Evidence-depth result: failing/);
    assert.match(text, /Confidence labels:/);
    assert.match(text, /Confidence by contract level:/);
    assert.match(text, /- N5: checked 1; high 0; standard 0; disputed 0; weak 0; unknown 1; mismatches 0/);
    assert.match(text, /Missing\/disagreement work queue by contract level:/);
    assert.match(text, /- N5: checked 1; missing any evidence 1; missing Japanese-published 1; disputed 0; mismatches 0; review queue 1; active agreement but missing Japanese 0/);
    assert.match(text, /Missing\/disagreement work queue samples \(1 shown\):/);
    assert.match(text, /- 日: current N5; consensus none; reasons missing reviewed active evidence, missing Japanese-published source/);
    assert.match(text, /Publisher independence groups:/);
    assert.match(text, /Current contract comparison samples \(1 shown\):/);
    assert.match(text, /- 日: current N5; consensus none; agreement 0\/0; lineages 0; disagreements none; confidence unknown; reasons unknown_no_reviewed_external_evidence; textbook consensus none; matches no/);
    assert.match(text, /Missing evidence: 1/);
});

test("formatJlptKanjiSourceEvidenceReport counts active agreement that is still missing Japanese-published evidence", () => {
    const text = formatJlptKanjiSourceEvidenceReport({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        report: auditJlptKanjiSourceEvidence({
            contract: { kanjiLevels: { 日: 5 } },
            evidence: buildEvidence({
                tanos: { 日: 5 },
                jlptsensei: { 日: 5 },
            }),
            limit: 5,
        }),
    });

    assert.match(text, /- N5: checked 1; missing any evidence 0; missing Japanese-published 1; disputed 0; mismatches 0; review queue 1; active agreement but missing Japanese 1/);
    assert.match(text, /- 日: current N5; consensus N5; reasons missing Japanese-published source; agreement 2\/2; Japanese-published sources 0; confidence weak_evidence/);
});

test("source evidence stays out of deck word and readiness service pipelines", () => {
    const servicesDir = path.join(__dirname, "..", "src", "services");
    const allowedGovernanceModules = new Set([
        "jlptKanjiSourceEvidenceService.js",
        "jlptKanjiSourceImportService.js",
        "jlptKanjiSourceInputService.js",
        "jlptKanjiSourceInputTemplateService.js",
        "jlptKanjiSourceLevelDeltaService.js",
        "jlptTextbookConsensusTemplateService.js",
    ]);
    const offenders = [];

    for (const fileName of fs.readdirSync(servicesDir)) {
        if (!fileName.endsWith(".js") || allowedGovernanceModules.has(fileName)) {
            continue;
        }
        const filePath = path.join(servicesDir, fileName);
        const text = fs.readFileSync(filePath, "utf8");
        if (text.includes("jlptKanjiSourceEvidence")) {
            offenders.push(fileName);
        }
    }

    assert.deepEqual(offenders, []);
});

test("auditJlptKanjiSourceEvidence parseArgs accepts evidence strict json and limit", () => {
    const options = parseArgs([
        "--evidence=templates/custom.json",
        "--governance-strict",
        "--strict",
        "--json",
        "--limit=5",
    ]);

    assert.equal(options.evidence, "templates/custom.json");
    assert.equal(options.governanceStrict, true);
    assert.equal(options.strict, true);
    assert.equal(options.json, true);
    assert.equal(options.limit, 5);
});
