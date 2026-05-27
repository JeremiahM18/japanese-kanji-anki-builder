const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofCompatibilityViewReport,
    buildObsidianProofCompatibilityViews,
} = require("../src/services/obsidianProofCompatibilityViewService");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeLedger(rootDir, events) {
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3_fixture.jsonl");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
    return ledgerPath;
}

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

test("buildObsidianProofCompatibilityViews writes ledger-derived review-set JSON", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-view-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [
        {
            kanji: "常",
            status: "platinum",
            readingIncludes: ["じょう"],
            rereviewProvenance: { type: "legacy inline proof should be replaced" },
        },
        {
            kanji: "幸",
            status: "platinum",
            readingIncludes: ["こう"],
            rereviewProvenance: { type: "legacy inline proof should be omitted" },
        },
    ]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofCompatibilityViews({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/compatibility",
    });

    assert.equal(report.passed, true);
    assert.equal(report.manifest.reviewSets[0].sourceEntries, 2);
    assert.equal(report.manifest.reviewSets[0].ledgerProofsApplied, 1);
    assert.equal(report.manifest.reviewSets[0].inlineProofsOmitted, 1);
    assert.match(report.manifest.inputHashes.ledgerFiles[0].sha256, /^[a-f0-9]{64}$/);
    assert.match(report.manifest.reviewSets[0].inputHash.sha256, /^[a-f0-9]{64}$/);
    assert.match(report.manifest.reviewSets[0].outputHash.sha256, /^[a-f0-9]{64}$/);
    assert.match(report.manifest.manifestHash.sha256, /^[a-f0-9]{64}$/);

    const outputEntries = JSON.parse(fs.readFileSync(
        path.join(rootDir, "out", "obsidian-proof", "compatibility", "templates", "platinum_n3_review_set.json"),
        "utf8"
    ));
    assert.equal(outputEntries[0].rereviewProvenance.cardReviewed, "常|じょう");
    assert.equal(outputEntries[0].rereviewProvenance.reviewStandard, "kanji-platinum-v3-evidence-lanes");
    assert.equal(outputEntries[1].rereviewProvenance, undefined);
});

test("buildObsidianProofCompatibilityViewReport fails closed when ledger target is missing from source review set", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-view-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["つね"],
    }]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofCompatibilityViewReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/compatibility",
    });

    assert.equal(report.passed, false);
    assert.match(report.failures[0], /did not match review-set entries/);
});

test("buildObsidianProofCompatibilityViewReport rejects unsafe generated root output target", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-view-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
    }]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofCompatibilityViewReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: path.join(path.parse(rootDir).root, "jkb-obsidian-proof-unsafe-output"),
    });

    assert.equal(report.passed, false);
    assert.match(report.failures[0], /outside governed generated-output roots/);
});
