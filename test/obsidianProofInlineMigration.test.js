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

function writeWordReviewSet(rootDir, level, entries) {
    writeJson(path.join(rootDir, "templates", `platinum_n${level}_word_review_set.json`), entries);
}

function buildWordEntry(overrides = {}) {
    const word = overrides.word || "本";
    const reading = overrides.reading || "ほん";
    const example = overrides.example || "日本語の本を読みます。";
    return {
        word,
        status: "platinum",
        readingIncludes: [reading],
        meaningIncludes: ["book"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core + reading coverage"],
        focusIncludes: ["本"],
        coversReadingIncludes: ["本: ほん"],
        breakdownIncludes: ["本 （ほん） ／ book"],
        exampleIncludes: [example],
        pitchAccentIncludes: ["Pitch 1: 1"],
        notesIncludes: ["Core beginner noun for book."],
        reviewedAt: "2026-05-19",
        reviewer: "codex-platinum-review",
        reviewStandard: "word-platinum-v3-evidence-lanes",
        revalidatedAt: "2026-05-19",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        sourceEvidence: [{
            type: "japanese-source",
            source: "fixture source",
            detail: `JMdict dictionary source verified ${word}|${reading}, reading ${reading}, learner meaning book, and example ${example}.`,
        }],
        internalChecks: [
            {
                type: "generated-surface",
                source: "fixture",
                detail: `Generated word-card surface inspected for ${word}|${reading}: word, reading, meaning book, example ${example}, audio, and pitch accent fields.`,
            },
            {
                type: "golden-regression",
                source: "fixture",
                detail: `Separate golden regression gate checked ${word}|${reading}; this regression gate protects generated field expectations but is not source truth and not source evidence.`,
            },
            {
                type: "level-contract",
                source: "fixture",
                detail: `templates/jlpt_word_level_contract.json lists ${word}|${reading} for JLPT N5.`,
            },
            {
                type: "media-audit",
                source: "fixture",
                detail: `Managed media provenance audit checked ${word}|${reading} exact asset fragment word-reading-${word}-${reading} in tracked media.`,
            },
            {
                type: "audio-review",
                source: "fixture",
                detail: `Audio review checked ${word}|${reading} exact asset fragment word-reading-${word}-${reading}.`,
            },
            {
                type: "pitch-accent-review",
                source: "fixture",
                detail: `Pitch accent review checked ${word}|${reading} source kanjium-cc-by-sa-4.0 pattern 1 [atamadaka] and rendered label Pitch 1: 1.`,
            },
            {
                type: "label-review",
                source: "fixture",
                detail: `Label review checked ${word}|${reading} JLPT N5, JLPT core, focus 本, and covered readings 本: ほん.`,
            },
        ],
        reviewEvidence: [
            {
                type: "example-review",
                source: "product Japanese example review",
                detail: `Example review checked ${word}|${reading}, reading ${reading}, sentence ${example}, and the exported reading line for release quality.`,
            },
            {
                type: "manual-review",
                source: "platinum product review",
                detail: `Manual review judged ${word}|${reading} common and learner-friendly for the N5 word deck, with accurate reading ${reading}, meaning book, and example ${example}.`,
            },
            {
                type: "current-standard-review",
                source: "manual current-standard word review using generated N5 word batch report and separated source/internal/review evidence lanes",
                detail: `Current-standard whole-card revalidation with separated evidence lanes for ${word}|${reading} checked generated surface, Japanese-source evidence, example sentence ${example}, notes/support surface Core beginner noun for book., reading breakdown 本 （ほん） ／ book, meaning book, labels JLPT N5; JLPT core + reading coverage; focus 本; covers 本: ほん, audio word-reading-${word}-${reading}, pitch accent source kanjium-cc-by-sa-4.0 pattern 1 [atamadaka] rendered Pitch 1: 1, media provenance, release judgment common useful learner-friendly level-appropriate natural, and verification limitations no active limitations.`,
            },
        ],
        qualityGates: {
            belongsInWordDeck: true,
            commonOrUseful: true,
            learnerFriendly: true,
            writtenFormVerified: true,
            readingVerified: true,
            meaningVerified: true,
            exampleVerified: true,
        },
        rereviewProvenance: {
            type: "substantive current standard rereview",
            reviewStandard: "word-platinum-v3-evidence-lanes",
            reviewedAt: "2026-05-19",
            reviewedAfterStandard: true,
            reviewer: "codex-platinum-review",
            mechanicalMigration: false,
            batchId: "n5-word-obsidian-rereview-batch-002",
            scope: "N5 word Obsidian lane batch 2 generated-order substantive rereview",
            evidenceChecked: [
                `live generated word surface for ${word}|${reading} from out/word-build/exports/jlpt-n5-words.tsv`,
                `governed Japanese-source word evidence for ${word}|${reading}: tracked JLearn lane plus exact local JMdict row entrySeq=1522150`,
                "learner-facing meaning book",
                `example sentence ${example} and exported reading/translation fit`,
                "notes/support surface: Core beginner noun for book.",
                "reading breakdown, kanji breakdown, JLPT level, coverage role, focus kanji, and covered-reading labels",
                `exact word-reading audio identity word-reading-${word}-${reading} exists in out/word-build/package/media`,
                "pitch accent source and rendered pitch label checked: kanjium-cc-by-sa-4.0 pattern 1 [atamadaka]",
                "managed media provenance and no silent fallback",
                "golden regression as internal regression only, not source truth",
                "single-kanji or support-kanji product fit considered where applicable; word/vocabulary deck placement kept separate from kanji-deck certification",
                "verification limitations considered; no active core-card limitations recorded",
            ],
        },
        ...overrides.entryOverrides,
    };
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

test("inline proof migration builds JSONL events from tracked inline provenance", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeReviewSet(rootDir, [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildInlineProvenance(),
    }]);

    const report = await buildInlineObsidianProofLedgerMigration({
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

test("inline proof migration can write ledger and normalize source review set for exact reconciliation", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeReviewSet(rootDir, [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: buildInlineProvenance(),
    }]);

    const report = await runInlineObsidianProofLedgerMigration({
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

test("word inline proof migration canonicalizes 本 proof with release-quality sentence review", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeWordReviewSet(rootDir, 5, [buildWordEntry()]);

    const report = await buildInlineObsidianProofLedgerMigration({
        cwd: rootDir,
        deckKind: "word",
        levels: [5],
        sourceCommit: "abcdef1",
        recordedAt: "2026-05-27",
        wordRowsByLevel: {
            5: [{
                word: "本",
                reading: "ほん",
                exampleSentence: "日本語の本を読みます。 ／ にほんごのほんをよみます。 ／ I read a Japanese book.",
            }],
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.events.length, 1);
    assert.equal(report.events[0].proofId, "word-n5-obsidian-002-01");
    assert.equal(report.events[0].target.cardReviewed, "本|ほん");
    assert.equal(report.events[0].proof.result, "approved_for_current_standard_platinum");
    assert.equal(report.events[0].proof.limitationDecision, "verification limitations considered; no active core-card limitations recorded");
    assert.deepEqual(report.events[0].proof.sentenceQualityReview, {
        example: "日本語の本を読みます。",
        reading: "にほんごのほんをよみます。",
        translation: "I read a Japanese book.",
        naturalJapanese: true,
        learnerUseful: true,
        levelAppropriate: true,
        releaseQuality: true,
        reviewerJudgment: buildWordEntry().reviewEvidence[2].detail,
    });
    assert.equal(report.reviewSets[0].missingCardIdentityBindings, 0);
    assert.equal(report.reviewSets[0].missingReleaseQualitySentenceReviews, 0);
    assert.equal(report.reviewSets[0].duplicateTargets, 0);
});

test("word inline proof migration fails closed when live row translation is unavailable", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-inline-migration-"));
    writeWordReviewSet(rootDir, 5, [buildWordEntry()]);

    await assert.rejects(
        () => buildInlineObsidianProofLedgerMigration({
            cwd: rootDir,
            deckKind: "word",
            levels: [5],
            sourceCommit: "abcdef1",
            recordedAt: "2026-05-27",
            wordRowsByLevel: { 5: [] },
        }),
        /Missing live generated row needed to derive word sentence-quality proof/
    );
});
