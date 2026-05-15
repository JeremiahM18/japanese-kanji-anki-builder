const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiDeckReviewStatus,
    formatKanjiDeckReviewStatus,
} = require("../src/services/kanjiDeckReviewStatusService");
const { CURRENT_KANJI_PLATINUM_REVIEW_STANDARD } = require("../src/services/platinumKanjiReviewService");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function writeTsv(filePath, kanji = []) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, ["Kanji", ...kanji].join("\n") + "\n", "utf8");
}

test("buildKanjiDeckReviewStatus reports core and additional review coverage", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-review-status-"));

    try {
        writeJson(path.join(tempRoot, "templates", "golden_n5_review_set.json"), [{ kanji: "一" }]);
        writeJson(path.join(tempRoot, "templates", "platinum_n5_review_set.json"), [{
            kanji: "一",
            status: "platinum",
            reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            revalidatedAt: "2026-05-13",
            revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
            sourceEvidence: [{
                type: "japanese-source",
                source: "fixture Japanese source",
                detail: "Fixture Japanese source verified 一 card-field truth.",
            }],
            internalChecks: [
                {
                    type: "generated-surface",
                    source: "fixture generated-surface audit",
                    detail: "Fixture generated surface was checked.",
                },
                {
                    type: "golden-regression",
                    source: "fixture golden regression",
                    detail: "Fixture separate golden regression gate was checked and is not source evidence.",
                },
                {
                    type: "media-audit",
                    source: "fixture media audit",
                    detail: "Fixture media audit checked audio and stroke-order media.",
                },
                {
                    type: "audio-review",
                    source: "fixture audio review",
                    detail: "Fixture exact audio identity was checked.",
                },
                {
                    type: "stroke-order-review",
                    source: "fixture stroke-order review",
                    detail: "Fixture stroke-order media target was checked.",
                },
            ],
            reviewEvidence: [{
                type: "current-standard-review",
                source: "fixture current-standard review",
                detail: "Current-standard review with evidence lanes checked the fixture kanji.",
            }, {
                type: "manual-review",
                source: "fixture manual review",
                detail: "Manual reviewer judged the fixture kanji card.",
            }],
            verificationLimitations: [{
                field: "strokeOrderSequence",
                status: "externally_unverified",
                label: "Stroke-order sequence unverified",
                reviewNote: "Fixture limitation.",
            }],
        }]);
        writeJson(path.join(tempRoot, "templates", "golden_n1_review_set.json"), [{ kanji: "亜" }]);
        writeJson(path.join(tempRoot, "templates", "platinum_n1_review_set.json"), [{
            kanji: "亜",
            status: "needs_revalidation",
            previousStatus: "platinum",
            reviewedAt: "2026-05-01",
            reviewer: "fixture-review",
            decisionReason: "Legacy fixture retained only as non-certifying review history.",
        }]);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv"), ["一"]);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n1.tsv"), ["亜"]);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n5.tsv"), []);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n1.tsv"), []);

        const report = buildKanjiDeckReviewStatus({
            rootDir: tempRoot,
            coreOutDir: path.join(tempRoot, "out", "build"),
            additionalOutDir: path.join(tempRoot, "out", "build", "additional_unverified"),
            levels: [5, 1],
            contract: { kanjiLevels: { 一: 5, 亜: 1, 学: 4 } },
            deltaReport: {
                byLevel: {
                    5: {
                        missingSourceCandidatesFromCurrent: [
                            {
                                kanji: "学",
                                currentContractLevel: 4,
                                targetLevel: 5,
                                confidence: "weak_evidence",
                                sourceConsensusLevel: 4,
                                sourceIds: ["fixture_legacy"],
                            },
                            {
                                kanji: "本",
                                currentContractLevel: 4,
                                targetLevel: 5,
                                confidence: "weak_evidence",
                                sourceConsensusLevel: 4,
                                sourceIds: ["fixture_legacy"],
                            },
                        ],
                    },
                    1: {
                        missingSourceCandidatesFromCurrent: [
                            {
                                kanji: "学",
                                currentContractLevel: 4,
                                targetLevel: 1,
                                confidence: "weak_evidence",
                                sourceConsensusLevel: 4,
                                sourceIds: ["fixture_textbook"],
                            },
                        ],
                    },
                },
            },
        });

        const coreN5 = report.rows.find((row) => row.deckId === "core_N5");
        const coreN1 = report.rows.find((row) => row.deckId === "core_N1");
        const additionalN5 = report.rows.find((row) => row.deckId === "additional_unverified_N5");

        assert.equal(coreN5.presentUnique, 1);
        assert.equal(coreN5.goldenCount, 1);
        assert.equal(coreN5.platinumCount, 1);
        assert.equal(coreN5.currentStandardPlatinumCount, 1);
        assert.equal(coreN5.revalidationBacklogCount, 0);
        assert.equal(coreN5.verificationLimitationCount, 1);
        assert.equal(coreN5.verificationLimitationKanjiCount, 1);
        assert.equal(coreN5.verificationLimitationFieldCounts.strokeOrderSequence, 1);
        assert.equal(coreN1.presentUnique, 1);
        assert.equal(coreN1.goldenCount, 1);
        assert.equal(coreN1.platinumCount, 0);
        assert.equal(coreN1.revalidationBacklogCount, 1);
        assert.deepEqual(coreN1.revalidationBacklogKanji, ["亜"]);
        assert.deepEqual(coreN1.missingPlatinum, ["亜"]);
        assert.equal(additionalN5.presentUnique, 0);
        assert.equal(additionalN5.plannedCount, 0);
        assert.equal(additionalN5.goldenCount, 0);
        assert.equal(additionalN5.missingGolden.length, 0);
        assert.equal(report.duplicateAdditionalClaims.duplicateKanjiCount, 1);
        assert.equal(report.duplicateAdditionalClaims.coreRetainedDuplicateKanjiCount, 2);
        assert.equal(report.duplicateAdditionalClaims.suppressedDuplicateClaimCount, 3);
        assert.equal(report.duplicateAdditionalClaims.unresolvedDuplicateKanjiCount, 0);
        assert.equal(report.passed, true);
        assert.match(formatKanjiDeckReviewStatus(report), /duplicate kanji: 1/);
        assert.match(formatKanjiDeckReviewStatus(report), /core N4 retained; no additional duplicate selected/);
        assert.match(formatKanjiDeckReviewStatus(report), /Verification Limitations:/);
        assert.match(formatKanjiDeckReviewStatus(report), /core_N5: 1 limitation\(s\) on 1 active Platinum card\(s\)/);
        assert.match(formatKanjiDeckReviewStatus(report), /Current Std/);
        assert.match(formatKanjiDeckReviewStatus(report), /Revalidation Backlog\/History:/);
        assert.match(formatKanjiDeckReviewStatus(report), /core_N1: 1 non-certifying review-history card\(s\) need current-standard revalidation/);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildKanjiDeckReviewStatus fails unresolved duplicate additional claims without core placement", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-review-status-unresolved-"));

    try {
        writeJson(path.join(tempRoot, "templates", "golden_n5_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "platinum_n5_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "golden_n1_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "platinum_n1_review_set.json"), []);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv"), []);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n1.tsv"), []);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n5.tsv"), []);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n1.tsv"), []);

        const report = buildKanjiDeckReviewStatus({
            rootDir: tempRoot,
            coreOutDir: path.join(tempRoot, "out", "build"),
            additionalOutDir: path.join(tempRoot, "out", "build", "additional_unverified"),
            levels: [5, 1],
            contract: { kanjiLevels: {} },
            deltaReport: {
                byLevel: {
                    5: {
                        missingSourceCandidatesFromCurrent: [
                            {
                                kanji: "仮",
                                currentContractLevel: null,
                                targetLevel: 5,
                                confidence: "weak_evidence",
                                sourceConsensusLevel: 5,
                                sourceIds: ["fixture_legacy"],
                            },
                        ],
                    },
                    1: {
                        missingSourceCandidatesFromCurrent: [
                            {
                                kanji: "仮",
                                currentContractLevel: null,
                                targetLevel: 1,
                                confidence: "weak_evidence",
                                sourceConsensusLevel: 1,
                                sourceIds: ["fixture_textbook"],
                            },
                        ],
                    },
                },
            },
        });

        assert.equal(report.duplicateAdditionalClaims.duplicateKanjiCount, 1);
        assert.equal(report.duplicateAdditionalClaims.coreRetainedDuplicateKanjiCount, 0);
        assert.equal(report.duplicateAdditionalClaims.suppressedDuplicateClaimCount, 2);
        assert.equal(report.duplicateAdditionalClaims.unresolvedDuplicateKanjiCount, 1);
        assert.equal(report.passed, false);
        assert.match(formatKanjiDeckReviewStatus(report), /unresolved duplicate kanji: 1/);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildKanjiDeckReviewStatus keeps all-level duplicate context for scoped reports", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-review-status-scoped-"));

    try {
        writeJson(path.join(tempRoot, "templates", "golden_n4_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "platinum_n4_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "golden_additional_unverified_n4_review_set.json"), []);
        writeJson(path.join(tempRoot, "templates", "platinum_additional_unverified_n4_review_set.json"), []);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n4.tsv"), []);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n4.tsv"), []);

        const report = buildKanjiDeckReviewStatus({
            rootDir: tempRoot,
            coreOutDir: path.join(tempRoot, "out", "build"),
            additionalOutDir: path.join(tempRoot, "out", "build", "additional_unverified"),
            levels: [4],
            contract: { kanjiLevels: { 五: 5 } },
            deltaReport: {
                byLevel: {
                    4: {
                        missingSourceCandidatesFromCurrent: [{
                            kanji: "五",
                            currentContractLevel: 5,
                            targetLevel: 4,
                            confidence: "weak_evidence",
                            sourceConsensusLevel: 5,
                            sourceIds: ["fixture_n4"],
                        }],
                    },
                    1: {
                        missingSourceCandidatesFromCurrent: [{
                            kanji: "五",
                            currentContractLevel: 5,
                            targetLevel: 1,
                            confidence: "weak_evidence",
                            sourceConsensusLevel: 5,
                            sourceIds: ["fixture_n1"],
                        }],
                    },
                },
            },
        });
        const additionalN4 = report.rows.find((row) => row.deckId === "additional_unverified_N4");

        assert.equal(additionalN4.plannedCount, 0);
        assert.equal(additionalN4.passed, true);
        assert.equal(report.duplicateAdditionalClaims.coreRetainedDuplicateKanjiCount, 1);
        assert.equal(report.passed, true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
