const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    applyObsidianProofProvider,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");

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

function buildWordProofEvent(overrides = {}) {
    return {
        schemaVersion: 1,
        recordType: "obsidian-proof-event",
        proofId: "word-n5-obsidian-fixture-01",
        target: {
            deckKind: "word",
            level: 5,
            written: "本",
            reading: "ほん",
            cardReviewed: "本|ほん",
        },
        batch: {
            id: "n5-word-obsidian-fixture-batch",
            sequence: 1,
        },
        proof: {
            type: "substantive current standard rereview",
            reviewStandard: "word-platinum-v3-evidence-lanes",
            reviewedAt: "2026-05-19",
            reviewer: "fixture-reviewer",
            reviewedAfterStandard: true,
            mechanicalMigration: false,
            result: "approved_for_current_standard_platinum",
            scope: "full word-card rereview from square zero",
            cardReviewed: "本|ほん",
            evidenceChecked: [
                "live generated word surface for 本|ほん",
                "governed Japanese-source word evidence for 本|ほん",
                "learner-facing meaning book",
                "example sentence 日本語の本を読みます。 and exported reading/translation fit",
                "notes/support surface checked",
                "reading breakdown, kanji breakdown, JLPT level, coverage role, focus kanji, and covered-reading labels",
                "exact word-reading audio identity word-reading-本-ほん",
                "pitch accent source and rendered pitch label checked",
                "managed media provenance and no silent fallback",
                "golden regression as internal regression only, not source truth",
                "word vocabulary deck placement and product fit considered; learner useful",
                "verification limitations considered; no active core-card limitations recorded",
            ],
            limitationDecision: "verification limitations considered; no active core-card limitations recorded",
            sentenceQualityReview: {
                example: "日本語の本を読みます。",
                reading: "にほんごのほんをよみます。",
                translation: "I read a Japanese book.",
                naturalJapanese: true,
                learnerUseful: true,
                levelAppropriate: true,
                releaseQuality: true,
                reviewerJudgment: "Fixture sentence review is natural, useful, level fit, release quality, and checked.",
            },
        },
        authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
        ledger: {
            recordedAt: "2026-05-27",
            recordedBy: "fixture-writer",
            sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
            sourceCommit: "abcdef1",
            representationMigration: true,
        },
        ...overrides,
    };
}

test("provider accepts only explicit Obsidian proof provider modes", () => {
    assert.equal(normalizeObsidianProofProviderMode("inline"), OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
    assert.equal(normalizeObsidianProofProviderMode("ledger"), OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER);
    assert.throws(
        () => normalizeObsidianProofProviderMode("generated-tsv"),
        /Unsupported Obsidian proof provider/
    );
});

test("ledger provider strips inline proof and applies canonical JSONL proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-"));
    const entries = [
        {
            kanji: "常",
            readingIncludes: ["じょう"],
            rereviewProvenance: { type: "legacy inline proof should be replaced" },
        },
        {
            kanji: "幸",
            readingIncludes: ["こう"],
            rereviewProvenance: { type: "legacy inline proof should be omitted" },
        },
    ];
    writeLedger(rootDir, [buildProofEvent()]);

    const provided = applyObsidianProofProvider({
        entries,
        cwd: rootDir,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
        deckKind: "kanji",
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
    });

    assert.equal(provided.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER);
    assert.equal(provided.summary.ledgerProofsApplied, 1);
    assert.equal(provided.summary.inlineProofsOmitted, 1);
    assert.equal(provided.entries[0].rereviewProvenance.cardReviewed, "常|じょう");
    assert.equal(provided.entries[0].rereviewProvenance.reviewStandard, "kanji-platinum-v3-evidence-lanes");
    assert.equal(provided.entries[1].rereviewProvenance, undefined);
    assert.equal(entries[0].rereviewProvenance.type, "legacy inline proof should be replaced");
});

test("ledger provider applies canonical word JSONL proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-"));
    const entries = [
        {
            word: "本",
            readingIncludes: ["ほん"],
            rereviewProvenance: { type: "legacy inline proof should be replaced" },
        },
    ];
    writeLedger(rootDir, [buildWordProofEvent()]);

    const provided = applyObsidianProofProvider({
        entries,
        cwd: rootDir,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
        deckKind: "word",
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
    });

    assert.equal(provided.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER);
    assert.equal(provided.summary.ledgerProofsApplied, 1);
    assert.equal(provided.entries[0].rereviewProvenance.cardReviewed, "本|ほん");
    assert.equal(provided.entries[0].rereviewProvenance.sentenceQualityReview.releaseQuality, true);
    assert.equal(provided.entries[0].rereviewProvenance.sentenceQualityReview.supportOnly, undefined);
});

test("ledger-if-available falls back only when a scoped ledger is absent", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-"));
    const entries = [{
        kanji: "月",
        readingIncludes: ["げつ"],
        rereviewProvenance: buildProvenance({ cardReviewed: "月|げつ" }),
    }];
    writeLedger(rootDir, [buildProofEvent()]);

    const provided = applyObsidianProofProvider({
        entries,
        cwd: rootDir,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        deckKind: "kanji",
        level: 4,
        sourceReviewSetPath: "templates/platinum_n4_review_set.json",
    });

    assert.equal(provided.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
    assert.equal(provided.legacyFallback, true);
    assert.equal(provided.entries[0].rereviewProvenance.cardReviewed, "月|げつ");
});

test("ledger provider fails closed on source review-set path mismatch", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-"));
    writeLedger(rootDir, [buildProofEvent({
        ledger: {
            recordedAt: "2026-05-26",
            recordedBy: "fixture-writer",
            sourceReviewSetPath: "templates/platinum_n2_review_set.json",
            sourceCommit: "abcdef1",
            representationMigration: false,
        },
    })]);

    assert.throws(
        () => applyObsidianProofProvider({
            entries: [{ kanji: "常", readingIncludes: ["じょう"] }],
            cwd: rootDir,
            proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
            deckKind: "kanji",
            level: 3,
            sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        }),
        /sourceReviewSetPath mismatch/
    );
});

test("loadReviewSetWithObsidianProof reads source JSON before applying provider", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        readingIncludes: ["じょう"],
        rereviewProvenance: { type: "legacy inline proof should be replaced" },
    }]);
    writeLedger(rootDir, [buildProofEvent()]);

    const provided = loadReviewSetWithObsidianProof({
        cwd: rootDir,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER,
        deckKind: "kanji",
        level: 3,
    });

    assert.equal(provided.entries.length, 1);
    assert.equal(provided.entries[0].rereviewProvenance.cardReviewed, "常|じょう");
    assert.equal(provided.summary.sourceReviewSetPath, "templates/platinum_n3_review_set.json");
});
