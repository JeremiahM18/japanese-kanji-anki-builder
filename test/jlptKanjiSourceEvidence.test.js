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

function buildEvidence(assignments = {}) {
    return normalizeJlptKanjiSourceEvidence({
        version: 1,
        policy: {
            minimumIndependentSources: 3,
            minimumJapanesePublishedSources: 1,
            standardAgreementScore: 0.67,
            highAgreementScore: 0.8,
        },
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
    assert.equal(result.confidence, "high");
    assert.equal(result.contractMatchesConsensus, true);
    assert.equal(result.assignmentCount, 3);
    assert.equal(result.japanesePublishedSourceCount, 1);
});

test("evaluateKanjiSourceEvidence counts unique independent source groups", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
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
    assert.equal(result.confidence, "weak");
});

test("evaluateKanjiSourceEvidence ignores planned sources until activated", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
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
    assert.equal(result.confidence, "missing");
});

test("auditJlptKanjiSourceEvidence fails on unreviewed assignments and unapproved active voting sources", () => {
    const evidence = normalizeJlptKanjiSourceEvidence({
        version: 1,
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
