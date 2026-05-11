const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CANDIDATE_SCOPES,
    buildKanjiDeckPartitionPlan,
    classifyAdditionalEntry,
    formatKanjiDeckPartitionPlan,
    shouldIncludeDeckCandidate,
} = require("../src/services/kanjiDeckPartitionPlanService");

function buildRow(overrides = {}) {
    return {
        kanji: "学",
        currentContractLevel: 4,
        targetLevel: 5,
        confidence: "weak_evidence",
        sourceConsensusLevel: 4,
        sourceIds: ["fixture_source"],
        voteWeights: { 4: 2, 5: 1 },
        ...overrides,
    };
}

function buildFixtureDeltaReport() {
    return {
        byLevel: {
            5: {
                missingSourceCandidatesFromCurrent: [
                    buildRow({
                        kanji: "学",
                        currentContractLevel: 4,
                        targetLevel: 5,
                        confidence: "standard_confidence",
                        sourceConsensusLevel: 4,
                    }),
                    buildRow({
                        kanji: "本",
                        currentContractLevel: 3,
                        targetLevel: 5,
                        confidence: "high_confidence",
                        sourceConsensusLevel: 5,
                    }),
                    buildRow({
                        kanji: "駅",
                        currentContractLevel: 4,
                        targetLevel: 5,
                        confidence: "disputed",
                        sourceConsensusLevel: null,
                    }),
                ],
            },
            4: {
                missingSourceCandidatesFromCurrent: [
                    buildRow({
                        kanji: "校",
                        currentContractLevel: 3,
                        targetLevel: 4,
                        confidence: "weak_evidence",
                        sourceConsensusLevel: null,
                    }),
                ],
            },
        },
    };
}

test("classifyAdditionalEntry separates consensus, non-consensus, and disputed source claims", () => {
    assert.equal(classifyAdditionalEntry(buildRow({ targetLevel: 5, sourceConsensusLevel: 5 })), "source_consensus_candidate");
    assert.equal(classifyAdditionalEntry(buildRow({ targetLevel: 5, sourceConsensusLevel: 4 })), "source_claim_consensus_elsewhere");
    assert.equal(classifyAdditionalEntry(buildRow({ targetLevel: 5, sourceConsensusLevel: null })), "source_claim_no_consensus");
    assert.equal(classifyAdditionalEntry(buildRow({ confidence: "disputed" })), "disputed_source_claim");
});

test("default deck candidates require target-level consensus", () => {
    assert.equal(shouldIncludeDeckCandidate(buildRow({ targetLevel: 5, sourceConsensusLevel: 5 })), true);
    assert.equal(shouldIncludeDeckCandidate(buildRow({ targetLevel: 5, sourceConsensusLevel: 4 })), false);
    assert.equal(shouldIncludeDeckCandidate(buildRow({ targetLevel: 5, sourceConsensusLevel: null })), false);
    assert.equal(shouldIncludeDeckCandidate(buildRow({ confidence: "disputed", sourceConsensusLevel: null })), false);
    assert.equal(shouldIncludeDeckCandidate(buildRow({ confidence: "disputed", sourceConsensusLevel: null }), { includeDisputed: true }), true);
    assert.equal(
        shouldIncludeDeckCandidate(
            buildRow({ targetLevel: 5, sourceConsensusLevel: 4 }),
            { candidateScope: CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS }
        ),
        true
    );
});

test("buildKanjiDeckPartitionPlan keeps core decks separate and excludes non-candidate additions by default", () => {
    const plan = buildKanjiDeckPartitionPlan({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 4,
                駅: 4,
                本: 3,
                校: 3,
            },
        },
        deltaReport: buildFixtureDeltaReport(),
        levels: [5, 4],
    });

    assert.equal(plan.noDeckMutation, true);
    assert.equal(plan.noContractMutation, true);
    assert.equal(plan.logicalDeckCount, 4);
    assert.deepEqual(plan.coreDecks.map((deck) => [deck.deckId, deck.count]), [
        ["core_N5", 1],
        ["core_N4", 2],
    ]);

    const additionalN5 = plan.additionalDecks.find((deck) => deck.deckId === "additional_unverified_N5");
    assert.equal(additionalN5.count, 1);
    assert.equal(additionalN5.sourceCandidateCount, 3);
    assert.equal(additionalN5.nonDeckCandidateExcludedCount, 1);
    assert.equal(additionalN5.disputedExcludedCount, 1);
    assert.deepEqual(additionalN5.entries.map((entry) => entry.kanji), ["本"]);
    assert.deepEqual(additionalN5.entries[0].labels, [
        "additional_unverified_N5",
        "source_claim_N5",
        "source_consensus_candidate",
        "current_core_N3",
        "high_confidence",
    ]);

    assert.equal(plan.collisionReport.safeToExportAsPhysicalDecksWithoutDuplicateNotes, false);
    assert.equal(plan.collisionReport.coreCollisionCount, 1);
    assert.equal(plan.collisionReport.duplicateAdditionalKanjiCount, 0);
});

test("buildKanjiDeckPartitionPlan can include disputed rows explicitly", () => {
    const plan = buildKanjiDeckPartitionPlan({
        contract: {
            kanjiLevels: {
                駅: 4,
            },
        },
        deltaReport: buildFixtureDeltaReport(),
        levels: [5],
        includeDisputed: true,
    });

    const additionalN5 = plan.additionalDecks[0];
    assert.equal(additionalN5.count, 2);
    assert.equal(additionalN5.nonDeckCandidateExcludedCount, 1);
    assert.equal(additionalN5.disputedExcludedCount, 0);
    assert.equal(additionalN5.entries.find((entry) => entry.kanji === "駅").category, "disputed_source_claim");
});

test("buildKanjiDeckPartitionPlan can expose every source claim when requested", () => {
    const plan = buildKanjiDeckPartitionPlan({
        contract: {
            kanjiLevels: {
                一: 5,
                学: 4,
            },
        },
        deltaReport: {
            byLevel: {
                4: {
                    missingSourceCandidatesFromCurrent: [
                        buildRow({
                            kanji: "一",
                            currentContractLevel: 5,
                            targetLevel: 4,
                            confidence: "standard_confidence",
                            sourceConsensusLevel: 5,
                        }),
                    ],
                },
            },
        },
        levels: [4],
    });

    assert.equal(plan.additionalDecks[0].count, 0);
    assert.equal(plan.additionalDecks[0].outOfScopeCount, 1);

    const allClaimsPlan = buildKanjiDeckPartitionPlan({
        contract: {
            kanjiLevels: {
                一: 5,
                学: 4,
            },
        },
        deltaReport: buildSingleN4ClaimReport("一"),
        levels: [4],
        candidateScope: CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS,
    });
    assert.equal(allClaimsPlan.additionalDecks[0].count, 1);
});

function buildSingleN4ClaimReport(kanji) {
    return {
        byLevel: {
            4: {
                missingSourceCandidatesFromCurrent: [
                    buildRow({
                        kanji,
                        currentContractLevel: 5,
                        targetLevel: 4,
                        confidence: "standard_confidence",
                        sourceConsensusLevel: 5,
                    }),
                ],
            },
        },
    };
}

test("formatKanjiDeckPartitionPlan reports mutation and duplicate guards", () => {
    const plan = buildKanjiDeckPartitionPlan({
        contract: {
            kanjiLevels: {
                日: 5,
                学: 4,
                本: 3,
            },
        },
        deltaReport: buildFixtureDeltaReport(),
        levels: [5],
    });

    const output = formatKanjiDeckPartitionPlan(plan, { limit: 1 });
    assert.match(output, /No deck mutation: yes/);
    assert.match(output, /No contract mutation: yes/);
    assert.match(output, /Candidate scope: learner-additions-only/);
    assert.match(output, /additional_unverified_N5: 1 included; 0 out of product-addition scope; 1 non-deck candidates excluded; 1 disputed excluded/);
    assert.match(output, /physical ten-deck export safe without duplicate notes: no/);
});
