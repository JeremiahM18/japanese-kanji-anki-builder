const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumKanjiReviewService");
const {
    assertKanjiPlatinumCandidatePreflight,
} = require("../scripts/reviewPlatinumKanjiLevel");

function buildEvidence(types = []) {
    return types.map((type) => ({
        type,
        source: "fixture source",
        detail: `fixture detail for ${type}`,
    }));
}

function buildPlatinumCandidateEntry(overrides = {}) {
    return {
        kanji: "日",
        status: "platinum",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-13",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: buildEvidence(REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES),
        internalChecks: buildEvidence(REQUIRED_KANJI_INTERNAL_CHECK_TYPES),
        reviewEvidence: buildEvidence(REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES),
        ...overrides,
    };
}

test("kanji platinum level script fails fast when required candidate coverage is empty", () => {
    assert.throws(
        () => assertKanjiPlatinumCandidatePreflight({
            entries: [],
            level: 3,
            options: {
                allowEmpty: false,
                requireAllRows: true,
                requireCurrentReviewStandard: true,
            },
        }),
        /N3 has 0 Platinum Candidate entries/
    );
});

test("kanji platinum level script allows intentional empty diagnostic surfaces", () => {
    const result = assertKanjiPlatinumCandidatePreflight({
        entries: [],
        level: 3,
        options: {
            allowEmpty: true,
            requireAllRows: true,
            requireCurrentReviewStandard: true,
        },
    });

    assert.equal(result.candidateCount, 0);
});

test("kanji platinum level script allows real candidate coverage to continue to generated-row checks", () => {
    const result = assertKanjiPlatinumCandidatePreflight({
        entries: [buildPlatinumCandidateEntry()],
        level: 5,
        options: {
            allowEmpty: false,
            requireAllRows: true,
            requireCurrentReviewStandard: true,
        },
    });

    assert.equal(result.candidateCount, 1);
});
