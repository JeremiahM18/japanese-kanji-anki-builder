const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { normalizeJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const {
    buildJlptKanjiSourceLevelDeltaReport,
} = require("../src/services/jlptKanjiSourceLevelDeltaService");
const {
    buildJsonOutput,
    buildSourceInputReviews,
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
        sourceInputReviews: [
            {
                kanji: "学",
                sourceId: "shin_kanzen_master_kanji",
                reviewStatus: "reviewed",
                level: 4,
            },
            {
                kanji: "本",
                sourceId: "shin_kanzen_master_kanji",
                reviewStatus: "blocked",
            },
        ],
    });

    assert.equal(report.valid, true);
    assert.equal(report.noDeckMutation, true);
    assert.equal(report.byLevel[5].currentContractCount, 1);
    assert.equal(report.byLevel[5].sourceCandidateCount, 3);
    assert.equal(report.byLevel[5].sourceCandidateAlreadyCurrentCount, 1);
    assert.equal(report.byLevel[5].sourceCandidateMissingFromCurrentCount, 2);
    assert.equal(report.byLevel[5].sourceConsensusCount, 2);
    assert.equal(report.byLevel[5].sourceConsensusAlreadyCurrentCount, 1);
    assert.equal(report.byLevel[5].sourceConsensusMissingFromCurrentCount, 1);
    assert.equal(report.byLevel[5].currentRowsWithoutSourceCandidateCount, 0);
    assert.equal(report.byLevel[5].currentRowsWithoutSourceConsensusCount, 0);
    assert.deepEqual(report.byLevel[5].sourceClaimCounts, {
        kanjidic2_legacy: 3,
        tanos_legacy_direct: 1,
    });
    assert.deepEqual(report.byLevel[5].sourceClaimsOutsideCurrent.map((row) => row.kanji), ["学", "本"]);
    assert.deepEqual(report.byLevel[5].sourceClaimsOutsideCurrent[0].sourceInputReviews, [
        {
            sourceId: "shin_kanzen_master_kanji",
            reviewStatus: "reviewed",
            level: 4,
            levelRange: undefined,
        },
    ]);
    assert.deepEqual(report.byLevel[5].missingSourceCandidatesFromCurrent.map((row) => row.kanji), ["学", "本"]);
    assert.deepEqual(report.byLevel[5].sourceConsensusOutsideCurrent.map((row) => row.kanji), ["本"]);
    assert.deepEqual(report.byLevel[5].missingSourceConsensusFromCurrent.map((row) => row.kanji), ["本"]);
    assert.deepEqual(report.byLevel[5].disputedSourceCandidatesOutsideCurrent.map((row) => row.kanji), ["学"]);
    assert.deepEqual(report.byLevel[5].disputedMissingSourceCandidatesFromCurrent.map((row) => row.kanji), ["学"]);
    assert.deepEqual(report.byLevel[5].sourceInputReviewCounts.missingSourceCandidatesFromCurrent, {
        reviewed: 1,
        blocked: 1,
    });
    assert.deepEqual(report.byLevel[5].sourceInputReviewCounts.disputedMissingSourceCandidatesFromCurrent, {
        reviewed: 1,
    });
    assert.deepEqual(report.sourceInputReviewCountsBySource, {
        shin_kanzen_master_kanji: {
            reviewed: 1,
            blocked: 1,
        },
    });
    assert.deepEqual(report.byLevel[4].currentContractConsensusElsewhere.map((row) => row.kanji), []);
    assert.deepEqual(report.byLevel[4].currentRowsWithoutSourceCandidate.map((row) => row.kanji), []);
    assert.deepEqual(report.byLevel[4].currentRowsWithoutSourceConsensus.map((row) => row.kanji), ["学"]);
    assert.deepEqual(report.byLevel[3].currentContractConsensusElsewhere.map((row) => row.kanji), ["本"]);
    assert.deepEqual(report.byLevel[3].currentRowsWithoutSourceCandidate.map((row) => row.kanji), ["本"]);
    assert.deepEqual(report.byLevel[3].currentRowsWithoutSourceConsensus.map((row) => row.kanji), ["本"]);
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
        sourceInputReviews: [
            {
                kanji: "学",
                sourceId: "shin_kanzen_master_kanji",
                reviewStatus: "reviewed",
                level: 4,
            },
        ],
    });
    const text = formatJlptKanjiSourceLevelDeltaReport({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        sourceInputsPath: "templates/jlpt_kanji_source_inputs.json",
        report,
        level: 5,
    });

    assert.match(text, /JLPT Kanji Source Level Delta Audit/);
    assert.match(text, /No deck mutation: yes/);
    assert.match(text, /Local source-input progress: shin_kanzen_master_kanji reviewed:1/);
    assert.match(text, /N5: current contract 1; source candidates 3 \(already current 1, missing from current 2\); source consensus 2 \(already current 1, missing from current 1\)/);
    assert.match(text, /missing from current N5 by active source claim: 2/);
    assert.match(text, /local source-input progress on those missing-claim rows: reviewed:1/);
    assert.match(text, /missing from current N5 by active source consensus: 1/);
    assert.match(text, /missing from current N5 but disputed: 1/);
    assert.match(text, /- 学: current N4; target N5; sources kanjidic2_legacy; consensus none; confidence disputed; votes N5:1, N4:1; local source-input shin_kanzen_master_kanji:reviewed=N4/);
    assert.match(text, /- 本: current N3; target N5; sources kanjidic2_legacy; consensus N5; confidence weak_evidence; votes N5:1/);
});

test("auditJlptKanjiSourceLevelDeltas parseArgs supports json level and limit", () => {
    const options = parseArgs([
        "--json",
        "--level=N5",
        "--limit=12",
        "--contract=templates/custom-contract.json",
        "--evidence=templates/custom-evidence.json",
        "--source-inputs=templates/custom-source-inputs.json",
    ]);

    assert.equal(options.json, true);
    assert.equal(options.level, 5);
    assert.equal(options.limit, 12);
    assert.equal(options.contract, "templates/custom-contract.json");
    assert.equal(options.evidence, "templates/custom-evidence.json");
    assert.equal(options.sourceInputs, "templates/custom-source-inputs.json");
});

test("auditJlptKanjiSourceLevelDeltas parseArgs can disable source input annotations", () => {
    const options = parseArgs(["--no-source-inputs"]);

    assert.equal(options.sourceInputs, null);
});

test("auditJlptKanjiSourceLevelDeltas json output honors the level filter", () => {
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

    const output = buildJsonOutput({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        sourceInputsPath: "templates/jlpt_kanji_source_inputs.json",
        report,
        level: 5,
    });

    assert.deepEqual(Object.keys(output.byLevel), ["5"]);
    assert.equal(output.sourceInputsPath, "templates/jlpt_kanji_source_inputs.json");
    assert.equal(output.byLevel[5].sourceCandidateMissingFromCurrentCount, 2);
    assert.equal(output.byLevel[4], undefined);
});

test("buildSourceInputReviews reads only non-active source input progress", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-source-inputs-"));
    const sourcePath = path.join(tmpDir, "shin.tsv");
    const configPath = path.join(tmpDir, "inputs.json");
    fs.writeFileSync(sourcePath, [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "学\tN4\treviewed\tc\te\t",
        "本\t\tblocked\t\t\t",
        "日\tN5\tneeds_review\t\t\t",
        "",
    ].join("\n"));
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
        },
        inputs: {
            shin_kanzen_master_kanji: {
                sourceId: "shin_kanzen_master_kanji",
                sourcePath,
                sourceLabel: "fixture-shin-kanzen",
                format: "tsv",
                kanjiColumn: "kanji",
                levelColumn: "level",
                reviewStatusColumn: "reviewStatus",
                levelMapping: "new-jlpt-n1-n5",
            },
            tanos_legacy_direct: {
                sourceId: "tanos_legacy_direct",
                sourcePath,
                sourceLabel: "fixture-tanos",
                format: "tsv",
                kanjiColumn: "kanji",
                levelColumn: "level",
                reviewStatusColumn: "reviewStatus",
                levelMapping: "new-jlpt-n1-n5",
            },
        },
    }));

    const reviews = buildSourceInputReviews({
        sourceInputsPath: configPath,
        evidence: {
            sources: {
                shin_kanzen_master_kanji: { status: "in_review" },
                tanos_legacy_direct: { status: "active" },
            },
        },
    });

    assert.deepEqual(reviews, [
        {
            kanji: "学",
            sourceId: "shin_kanzen_master_kanji",
            reviewStatus: "reviewed",
            level: 4,
            levelRange: undefined,
        },
        {
            kanji: "本",
            sourceId: "shin_kanzen_master_kanji",
            reviewStatus: "blocked",
            level: null,
            levelRange: null,
        },
    ]);
});
