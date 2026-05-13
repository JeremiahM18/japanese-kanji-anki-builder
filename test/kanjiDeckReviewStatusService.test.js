const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiDeckReviewStatus,
    formatKanjiDeckReviewStatus,
} = require("../src/services/kanjiDeckReviewStatusService");

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
            verificationLimitations: [{
                field: "strokeOrderSequence",
                status: "externally_unverified",
                label: "Stroke-order sequence unverified",
                reviewNote: "Fixture limitation.",
            }],
        }]);
        writeJson(path.join(tempRoot, "templates", "golden_n1_review_set.json"), [{ kanji: "亜" }]);
        writeJson(path.join(tempRoot, "templates", "platinum_n1_review_set.json"), []);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv"), ["一"]);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n1.tsv"), ["亜"]);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n5.tsv"), ["本"]);
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
        assert.equal(coreN5.currentStandardPlatinumCount, 0);
        assert.equal(coreN5.legacyOrUnversionedPlatinumCount, 1);
        assert.deepEqual(coreN5.legacyOrUnversionedKanji, ["一"]);
        assert.equal(coreN5.verificationLimitationCount, 1);
        assert.equal(coreN5.verificationLimitationKanjiCount, 1);
        assert.equal(coreN5.verificationLimitationFieldCounts.strokeOrderSequence, 1);
        assert.equal(coreN1.presentUnique, 1);
        assert.equal(coreN1.goldenCount, 1);
        assert.equal(coreN1.platinumCount, 0);
        assert.equal(additionalN5.presentUnique, 1);
        assert.equal(additionalN5.plannedCount, 1);
        assert.equal(additionalN5.goldenCount, 0);
        assert.equal(additionalN5.missingGolden.length, 1);
        assert.equal(report.duplicateAdditionalClaims.duplicateKanjiCount, 1);
        assert.equal(report.duplicateAdditionalClaims.coreRetainedDuplicateKanjiCount, 1);
        assert.equal(report.duplicateAdditionalClaims.suppressedDuplicateClaimCount, 2);
        assert.equal(report.duplicateAdditionalClaims.unresolvedDuplicateKanjiCount, 0);
        assert.equal(report.passed, true);
        assert.match(formatKanjiDeckReviewStatus(report), /duplicate kanji: 1/);
        assert.match(formatKanjiDeckReviewStatus(report), /core N4 retained; no additional duplicate selected/);
        assert.match(formatKanjiDeckReviewStatus(report), /Verification Limitations:/);
        assert.match(formatKanjiDeckReviewStatus(report), /core_N5: 1 limitation\(s\) on 1 active platinum card\(s\)/);
        assert.match(formatKanjiDeckReviewStatus(report), /Current Std/);
        assert.match(formatKanjiDeckReviewStatus(report), /Legacy\/Unversioned Platinum:/);
        assert.match(formatKanjiDeckReviewStatus(report), /core_N5: 1 active platinum card\(s\) need current-standard revalidation/);
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
