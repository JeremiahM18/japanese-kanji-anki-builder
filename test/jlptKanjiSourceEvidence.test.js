const test = require("node:test");
const assert = require("node:assert/strict");

const {
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

function buildConfidenceLabels() {
    return {
        high_confidence: {
            label: "high_confidence",
            releaseMeaning: "Fixture high confidence label.",
            blocksRelease: false,
        },
        standard_confidence: {
            label: "standard_confidence",
            releaseMeaning: "Fixture standard confidence label.",
            blocksRelease: false,
        },
        disputed: {
            label: "disputed",
            releaseMeaning: "Fixture disputed confidence label.",
            blocksRelease: true,
        },
        weak_evidence: {
            label: "weak_evidence",
            releaseMeaning: "Fixture weak confidence label.",
            blocksRelease: true,
        },
        unknown: {
            label: "unknown",
            releaseMeaning: "Fixture unknown confidence label.",
            blocksRelease: true,
        },
    };
}

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
        sources: {
            tanos: {
                name: "Tanos",
                tier: "community",
                status: "active",
                sourceType: "jlpt-kanji-list",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            },
            jlptsensei: {
                name: "JLPT Sensei",
                tier: "community",
                status: "active",
                sourceType: "jlpt-kanji-list",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            },
            textbook: {
                name: "Japanese textbook consensus",
                tier: "japanese-published",
                status: "active",
                sourceType: "manual-consensus",
                independent: true,
                japanesePublished: true,
                countsForConsensus: true,
                weight: 2,
                licenseStatus: "restricted",
            },
            joyo_grade: {
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

test("normalizeJlptKanjiSourceEvidence requires governed confidence labels", () => {
    assert.throws(() => normalizeJlptKanjiSourceEvidence({
        version: 1,
        sourceTiers: {},
        sources: {},
    }), /Missing JLPT kanji confidence labels/);
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
    assert.equal(result.confidenceLabel, "high_confidence");
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
        policy: {
            minimumIndependentSources: 2,
            minimumJapanesePublishedSources: 0,
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                independenceGroup: "shared-list",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            },
            source_b: {
                name: "Source B",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                independenceGroup: "shared-list",
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "approved",
            },
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

test("evaluateKanjiSourceEvidence ignores planned sources until activated", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
        confidenceLabels: buildConfidenceLabels(),
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
            planned_source: {
                name: "Planned source",
                tier: "fixture",
                status: "planned",
                sourceType: "fixture",
                independent: true,
                japanesePublished: false,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "needs_review",
            },
        },
        assignments: {
            planned_source: { 日: 5 },
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
            unapproved_source: {
                name: "Unapproved Source",
                tier: "fixture",
                status: "active",
                sourceType: "fixture",
                independent: true,
                countsForConsensus: true,
                weight: 1,
                licenseStatus: "needs_review",
            },
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
        confidenceLabel: "high_confidence",
        sourceConsensusLevel: 5,
        consensusLevel: 5,
        agreementScore: 1,
        agreementCount: 3,
        assignmentCount: 3,
        independentSourceCount: 3,
        japanesePublishedSourceCount: 1,
        disagreementSources: [],
        currentContractMatchesConsensus: true,
        reviewedSources: [
            {
                sourceId: "tanos",
                level: 5,
                tier: "community",
                tierLabel: "Tier 2 - Community source",
                citation: undefined,
                evidenceRef: undefined,
                notes: undefined,
            },
            {
                sourceId: "jlptsensei",
                level: 5,
                tier: "community",
                tierLabel: "Tier 2 - Community source",
                citation: undefined,
                evidenceRef: undefined,
                notes: undefined,
            },
            {
                sourceId: "textbook",
                level: 5,
                tier: "japanese-published",
                tierLabel: "Tier 1 - Japanese-published source",
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
    assert.match(text, /Confidence labels:/);
    assert.match(text, /Current contract comparison samples \(1 shown\):/);
    assert.match(text, /- 日: current N5; consensus none; agreement 0\/0; disagreements none; confidence unknown; matches no/);
    assert.match(text, /Missing evidence: 1/);
});

test("auditJlptKanjiSourceEvidence parseArgs accepts evidence strict json and limit", () => {
    const options = parseArgs([
        "--evidence=templates/custom.json",
        "--strict",
        "--json",
        "--limit=5",
    ]);

    assert.equal(options.evidence, "templates/custom.json");
    assert.equal(options.strict, true);
    assert.equal(options.json, true);
    assert.equal(options.limit, 5);
});
