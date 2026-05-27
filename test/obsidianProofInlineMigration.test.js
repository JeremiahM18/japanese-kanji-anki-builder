const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
    loadObsidianProofLedger,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");
const {
    buildInlineObsidianProofLedgerMigration,
    deriveSentenceQualityReview,
    parseArgs,
    runInlineObsidianProofLedgerMigration,
} = require("../scripts/migrateInlineObsidianProofLedger");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildInlineProvenance(overrides = {}) {
    return {
        type: "substantive current standard rereview",
        reviewStandard: "kanji-platinum-v3-evidence-lanes",
        batchId: "n3-kanji-obsidian-rereview-batch-001",
        reviewedAt: "2026-05-26",
        reviewer: "fixture-reviewer",
        reviewedAfterStandard: true,
        mechanicalMigration: false,
        result: "approved_for_current_standard_platinum",
        scope: "full kanji card rereview from square zero",
        cardReviewed: "常|じょう",
        evidenceChecked: [
            "live generated kanji card surface checked for 常|じょう",
            "governed japanese-source evidence checked for 常|じょう",
            "primary reading, on/kun compatibility, learner meaning, and broader meanings checked",
            "notes and support vocabulary checked for learner usefulness",
            "exact primary-reading audio identity checked for 常|じょう",
            "stroke-order media identity checked for 常",
            "source evidence, JLPT placement evidence, internal checks, NLP assistive signals, and review proof kept in separate evidence lanes",
            "actual example sentence quality review: 日常の生活を大切にしています。 / にちじょうのせいかつをたいせつにしています。 / I value everyday life.; checked from the live generated card as natural Japanese, learner-useful, level-appropriate for N3, support-only for the target kanji, reading-correct, and translation-correct by human reviewer judgment.",
        ],
        limitationDecision: "no active limitation remains",
        ...overrides,
    };
}

function writeReviewSet(rootDir, entries) {
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), entries);
}

test("inline proof migration parses governed CLI options", () => {
    const options = parseArgs([
        "--write",
        "--update-source-review-set",
        "--deck-kind=kanji",
        "--levels=3",
        "--ledger-dir=templates/obsidian_proof_ledger",
        "--source-commit=abcdef1",
        "--recorded-at=2026-05-27",
        "--recorded-by=fixture-writer",
        "--json",
    ]);

    assert.equal(options.write, true);
    assert.equal(options.updateSourceReviewSet, true);
    assert.equal(options.deckKind, "kanji");
    assert.deepEqual(options.levels, [3]);
    assert.equal(options.sourceCommit, "abcdef1");
    assert.equal(options.recordedAt, "2026-05-27");
    assert.equal(options.recordedBy, "fixture-writer");
    assert.equal(options.json, true);
});

test("deriveSentenceQualityReview structures existing inline evidence", () => {
    const review = deriveSentenceQualityReview(buildInlineProvenance(), {
        cardReviewed: "常|じょう",
        level: 3,
    });

    assert.deepEqual(review, {
        example: "日常の生活を大切にしています。",
        reading: "にちじょうのせいかつをたいせつにしています。",
        translation: "I value everyday life.",
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        supportOnly: true,
        reviewerJudgment: "checked from the live generated card as natural Japanese, learner-useful, level-appropriate for N3, support-only for the target kanji, reading-correct, and translation-correct by human reviewer judgment.",
    });
});

test("deriveSentenceQualityReview structures legacy kanji example review evidence", () => {
    const review = deriveSentenceQualityReview(buildInlineProvenance({
        evidenceChecked: [
            "generated surface: Kanji and DisplayWord are 一, StudyWordKanji is blank, PrimaryReading is いち",
            "example review: 一時に学校へ行きます。 / いちじにがっこうへいきます。 / I go to school at one o'clock.; checked as learner-useful, level-appropriate, natural enough, and support-only by best-effort reviewer judgment",
        ],
    }), {
        cardReviewed: "一|いち",
        level: 5,
    });

    assert.deepEqual(review, {
        example: "一時に学校へ行きます。",
        reading: "いちじにがっこうへいきます。",
        translation: "I go to school at one o'clock.",
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        supportOnly: true,
        reviewerJudgment: "checked as learner-useful, level-appropriate, natural enough, and support-only by best-effort reviewer judgment",
    });
});

test("inline proof migration builds JSONL events from tracked inline provenance", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeReviewSet(rootDir, [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildInlineProvenance(),
    }]);

    const report = buildInlineObsidianProofLedgerMigration({
        cwd: rootDir,
        levels: [3],
        sourceCommit: "abcdef1",
        recordedAt: "2026-05-27",
    });

    assert.equal(report.passed, true);
    assert.equal(report.events.length, 1);
    assert.equal(report.events[0].proofId, "kanji-n3-obsidian-001-01");
    assert.deepEqual(report.events[0].authority, OBSIDIAN_PROOF_LEDGER_AUTHORITY);
    assert.equal(report.events[0].ledger.representationMigration, true);
    assert.equal(report.reviewSets[0].normalizedSentenceQualityReviews, 1);
});

test("inline proof migration can write ledger and normalize source review set for exact reconciliation", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeReviewSet(rootDir, [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildInlineProvenance(),
    }]);

    const report = runInlineObsidianProofLedgerMigration({
        cwd: rootDir,
        levels: [3],
        sourceCommit: "abcdef1",
        recordedAt: "2026-05-27",
        write: true,
        updateSourceReviewSet: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.reconciliation.passed, true);

    const ledger = loadObsidianProofLedger({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
    });
    assert.equal(ledger.events.length, 1);

    const sourceEntries = JSON.parse(fs.readFileSync(
        path.join(rootDir, "templates", "platinum_n3_review_set.json"),
        "utf8"
    ));
    assert.equal(sourceEntries[0].rereviewProvenance.sentenceQualityReview.example, "日常の生活を大切にしています。");

    const reconciliation = buildObsidianProofReconciliationReport({
        cwd: rootDir,
        levels: [3],
    });
    assert.equal(reconciliation.passed, true);
    assert.equal(reconciliation.totals.inlineProofs, 1);
    assert.equal(reconciliation.totals.ledgerProofs, 1);
});
