const test = require("node:test");
const assert = require("node:assert/strict");

const {
    MANUAL_SENTENCE_REVIEW_BOUNDARY_NOTE,
    OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE,
    buildObsidianKanjiCertificationStatusSummary,
    formatObsidianKanjiCertificationStatusReport,
} = require("../src/services/obsidianKanjiCertificationStatusService");

function buildLevelReport(overrides = {}) {
    const cards = overrides.cards || [{
        kanji: "日",
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

test("kanji certification gate passes only when every generated row has Obsidian proof", () => {
    const summary = buildObsidianKanjiCertificationStatusSummary([buildLevelReport()]);

    assert.equal(summary.passed, true);
    assert.equal(summary.failureCount, 0);
    assert.match(summary.certificationGate.contentCertificationBoundary, /non-human governed native\/fluent-quality proof/);
    assert.match(summary.certificationGate.contentCertificationBoundary, /future human\/native review is separate provenance/);
    assert.equal(summary.certificationGate.contentCertificationBoundary, OBSIDIAN_KANJI_REVIEW_BOUNDARY_NOTE);
    assert.equal(summary.certificationGate.manualJudgmentBoundary, MANUAL_SENTENCE_REVIEW_BOUNDARY_NOTE);
});

test("kanji certification gate fails Platinum rows that still need Obsidian proof", () => {
    const summary = buildObsidianKanjiCertificationStatusSummary([buildLevelReport({
        cards: [{
            kanji: "月",
            platinumPassed: true,
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
    assert.match(summary.failures[0].expected, /example sentence quality review proof/);
    assert.match(summary.failures[0].reviewerAction, /Inspect and fix the actual example sentence if needed/);
    assert.match(summary.failures[0].reviewerAction, /natural Japanese/);
});

test("kanji certification gate turns Platinum blockers into loud actionable failure objects", () => {
    const summary = buildObsidianKanjiCertificationStatusSummary([buildLevelReport({
        cards: [{
            kanji: "火",
            platinumPassed: false,
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

test("formatted kanji certification report includes all failed cards and sentence-review boundary", () => {
    const summary = buildObsidianKanjiCertificationStatusSummary([buildLevelReport({
        cards: [
            {
                kanji: "月",
                platinumPassed: true,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: true,
                blockedOrFailing: false,
                status: "needs_substantive_rereview",
                reasons: ["missing_substantive_current_standard_rereview_proof"],
            },
            {
                kanji: "火",
                platinumPassed: false,
                substantiveRereviewProven: false,
                needsSubstantiveRereview: false,
                blockedOrFailing: true,
                status: "blocked_or_failing",
                reasons: ["sourceEvidence must include evidence type: japanese-source"],
            },
        ],
    })]);
    const formatted = formatObsidianKanjiCertificationStatusReport(summary);

    assert.match(formatted, /Japanese Kanji Builder Kanji Obsidian Certification Status/);
    assert.match(formatted, /Certification target: Obsidian/);
    assert.match(formatted, /Result: failing/);
    assert.match(formatted, /actual example sentence quality review evidence/);
    assert.match(formatted, /Current Obsidian certification is non-human governed native\/fluent-quality proof/);
    assert.match(formatted, /future human\/native review is separate provenance for the same standard/);
    assert.match(formatted, /N5 月; field=rereviewProvenance/);
    assert.match(formatted, /N5 火; field=sourceEvidence/);
    assert.match(formatted, /reviewer action=/);
});
