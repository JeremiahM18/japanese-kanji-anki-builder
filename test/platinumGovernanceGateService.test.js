const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumKanjiReviewService");
const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumReviewService");
const {
    GOVERNANCE_MARKERS,
    buildManifestGovernancePosture,
    evaluatePlatinumGovernanceGate,
    formatPlatinumGovernanceGateReport,
} = require("../src/services/platinumGovernanceGateService");

function buildKanjiEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "platinum",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        internalChecks: REQUIRED_KANJI_INTERNAL_CHECK_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        reviewEvidence: REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        ...overrides,
    };
}

function buildWordEntry(overrides = {}) {
    return {
        word: "今日",
        status: "platinum",
        readingIncludes: ["きょう"],
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-14",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        notesIncludes: ["Common word."],
        sourceEvidence: REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        internalChecks: REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        reviewEvidence: REQUIRED_WORD_REVIEW_EVIDENCE_TYPES.map((type) => ({ type, source: "fixture", detail: "fixture" })),
        ...overrides,
    };
}

test("manifest governance posture exposes bulk summaries and marker-only example quality automation", () => {
    const posture = buildManifestGovernancePosture({
        kind: "kanji",
        level: 5,
        entries: [
            buildKanjiEntry({ kanji: "日" }),
            buildKanjiEntry({ kanji: "月" }),
        ],
    });

    assert.equal(posture.activeCurrentStandardEntries, 2);
    assert.equal(posture.distinctRevalidationSummaries, 1);
    assert.equal(posture.cardSpecificRevalidationSummaryCount, 0);
    assert.equal(posture.verificationLimitations, 0);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.BULK_TEMPLATE_REVALIDATION_SUMMARY), true);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.CARD_SPECIFIC_REVALIDATION_SUMMARY_MISSING), true);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.EXAMPLE_QUALITY_MANUAL_JUDGMENT_ONLY), true);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.ZERO_VERIFICATION_LIMITATIONS), true);
});

test("manifest governance posture counts word card-specific summaries and limitations", () => {
    const posture = buildManifestGovernancePosture({
        kind: "word",
        level: 5,
        entries: [buildWordEntry({
            revalidationSummary: "Revalidated 今日 and きょう with evidence lanes, generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
            verificationLimitations: [{
                field: "pitchAccent",
                status: "limited_source",
                label: "Pitch accent limited verification",
                reviewNote: "Fixture limitation.",
            }],
        })],
    });

    assert.equal(posture.activeCurrentStandardEntries, 1);
    assert.equal(posture.cardSpecificRevalidationSummaryCount, 1);
    assert.equal(posture.entriesWithVerificationLimitations, 1);
    assert.equal(posture.verificationLimitations, 1);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.CARD_SPECIFIC_REVALIDATION_SUMMARY_MISSING), false);
    assert.equal(posture.markers.includes(GOVERNANCE_MARKERS.ZERO_VERIFICATION_LIMITATIONS), false);
});

test("legacy platinum governance gate allows configured incomplete word coverage but fails dirty reviewed blockers", () => {
    const allowed = evaluatePlatinumGovernanceGate({
        kanjiRereviewReports: [{
            level: 5,
            counts: { blocked_or_failing: 0, needs_substantive_rereview: 1 },
        }],
        wordRereviewReports: [{
            level: 4,
            counts: { blocked_or_failing: 1, needs_substantive_rereview: 1 },
            cards: [{
                blockedOrFailing: true,
                reasons: ["missing active legacy compatibility entry for generated word"],
            }],
        }],
        wordSourcePostureSummary: {
            totals: { missing_governed_source: 0, single_source_family: 1 },
        },
        manifestPostures: [],
        allowedIncompleteWordLevels: [4],
    });

    const dirty = evaluatePlatinumGovernanceGate({
        wordRereviewReports: [{
            level: 4,
            counts: { blocked_or_failing: 1, needs_substantive_rereview: 0 },
            cards: [{
                blockedOrFailing: true,
                reasons: ["internalChecks must include evidence type: audio-review"],
            }],
        }],
        wordSourcePostureSummary: {
            totals: { missing_governed_source: 0, single_source_family: 0 },
        },
        allowedIncompleteWordLevels: [4],
    });

    assert.equal(allowed.passed, true);
    assert.match(allowed.warnings.join("\n"), new RegExp(GOVERNANCE_MARKERS.ALLOWED_INCOMPLETE_WORD_PLATINUM_LEVEL));
    assert.equal(dirty.passed, false);
    assert.match(dirty.issues.join("\n"), /unexpected blocked/);
});

test("legacy platinum governance gate fails missing governed word source evidence", () => {
    const report = evaluatePlatinumGovernanceGate({
        wordSourcePostureSummary: {
            totals: { missing_governed_source: 1, single_source_family: 0 },
        },
    });

    assert.equal(report.passed, false);
    assert.match(report.issues.join("\n"), /missing governed source evidence/);
});

test("formatted legacy platinum governance gate report includes marker table", () => {
    const report = evaluatePlatinumGovernanceGate({
        wordSourcePostureSummary: {
            totals: { missing_governed_source: 0, single_source_family: 1 },
        },
        manifestPostures: [buildManifestGovernancePosture({
            kind: "word",
            level: 5,
            entries: [buildWordEntry()],
        })],
    });
    const formatted = formatPlatinumGovernanceGateReport(report);

    assert.match(formatted, /Legacy Platinum Compatibility Governance Gate/);
    assert.match(formatted, /Governance warnings/);
    assert.match(formatted, /word_source_independence_not_proven/);
    assert.match(formatted, /Example quality automation/);
});
