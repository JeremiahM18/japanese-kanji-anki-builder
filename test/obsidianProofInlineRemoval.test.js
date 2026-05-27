const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
} = require("../src/services/platinumKanjiReviewService");
const {
    buildObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");
const {
    parseArgs,
    runInlineObsidianProofRemoval,
} = require("../scripts/removeInlineObsidianProofFromReviewSets");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeReviewSet(rootDir, entries) {
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), entries);
}

function writeLedger(rootDir, events) {
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3_fixture.jsonl");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function buildProvenance(overrides = {}) {
    return {
        type: "substantive current standard rereview",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        batchId: "n3-kanji-obsidian-fixture-batch",
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
            "example sentence quality review checked for natural Japanese, learner usefulness, level appropriateness, support-only usage, reading, and translation",
            "notes and support vocabulary checked for learner usefulness",
            "exact primary-reading audio identity checked for 常|じょう",
            "stroke-order media identity checked for 常",
            "source evidence, JLPT placement evidence, internal checks, NLP assistive signals, and review proof kept in separate evidence lanes",
        ],
        limitationDecision: "no active limitation remains",
        sentenceQualityReview: {
            example: "日常の生活を大切にしています。",
            reading: "にちじょうのせいかつをたいせつにしています。",
            translation: "I value everyday life.",
            naturalJapanese: true,
            learnerUseful: true,
            levelAppropriate: true,
            supportOnly: true,
            reviewerJudgment: "Fixture sentence review is natural, useful, level fit, support-only, and checked.",
        },
        ...overrides,
    };
}

function buildEntry(overrides = {}) {
    return {
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildProvenance(),
        ...overrides,
    };
}

function buildProofEvent(overrides = {}) {
    const provenance = buildProvenance();
    return {
        schemaVersion: 1,
        recordType: "obsidian-proof-event",
        proofId: "kanji-n3-obsidian-fixture-01",
        target: {
            deckKind: "kanji",
            level: 3,
            written: "常",
            reading: "じょう",
            cardReviewed: "常|じょう",
        },
        batch: {
            id: provenance.batchId,
            sequence: 99,
        },
        proof: {
            type: provenance.type,
            reviewStandard: provenance.reviewStandard,
            reviewedAt: provenance.reviewedAt,
            reviewer: provenance.reviewer,
            reviewedAfterStandard: provenance.reviewedAfterStandard,
            mechanicalMigration: provenance.mechanicalMigration,
            result: provenance.result,
            scope: provenance.scope,
            cardReviewed: provenance.cardReviewed,
            evidenceChecked: provenance.evidenceChecked,
            limitationDecision: provenance.limitationDecision,
            sentenceQualityReview: provenance.sentenceQualityReview,
        },
        authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
        ledger: {
            recordedAt: "2026-05-26",
            recordedBy: "fixture-writer",
            sourceReviewSetPath: "templates/platinum_n3_review_set.json",
            sourceCommit: "abcdef1",
            representationMigration: false,
        },
        ...overrides,
    };
}

test("inline proof removal parses governed CLI options", () => {
    const options = parseArgs([
        "--write",
        "--deck-kind=kanji",
        "--levels=5,4,3",
        "--ledger-dir=templates/obsidian_proof_ledger",
        "--json",
        "--unexpected",
    ]);

    assert.equal(options.write, true);
    assert.equal(options.deckKind, "kanji");
    assert.deepEqual(options.levels, [5, 4, 3]);
    assert.equal(options.ledgerDir, "templates/obsidian_proof_ledger");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("inline proof removal writes canonical-only review set and keeps reconciliation passing", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-removal-"));
    writeReviewSet(rootDir, [buildEntry()]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = runInlineObsidianProofRemoval({
        cwd: rootDir,
        levels: [3],
        write: true,
    });

    assert.equal(report.passed, true);
    assert.equal(report.reviewSets[0].inlineProofsRemoved, 1);
    assert.equal(report.reconciliation.passed, true);
    assert.equal(report.reconciliation.totals.inlineProofs, 0);
    assert.equal(report.reconciliation.totals.canonicalLedgerProofs, 1);

    const sourceEntries = JSON.parse(fs.readFileSync(
        path.join(rootDir, "templates", "platinum_n3_review_set.json"),
        "utf8"
    ));
    assert.equal(sourceEntries[0].rereviewProvenance, undefined);

    const reconciliation = buildObsidianProofReconciliationReport({
        cwd: rootDir,
        levels: [3],
    });
    assert.equal(reconciliation.passed, true);
});

test("inline proof removal refuses to drop proof without a matching ledger event", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-removal-"));
    writeReviewSet(rootDir, [buildEntry()]);
    writeLedger(rootDir, []);

    assert.throws(() => runInlineObsidianProofRemoval({
        cwd: rootDir,
        levels: [3],
        write: true,
    }), /Refusing to remove inline proof without matching ledger event/);
});
