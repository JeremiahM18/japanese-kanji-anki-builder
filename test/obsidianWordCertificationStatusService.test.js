const test = require("node:test");
const assert = require("node:assert/strict");

const {
    MANUAL_WORD_REVIEW_BOUNDARY_NOTE,
    OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE,
    buildObsidianWordCertificationStatusSummary,
    formatObsidianWordCertificationStatusReport,
} = require("../src/services/obsidianWordCertificationStatusService");

function buildLevelReport(overrides = {}) {
    const cards = overrides.cards || [{
        identity: "今日|きょう",
        word: "今日",
        reading: "きょう",
        platinumPassed: true,
        substantiveRereviewProven: true,
        needsSubstantiveRereview: false,
        blockedOrFailing: false,
        status: "substantive_current_standard_review_proven",
        reasons: [],
    }];
    const counts = overrides.counts || {
        current_v3_platinum_pass: cards.filter((card) => card.platinumPassed).length,
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

test("word certification gate passes only when every generated row has Obsidian proof", () => {
    const summary = buildObsidianWordCertificationStatusSummary([buildLevelReport()]);

    assert.equal(summary.passed, true);
    assert.equal(summary.failureCount, 0);
    assert.match(summary.certificationGate.contentCertificationBoundary, /non-human governed native\/fluent-quality proof/);
    assert.match(summary.certificationGate.contentCertificationBoundary, /future human\/native review is separate provenance/);
    assert.equal(summary.certificationGate.contentCertificationBoundary, OBSIDIAN_WORD_REVIEW_BOUNDARY_NOTE);
    assert.equal(summary.certificationGate.manualJudgmentBoundary, MANUAL_WORD_REVIEW_BOUNDARY_NOTE);
});

test("word certification gate fails Platinum rows that still need Obsidian proof", () => {
    const summary = buildObsidianWordCertificationStatusSummary([buildLevelReport({
        cards: [{
            identity: "日本|にほん",
            word: "日本",
            reading: "にほん",
            platinumPassed: true,
            substantiveRereviewProven: false,
            currentObsidianProofObserved: false,
            needsSubstantiveRereview: true,
            blockedOrFailing: false,
            status: "needs_substantive_rereview",
            reasons: ["missing_substantive_current_standard_word_rereview_proof: observed revalidatedAt only"],
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
        "currentObsidianProofObserved",
        "reviewerAction",
    ].sort());
    assert.equal(summary.failures[0].card, "日本|にほん");
    assert.equal(summary.failures[0].field, "rereviewProvenance");
    assert.equal(summary.failures[0].currentObsidianProofObserved, false);
    assert.equal(summary.failures[0].evidenceLane, "reviewEvidence.current-standard-review + rereviewProvenance");
    assert.match(summary.failures[0].expected, /full word-card evidence checklist/);
    assert.match(summary.failures[0].reviewerAction, /written form, reading, meaning, example sentence/);
    assert.match(summary.failures[0].reviewerAction, /natural Japanese/);
});

test("word certification failure preserves observed malformed Obsidian proof state", () => {
    const summary = buildObsidianWordCertificationStatusSummary([buildLevelReport({
        cards: [{
            identity: "日本|にほん",
            word: "日本",
            reading: "にほん",
            platinumPassed: true,
            substantiveRereviewProven: false,
            currentObsidianProofObserved: true,
            needsSubstantiveRereview: true,
            blockedOrFailing: false,
            status: "needs_substantive_rereview",
            reasons: ["observed rereviewProvenance without full word-card evidence checklist"],
        }],
    })]);

    assert.equal(summary.failures[0].currentObsidianProofObserved, true);
});

test("word certification gate turns Platinum blockers into loud actionable failure objects", () => {
    const summary = buildObsidianWordCertificationStatusSummary([buildLevelReport({
        cards: [{
            identity: "今日|きょう",
            word: "今日",
            reading: "きょう",
            platinumPassed: false,
            substantiveRereviewProven: false,
            needsSubstantiveRereview: false,
            blockedOrFailing: true,
            status: "blocked_or_failing",
            reasons: [
                "internalChecks must include evidence type: audio-review",
                "quality gate must be true: audioExactWordReading",
                "pitch accent source is missing",
            ],
        }],
    })]);

    assert.equal(summary.passed, false);
    assert.equal(summary.failureCount, 3);
    assert.equal(summary.failures[0].field, "internalChecks");
    assert.equal(summary.failures[0].evidenceLane, "internalChecks");
    assert.equal(summary.failures[1].field, "qualityGates.audioExactWordReading");
    assert.equal(summary.failures[1].expected, "true");
    assert.equal(summary.failures[2].field, "pitchAccent");
});

test("formatted word certification report includes all failed cards and review boundary", () => {
    const summary = buildObsidianWordCertificationStatusSummary([buildLevelReport({
        cards: [
            {
                identity: "日本|にほん",
                word: "日本",
                reading: "にほん",
                platinumPassed: true,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: true,
                blockedOrFailing: false,
                status: "needs_substantive_rereview",
                reasons: ["missing_substantive_current_standard_word_rereview_proof"],
            },
            {
                identity: "今日|きょう",
                word: "今日",
                reading: "きょう",
                platinumPassed: false,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: false,
                blockedOrFailing: true,
                status: "blocked_or_failing",
                reasons: ["sourceEvidence must include evidence type: japanese-source"],
            },
        ],
    })]);
    const formatted = formatObsidianWordCertificationStatusReport(summary);

    assert.match(formatted, /Japanese Kanji Builder Word Obsidian Certification Status/);
    assert.match(formatted, /Certification target: Obsidian/);
    assert.match(formatted, /Result: failing/);
    assert.match(formatted, /full word-card evidence checklist/);
    assert.match(formatted, /Current Obsidian certification is non-human governed native\/fluent-quality proof/);
    assert.match(formatted, /future human\/native review is separate provenance for the same standard/);
    assert.match(formatted, /N5 日本\|にほん; field=rereviewProvenance/);
    assert.match(formatted, /N5 今日\|きょう; field=sourceEvidence/);
    assert.match(formatted, /reviewer action=/);
});
