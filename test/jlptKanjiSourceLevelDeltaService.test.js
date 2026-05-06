const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const {
    buildJlptKanjiSourceLevelDeltaReport,
} = require("../src/services/jlptKanjiSourceLevelDeltaService");
const {
    formatJlptKanjiSourceLevelDeltaReport,
    parseArgs,
} = require("../scripts/auditJlptKanjiSourceLevelDeltas");

function buildConfidenceLabels() {
    return {
        high_confidence: { releaseMeaning: "High.", blocksRelease: false },
        standard_confidence: { releaseMeaning: "Standard.", blocksRelease: false },
        disputed: { releaseMeaning: "Disputed.", blocksRelease: true },
        weak_evidence: { releaseMeaning: "Weak.", blocksRelease: true },
        unknown: { releaseMeaning: "Unknown.", blocksRelease: true },
    };
}

function buildConfidenceReasonLabels() {
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

function buildAssignmentSource(overrides = {}) {
    return {
        allowedUse: "bulk-import",
        sourceKind: "assignment",
        canStoreAssignments: true,
        canStoreRawList: false,
        canStoreExcerpts: false,
        requiresCitation: true,
        positiveEvidenceOnly: false,
        licenseEvidenceUrl: "https://example.com/license",
        licenseReviewedAt: "2026-05-05",
        ...overrides,
    };
}

function buildFixtureEvidence() {
    return normalizeJlptKanjiSourceEvidence({
        version: 1,
        policy: {
            minimumIndependentSources: 2,
            minimumIndependentEvidenceLineages: 0,
            minimumJapanesePublishedSources: 0,
        },
        sourceTiers: {
            fixture: {
                label: "Fixture source tier",
                rank: 2,
                role: "supporting-evidence",
                description: "Fixture source tier.",
            },
        },
        confidenceLabels: buildConfidenceLabels(),
        confidenceReasonLabels: buildConfidenceReasonLabels(),
        sources: {
            kanjidic2_legacy: buildAssignmentSource({
                name: "KANJIDIC2",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
            tanos_legacy_direct: buildAssignmentSource({
                name: "Tanos",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                licenseStatus: "approved",
            }),
            background_source: {
                name: "Background",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: "background-only",
                sourceKind: "background",
                canStoreAssignments: false,
                licenseEvidenceUrl: "https://example.com/license",
                licenseReviewedAt: "2026-05-05",
            },
        },
        assignments: {
            kanjidic2_legacy: {
                日: 5,
                学: 5,
                本: 5,
            },
            tanos_legacy_direct: {
                日: 5,
                学: 4,
            },
            background_source: {
                本: 4,
            },
        },
    });
}

test("buildJlptKanjiSourceLevelDeltaReport exposes source-level candidates outside the current contract", () => {
    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 4,
                本: 3,
            },
        },
        evidence: buildFixtureEvidence(),
        limit: 10,
    });

    assert.equal(report.valid, true);
    assert.equal(report.noDeckMutation, true);
    assert.equal(report.byLevel[5].currentContractCount, 1);
    assert.equal(report.byLevel[5].sourceCandidateCount, 3);
    assert.equal(report.byLevel[5].sourceConsensusCount, 2);
    assert.deepEqual(report.byLevel[5].sourceClaimCounts, {
        kanjidic2_legacy: 3,
        tanos_legacy_direct: 1,
    });
    assert.deepEqual(report.byLevel[5].sourceClaimsOutsideCurrent.map((row) => row.kanji), ["学", "本"]);
    assert.deepEqual(report.byLevel[5].sourceConsensusOutsideCurrent.map((row) => row.kanji), ["本"]);
    assert.deepEqual(report.byLevel[5].disputedSourceCandidatesOutsideCurrent.map((row) => row.kanji), ["学"]);
    assert.deepEqual(report.byLevel[4].currentContractConsensusElsewhere.map((row) => row.kanji), []);
    assert.deepEqual(report.byLevel[3].currentContractConsensusElsewhere.map((row) => row.kanji), ["本"]);
});

test("formatJlptKanjiSourceLevelDeltaReport renders source claims and disputed candidates", () => {
    const report = buildJlptKanjiSourceLevelDeltaReport({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 4,
                本: 3,
            },
        },
        evidence: buildFixtureEvidence(),
        limit: 5,
    });
    const text = formatJlptKanjiSourceLevelDeltaReport({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        report,
        level: 5,
    });

    assert.match(text, /JLPT Kanji Source Level Delta Audit/);
    assert.match(text, /No deck mutation: yes/);
    assert.match(text, /N5: current contract 1; source consensus 2; source candidates 3/);
    assert.match(text, /source claims outside current N5: 2/);
    assert.match(text, /- 学: current N4; target N5; sources kanjidic2_legacy; consensus none; confidence disputed; votes N5:1, N4:1/);
    assert.match(text, /- 本: current N3; target N5; sources kanjidic2_legacy; consensus N5; confidence weak_evidence; votes N5:1/);
});

test("auditJlptKanjiSourceLevelDeltas parseArgs supports json level and limit", () => {
    const options = parseArgs([
        "--json",
        "--level=N5",
        "--limit=12",
        "--contract=templates/custom-contract.json",
        "--evidence=templates/custom-evidence.json",
    ]);

    assert.equal(options.json, true);
    assert.equal(options.level, 5);
    assert.equal(options.limit, 12);
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.evidence, "templates/custom-evidence.json");
});
