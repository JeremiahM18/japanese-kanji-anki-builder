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
        writeJson(path.join(tempRoot, "templates", "platinum_n5_review_set.json"), [{ kanji: "一", status: "platinum" }]);
        writeJson(path.join(tempRoot, "templates", "golden_n1_review_set.json"), [{ kanji: "亜" }]);
        writeJson(path.join(tempRoot, "templates", "platinum_n1_review_set.json"), []);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv"), ["一"]);
        writeTsv(path.join(tempRoot, "out", "build", "exports", "jlpt-n1.tsv"), ["亜"]);
        writeTsv(path.join(tempRoot, "out", "build", "additional_unverified", "exports", "additional-unverified-n5.tsv"), ["学"]);
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
        assert.equal(coreN1.presentUnique, 1);
        assert.equal(coreN1.goldenCount, 1);
        assert.equal(coreN1.platinumCount, 0);
        assert.equal(additionalN5.presentUnique, 1);
        assert.equal(additionalN5.goldenCount, 0);
        assert.equal(additionalN5.missingGolden.length, 1);
        assert.equal(report.duplicateAdditionalClaims.duplicateKanjiCount, 1);
        assert.equal(report.duplicateAdditionalClaims.excludedDuplicateClaimCount, 1);
        assert.equal(report.passed, false);
        assert.match(formatKanjiDeckReviewStatus(report), /duplicate kanji: 1/);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
