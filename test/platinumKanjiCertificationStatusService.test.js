const test = require("node:test");
const assert = require("node:assert/strict");

const {
    DEFAULT_LANGUAGE_REVIEW_SCOPE,
    buildPlatinumKanjiCertificationStatusSummary,
    formatPlatinumKanjiCertificationStatusReport,
} = require("../src/services/platinumKanjiCertificationStatusService");

function buildLevelReport(overrides = {}) {
    const cards = overrides.cards || [{
        kanji: "日",
        structuralPassed: true,
        substantiveRereviewProven: true,
        needsSubstantiveRereview: false,
        blockedOrFailing: false,
        status: "substantive_current_standard_review_proven",
        reasons: [],
    }];
    const counts = overrides.counts || {
        current_v3_structural_pass: cards.filter((card) => card.structuralPassed).length,
        substantive_current_standard_review_proven: cards.filter((card) => card.substantiveRereviewProven).length,
        needs_substantive_rereview: cards.filter((card) => card.needsSubstantiveRereview).length,
        blocked_or_failing: cards.filter((card) => card.blockedOrFailing).length,
    };

    return {
        level: overrides.level ?? 5,
        generatedRows: overrides.generatedRows ?? cards.length,
        reviewEntries: overrides.reviewEntries ?? cards.length,
        counts,
        cards,
    };
}

test("kanji certification gate passes only when every generated row has Obsidian proof", () => {
    const summary = buildPlatinumKanjiCertificationStatusSummary([buildLevelReport()]);

    assert.equal(summary.passed, true);
    assert.equal(summary.failureCount, 0);
    assert.equal(summary.certificationGate.languageReviewScope, DEFAULT_LANGUAGE_REVIEW_SCOPE);
});

test("kanji certification gate fails structural Platinum rows that still need Obsidian proof", () => {
    const summary = buildPlatinumKanjiCertificationStatusSummary([buildLevelReport({
        cards: [{
            kanji: "月",
            structuralPassed: true,
            substantiveRereviewProven: false,
            needsSubstantiveRereview: true,
            blockedOrFailing: false,
            status: "needs_substantive_rereview",
            reasons: ["missing_substantive_current_standard_rereview_proof: observed revalidatedAt only"],
        }],
    })]);

    assert.equal(summary.passed, false);
    assert.equal(summary.failureCount, 1);
    assert.deepEqual(Object.keys(summary.failures[0]).sort(), [
        "actual",
        "card",
        "category",
        "evidenceLane",
        "expected",
        "field",
        "level",
        "reviewerAction",
    ].sort());
    assert.equal(summary.failures[0].card, "月");
    assert.equal(summary.failures[0].field, "rereviewProvenance");
    assert.equal(summary.failures[0].evidenceLane, "reviewEvidence.current-standard-review + rereviewProvenance");
    assert.match(summary.failures[0].reviewerAction, /best-effort non-native language-review scope/);
});

test("kanji certification gate turns structural blockers into loud actionable failure objects", () => {
    const summary = buildPlatinumKanjiCertificationStatusSummary([buildLevelReport({
        cards: [{
            kanji: "火",
            structuralPassed: false,
            substantiveRereviewProven: false,
            needsSubstantiveRereview: false,
            blockedOrFailing: true,
            status: "blocked_or_failing",
            reasons: [
                "internalChecks must include evidence type: audio-review",
                "quality gate must be true: audioExactPrimaryReading",
            ],
        }],
    })]);

    assert.equal(summary.passed, false);
    assert.equal(summary.failureCount, 2);
    assert.equal(summary.failures[0].field, "internalChecks");
    assert.equal(summary.failures[0].evidenceLane, "internalChecks");
    assert.equal(summary.failures[1].field, "qualityGates.audioExactPrimaryReading");
    assert.equal(summary.failures[1].expected, "true");
});

test("formatted kanji certification report includes all failed cards and honest language scope", () => {
    const summary = buildPlatinumKanjiCertificationStatusSummary([buildLevelReport({
        cards: [
            {
                kanji: "月",
                structuralPassed: true,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: true,
                blockedOrFailing: false,
                status: "needs_substantive_rereview",
                reasons: ["missing_substantive_current_standard_rereview_proof"],
            },
            {
                kanji: "火",
                structuralPassed: false,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: false,
                blockedOrFailing: true,
                status: "blocked_or_failing",
                reasons: ["sourceEvidence must include evidence type: japanese-source"],
            },
        ],
    })]);
    const formatted = formatPlatinumKanjiCertificationStatusReport(summary);

    assert.match(formatted, /Certification target: Obsidian/);
    assert.match(formatted, /Result: failing/);
    assert.match(formatted, /Language review scope: best_effort_non_native_review/);
    assert.match(formatted, /cannot fully prove natural Japanese/);
    assert.match(formatted, /N5 月; field=rereviewProvenance/);
    assert.match(formatted, /N5 火; field=sourceEvidence/);
    assert.match(formatted, /reviewer action=/);
});
