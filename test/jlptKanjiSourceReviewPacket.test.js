const test = require("node:test");
const assert = require("node:assert/strict");

const {
    PACKET_SCHEMA,
    buildJlptKanjiSourceReviewPacket,
    compactWorklistRow,
    formatJlptKanjiSourceReviewPacket,
    hasSelectedSourceResolution,
    hasSupportedReviewLevel,
    parseArgs,
    summarizePriorityCounts,
} = require("../scripts/reportJlptKanjiSourceReviewPacket");

test("source review packet parses compact JSON options by default", () => {
    const options = parseArgs([
        "--source=shin_kanzen_master_kanji",
        "--limit=8",
        "--text",
    ]);

    assert.equal(options.source, "shin_kanzen_master_kanji");
    assert.equal(options.limit, 8);
    assert.equal(options.json, false);
});

test("source review packet filters unsupported and already resolved rows", () => {
    const report = {
        reviewWorklist: [
            {
                kanji: "日",
                currentContractLevel: 5,
                reviewPriority: "missing_japanese_published_source",
                reviewReason: "Needs Japanese-published source.",
                reviewLevels: [5],
                sourceCandidateLevels: [5],
                missingFromCurrentSourceLevels: [],
                sourceConsensusLevel: 5,
                confidence: "weak_evidence",
                voteWeights: { 5: 1 },
                assignmentCount: 1,
                independentSourceCount: 1,
                independentEvidenceLineageCount: 1,
                japanesePublishedSourceCount: 0,
                confidenceReasons: ["missing Japanese-published source"],
                reviewedSources: [{ sourceId: "legacy", level: 5 }],
                sourceInputReviews: [],
            },
            {
                kanji: "語",
                currentContractLevel: 4,
                reviewPriority: "missing_japanese_published_source",
                reviewReason: "Needs Japanese-published source.",
                reviewLevels: [4],
                sourceCandidateLevels: [4],
                sourceConsensusLevel: 4,
                sourceInputReviews: [{
                    sourceId: "fixture_source",
                    reviewStatus: "source_access_gap",
                    level: null,
                }],
            },
            {
                kanji: "鬱",
                currentContractLevel: 1,
                reviewPriority: "weak_evidence",
                reviewReason: "Needs more evidence.",
                reviewLevels: [1],
                sourceCandidateLevels: [1],
                sourceConsensusLevel: 1,
                sourceInputReviews: [],
            },
        ],
    };

    const packet = buildJlptKanjiSourceReviewPacket({
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        sourceInputsPath: null,
        sourceId: "fixture_source",
        evidence: {
            sources: {
                fixture_source: {
                    status: "active",
                    sourceKind: "assignment",
                    allowedUse: "manual-citation-only",
                    licenseStatus: "approved",
                    canStoreAssignments: true,
                    countsForConsensus: true,
                },
            },
        },
        report,
        limit: 5,
        generatedAt: "2026-05-12T00:00:00.000Z",
    });

    assert.equal(packet.schema, PACKET_SCHEMA);
    assert.equal(packet.readOnly, true);
    assert.equal(packet.noDeckMutation, true);
    assert.equal(packet.counts.returnedRows, 2);
    assert.deepEqual(packet.rows.map((row) => row.kanji), ["日", "鬱"]);
    assert.deepEqual(packet.rows[0].voteWeights, { N5: 1 });
    assert.match(packet.instructions.join(" "), /does not import evidence/);
});

test("source review packet helpers keep filters and compact rows stable", () => {
    assert.equal(hasSupportedReviewLevel({ reviewLevels: [5] }, new Set([5])), true);
    assert.equal(hasSupportedReviewLevel({ reviewLevels: [5] }, new Set([4])), false);
    assert.equal(hasSelectedSourceResolution({
        sourceInputReviews: [{ sourceId: "source_a", reviewStatus: "reviewed" }],
    }, "source_a"), true);
    assert.deepEqual(summarizePriorityCounts([
        { reviewPriority: "weak_evidence" },
        { reviewPriority: "weak_evidence" },
        { reviewPriority: "missing_evidence" },
    ]), {
        weak_evidence: 2,
        missing_evidence: 1,
    });

    const row = compactWorklistRow({
        kanji: "日",
        currentContractLevel: 5,
        reviewPriority: "missing_evidence",
        reviewLevels: [5, 4],
        sourceCandidateLevels: [4],
        sourceConsensusLevel: null,
        confidence: "unknown",
        reviewedSources: [{ sourceId: "source_a", levelRange: [4, 5] }],
        sourceInputReviews: [{ sourceId: "source_b", reviewStatus: "blocked", level: 5 }],
    });

    assert.equal(row.currentLevel, "N5");
    assert.deepEqual(row.reviewLevels, ["N5", "N4"]);
    assert.deepEqual(row.reviewedSources[0].levelRange, ["N4", "N5"]);
    assert.deepEqual(row.sourceInputReviews[0], {
        sourceId: "source_b",
        status: "blocked",
        level: "N5",
        levelRange: [],
    });
    assert.match(formatJlptKanjiSourceReviewPacket({ counts: { returnedRows: 1 }, rows: [row] }), /日: missing_evidence/);
});
