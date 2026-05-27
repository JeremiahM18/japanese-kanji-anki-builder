const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofReconciliationReport,
} = require("../src/services/obsidianProofReconciliationService");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeLedger(rootDir, events) {
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3_fixture.jsonl");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function buildProvenance(overrides = {}) {
    return {
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

test("buildObsidianProofReconciliationReport passes when inline proof matches ledger proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-reconcile-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildProvenance(),
    }]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofReconciliationReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        deckKinds: ["kanji"],
        levels: [3],
    });

    assert.equal(report.passed, true);
    assert.equal(report.totals.inlineProofs, 1);
    assert.equal(report.totals.ledgerProofs, 1);
    assert.equal(report.totals.matchedProofs, 1);
    assert.equal(report.totals.inlineOnlyProofs, 0);
});

test("buildObsidianProofReconciliationReport normalizes legacy inline sentence evidence before comparing ledger proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-reconcile-"));
    const legacyEvidence = [
        "live generated kanji card surface checked for 常|じょう",
        "governed japanese-source evidence checked for 常|じょう",
        "primary reading, on/kun compatibility, learner meaning, and broader meanings checked",
        "notes and support vocabulary checked for learner usefulness",
        "exact primary-reading audio identity checked for 常|じょう",
        "stroke-order media identity checked for 常",
        "source evidence, JLPT placement evidence, internal checks, NLP assistive signals, and review proof kept in separate evidence lanes",
        "example review: 日常の生活を大切にしています。 / にちじょうのせいかつをたいせつにしています。 / I value everyday life.; Fixture sentence review is natural, useful, level fit, support-only, and checked.",
    ];
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildProvenance({
            sentenceQualityReview: undefined,
            evidenceChecked: legacyEvidence,
        }),
    }]);
    writeLedger(rootDir, [buildProofEvent({
        proof: {
            ...buildProofEvent().proof,
            evidenceChecked: legacyEvidence,
        },
    })]);

    const report = buildObsidianProofReconciliationReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        deckKinds: ["kanji"],
        levels: [3],
    });

    assert.equal(report.passed, true);
    assert.equal(report.totals.matchedProofs, 1);
    assert.equal(report.totals.proofMismatches, 0);
    assert.equal(report.totals.normalizedSentenceQualityReviews, 1);
});

test("buildObsidianProofReconciliationReport reports inline-only, ledger-only, and mismatched proof targets", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-reconcile-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [
        {
            kanji: "常",
            readingIncludes: ["じょう"],
            rereviewProvenance: buildProvenance({ limitationDecision: "changed inline limitation" }),
        },
        {
            kanji: "幸",
            readingIncludes: ["こう"],
            rereviewProvenance: buildProvenance({
                cardReviewed: "幸|こう",
                sentenceQualityReview: {
                    ...buildProvenance().sentenceQualityReview,
                    example: "幸せな時間を過ごしました。",
                },
            }),
        },
    ]);
    writeLedger(rootDir, [
        buildProofEvent(),
        buildProofEvent({
            proofId: "kanji-n3-obsidian-fixture-02",
            target: {
                deckKind: "kanji",
                level: 3,
                written: "式",
                reading: "しき",
                cardReviewed: "式|しき",
            },
            proof: {
                ...buildProofEvent().proof,
                cardReviewed: "式|しき",
            },
        }),
    ]);

    const report = buildObsidianProofReconciliationReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        deckKinds: ["kanji"],
        levels: [3],
    });

    assert.equal(report.passed, false);
    assert.equal(report.totals.inlineOnlyProofs, 1);
    assert.equal(report.totals.ledgerOnlyProofs, 1);
    assert.equal(report.totals.proofMismatches, 1);
    assert.deepEqual(report.scopes[0].inlineOnlyTargets, ["kanji:n3:幸|こう"]);
    assert.deepEqual(report.scopes[0].ledgerOnlyTargets, ["kanji:n3:式|しき"]);
    assert.deepEqual(report.scopes[0].mismatchedTargets, [{
        targetKey: "kanji:n3:常|じょう",
        proofId: "kanji-n3-obsidian-fixture-01",
    }]);
});
