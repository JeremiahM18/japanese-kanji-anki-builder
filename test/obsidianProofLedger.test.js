const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildObsidianProofTargetKey,
    buildRereviewProvenanceFromLedgerEvent,
    loadObsidianProofLedger,
    parseObsidianProofLedgerEvent,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofLedgerReport,
} = require("../src/services/obsidianProofLedgerService");

function buildProofEvent(overrides = {}) {
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
            id: "n3-kanji-obsidian-fixture-batch",
            sequence: 99,
        },
        proof: {
            type: "substantive current standard rereview",
            reviewStandard: "kanji-platinum-v3-evidence-lanes",
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
        },
        authority: {
            sourceOfTruth: "tracked-jsonl-obsidian-proof-ledger",
            generatedCompatibilityView: true,
            generatedSqliteMirror: true,
            boundary: "Obsidian proof only; not source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
        },
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

function writeLedger(rootDir, events) {
    const ledgerDir = path.join(rootDir, "templates", "obsidian_proof_ledger");
    fs.mkdirSync(ledgerDir, { recursive: true });
    const ledgerPath = path.join(ledgerDir, "kanji_n3_fixture.jsonl");
    fs.writeFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
    return ledgerPath;
}

test("parseObsidianProofLedgerEvent validates a strict card-bound proof event", () => {
    const event = parseObsidianProofLedgerEvent(buildProofEvent());

    assert.equal(buildObsidianProofTargetKey(event), "kanji:n3:常|じょう");
    assert.deepEqual(buildRereviewProvenanceFromLedgerEvent(event), {
        type: "substantive current standard rereview",
        reviewStandard: "kanji-platinum-v3-evidence-lanes",
        batchId: "n3-kanji-obsidian-fixture-batch",
        reviewedAt: "2026-05-26",
        reviewer: "fixture-reviewer",
        reviewedAfterStandard: true,
        mechanicalMigration: false,
        result: "approved_for_current_standard_platinum",
        scope: "full kanji card rereview from square zero",
        cardReviewed: "常|じょう",
        evidenceChecked: event.proof.evidenceChecked,
        limitationDecision: "no active limitation remains",
        sentenceQualityReview: event.proof.sentenceQualityReview,
    });
});

test("parseObsidianProofLedgerEvent rejects path escapes and mismatched card identity", () => {
    assert.throws(() => parseObsidianProofLedgerEvent(buildProofEvent({
        ledger: {
            ...buildProofEvent().ledger,
            sourceReviewSetPath: "../templates/platinum_n3_review_set.json",
        },
    })), /relative tracked repo path/);

    assert.throws(() => parseObsidianProofLedgerEvent(buildProofEvent({
        proof: {
            ...buildProofEvent().proof,
            cardReviewed: "常|つね",
        },
    })), /proof\.cardReviewed/);
});

test("loadObsidianProofLedger rejects duplicate proof targets", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-ledger-"));
    const event = buildProofEvent();
    writeLedger(rootDir, [
        event,
        {
            ...event,
            proofId: "kanji-n3-obsidian-fixture-02",
        },
    ]);

    assert.throws(() => loadObsidianProofLedger({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
    }), /Duplicate Obsidian proof target/);
});

test("buildObsidianProofLedgerReport summarizes valid tracked ledger events", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-ledger-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofLedgerReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
    });

    assert.equal(report.passed, true);
    assert.equal(report.counts.totalEvents, 1);
    assert.deepEqual(report.counts.levels, { "kanji:N3": 1 });
});
