const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumKanjiReviewService");
const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
    REQUIRED_WORD_INTERNAL_CHECK_TYPES,
    REQUIRED_WORD_QUALITY_GATES,
    REQUIRED_WORD_REVIEW_EVIDENCE_TYPES,
    REQUIRED_WORD_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumReviewService");
const {
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireKanjiReviewService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");
const {
    buildKanjiBatchReportProviderParityForLevel,
    buildKanjiFieldSourceContractProviderParityForLevel,
    buildKanjiPlatinumLevelProviderParityForLevel,
    buildKanjiRereviewStatusProviderParityForLevel,
    buildObsidianProofProviderParityReport,
    buildPlatinumGovernanceGateProviderParityForLevel,
    buildTrackedReviewSetRows,
    buildTrackedWordReviewSetRows,
    buildWordBatchReportProviderParityForLevel,
    buildWordCertificationStatusProviderParityForLevel,
    buildWordGovernanceInputsProviderParityForLevel,
    buildWordPlatinumLevelProviderParityForLevel,
    buildWordRereviewStatusProviderParityForLevel,
    formatObsidianProofProviderParityReport,
    parseArgs,
    ROW_SOURCES,
} = require("../scripts/reportObsidianProofProviderParity");

function writeReviewSet(rootDir, entries) {
    const reviewSetPath = path.join(rootDir, "templates", "platinum_n3_review_set.json");
    fs.mkdirSync(path.dirname(reviewSetPath), { recursive: true });
    fs.writeFileSync(reviewSetPath, JSON.stringify(entries, null, 2), "utf8");
}

function writeLedger(rootDir, events) {
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3_fixture.jsonl");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(ledgerPath, `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function buildRow(overrides = {}) {
    const kanji = overrides.kanji || "常";
    const primaryReading = overrides.primaryReading || "じょう";
    return {
        kanji,
        levelLabel: "N3",
        displayWord: kanji,
        meaningJP: overrides.meaningJP || "normal / usual",
        primaryReading,
        kanjiMeanings: overrides.kanjiMeanings || "normal / usual / regular",
        studyWordKanji: "",
        onReading: `On: ${primaryReading}`,
        kunReading: "Kun: つね",
        strokeOrder: `<img src="${kanji}-stroke-order.gif" />`,
        audio: `[sound:${kanji}-kanji-reading-${kanji}-${primaryReading}.wav]`,
        radical: "",
        notes: `${kanji} - normal ／ 日常 - everyday`,
        exampleSentence: "日常の生活を大切にしています。 ／ にちじょうのせいかつをたいせつにしています。 ／ I value everyday life.",
    };
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
    const exactAudio = "kanji-reading-常-じょう";
    return {
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        meaningIncludes: ["normal / usual"],
        kanjiMeaningsIncludes: ["normal", "usual", "regular"],
        levelIncludes: ["N3"],
        notesIncludes: ["常", "日常"],
        exampleIncludes: ["日常の生活を大切にしています。"],
        primaryReadingRationale: "Uses じょう as the learner-facing individual-kanji reading for 常.",
        reviewedAt: "2026-05-26",
        reviewer: "fixture-reviewer",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-26",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, audio, stroke-order media, and verification limitations under the current kanji platinum standard.",
        sourceEvidence: REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES.map((type) => ({
            type,
            source: "Kanjipedia https://www.kanjipedia.jp/",
            detail: "Kanjipedia verified 常 primary reading じょう, primary meaning normal / usual, and broader meanings normal, usual, and regular.",
        })),
        internalChecks: REQUIRED_KANJI_INTERNAL_CHECK_TYPES.map((type) => {
            const details = {
                "generated-surface": "Generated card surface inspected for 常: single-kanji anchor, primary reading じょう, meaning normal / usual, notes 日常, example 日常の生活を大切にしています。, audio kanji-reading-常-じょう, and stroke-order fields.",
                "golden-regression": "Separate golden regression gate checked 常; this regression gate protects generated field expectations but is not source truth and not source evidence.",
                "media-audit": "Managed media provenance audit checked 常 exact audio media fragment kanji-reading-常-じょう and stroke-order media source policy.",
                "audio-review": "Audio review checked 常 exact asset fragment kanji-reading-常-じょう.",
                "stroke-order-review": "Visual stroke-order review checked target 常 against source-policy governed media source.",
            };
            return {
                type,
                source: "dual-read parity fixture",
                detail: details[type],
            };
        }),
        reviewEvidence: REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES.map((type) => {
            if (type === "manual-review") {
                return {
                    type,
                    source: "manual kanji product review fixture",
                    detail: "Manual review judged 常 as an individual-kanji learner card.",
                };
            }
            return {
                type,
                source: "current-standard fixture review",
                detail: `Current-standard review revalidated 常|じょう with separated evidence lanes, generated surface, Japanese-source evidence, PrimaryReading じょう, MeaningJP normal / usual, KanjiMeanings normal, usual, and regular, example sentence 日常の生活を大切にしています。, reading にちじょうのせいかつをたいせつにしています。, translation I value everyday life., notes/support surface 常 and 日常, audio ${exactAudio}, stroke-order media, release-quality support-only example usage, learner-friendly, useful, level-appropriate, natural sentence review, and verification limitations with no active limitations present.`,
            };
        }),
        qualityGates: Object.fromEntries(REQUIRED_KANJI_QUALITY_GATES.map((gate) => [gate, true])),
        rereviewProvenance: buildProvenance(),
        ...overrides,
    };
}

function buildSapphireEntry(overrides = {}) {
    return {
        kanji: "常",
        status: "sapphire",
        reviewStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
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

function buildWordRow(overrides = {}) {
    return {
        word: "本",
        reading: "ほん",
        readingBreakdown: "<ruby>本<rt>ほん</rt></ruby>",
        audio: "[sound:本-word-reading-本-ほん.wav]",
        pitchAccent: "Pitch 1: 1",
        meaning: "book",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "本",
        coversReading: "本: ほん",
        kanjiBreakdown: "本 （ほん） ／ book",
        exampleSentence: "日本語の本を読みます。 ／ にほんごのほんをよみます。 ／ I read a Japanese book.",
        notes: "Core beginner noun for book.",
        ...overrides,
    };
}

function buildWordProvenance(overrides = {}) {
    return {
        type: "substantive current standard rereview",
        obsidianStandardVersion: CURRENT_WORD_OBSIDIAN_STANDARD_VERSION,
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        batchId: "n5-word-obsidian-rereview-batch-002",
        reviewedAt: "2026-05-19",
        reviewer: "fixture-review-owner",
        reviewedAfterStandard: true,
        mechanicalMigration: false,
        result: "approved_for_current_standard_platinum",
        scope: "N5 word Obsidian lane batch 2 generated-order substantive rereview",
        cardReviewed: "本|ほん",
        evidenceChecked: [
            "live generated word surface for 本|ほん from out/word-build/exports/jlpt-n5-words.tsv",
            "governed Japanese-source word evidence for 本|ほん: tracked JLearn lane plus exact local JMdict row entrySeq=1522150",
            "learner-facing meaning book",
            "example sentence 日本語の本を読みます。 and exported reading/translation fit",
            "notes/support surface: Core beginner noun for book.",
            "reading breakdown, kanji breakdown, JLPT level, coverage role, focus kanji, and covered-reading labels",
            "exact word-reading audio identity word-reading-本-ほん exists in out/word-build/package/media",
            "exact example sentence audio identity checked for word-example-sentence 日本語の本を読みます。 / にほんごのほんをよみます。",
            "pitch accent source and rendered pitch label checked: kanjium-cc-by-sa-4.0 pattern 1 [atamadaka]",
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
            reviewerJudgment: "Current-standard whole-card revalidation with separated evidence lanes for 本|ほん checked generated surface, Japanese-source evidence, example sentence 日本語の本を読みます。, reading にほんごのほんをよみます。, translation I read a Japanese book., notes/support surface Core beginner noun for book., reading breakdown 本 （ほん） ／ book, meaning book, labels JLPT N5; JLPT core + reading coverage; focus 本; covers 本: ほん, audio word-reading-本-ほん, pitch accent source kanjium-cc-by-sa-4.0 pattern 1 [atamadaka] rendered Pitch 1: 1, media provenance, release judgment common useful learner-friendly level-appropriate natural, and verification limitations no active limitations.",
        },
        sentenceAudioReview: {
            category: "word-example-sentence",
            source: "voicevox-nemo",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
            assetPath: "audio/672C_本-word-example-sentence-0123456789abcdef.wav",
            identityHash: "0123456789abcdef",
            example: "日本語の本を読みます。",
            reading: "にほんごのほんをよみます。",
            translation: "I read a Japanese book.",
            exactExampleText: true,
            exactExampleReading: true,
            policyCompliant: true,
            readyToReview: true,
            reviewerJudgment: "Fixture example-sentence audio is generated only after the reviewed sentence passed natural-language and learner-usefulness review, then matched exact text, reading, category, source, voice, locale, asset, and identity hash.",
        },
        ...overrides,
    };
}

function buildWordEntry(overrides = {}) {
    return {
        word: "本",
        status: "platinum",
        readingIncludes: ["ほん"],
        meaningIncludes: ["book"],
        jlptLevelIncludes: ["JLPT N5"],
        coverageRoleIncludes: ["JLPT core + reading coverage"],
        focusIncludes: ["本"],
        coversReadingIncludes: ["本: ほん"],
        breakdownIncludes: ["本 （ほん） ／ book"],
        exampleIncludes: ["日本語の本を読みます。"],
        pitchAccentIncludes: ["Pitch 1: 1"],
        notesIncludes: ["Core beginner noun for book."],
        selectionRationale: "本|ほん is a common beginner noun and belongs in the N5 word deck.",
        reviewedAt: "2026-05-19",
        reviewer: "codex-platinum-review",
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-05-19",
        revalidationSummary: "Revalidated evidence lanes for generated surface, Japanese-source evidence, example sentence, notes/support surface, reading breakdown, labels, audio, pitch accent, media provenance, and verification limitations under the current word platinum standard.",
        sourceEvidence: REQUIRED_WORD_SOURCE_EVIDENCE_TYPES.map((type) => ({
            type,
            source: "fixture source",
            detail: "JMdict dictionary source verified 本|ほん, reading ほん, learner meaning book, and example 日本語の本を読みます。",
        })),
        internalChecks: REQUIRED_WORD_INTERNAL_CHECK_TYPES.map((type) => {
            const details = {
                "generated-surface": "Generated word-card surface inspected for 本|ほん: word, reading, meaning book, example 日本語の本を読みます。, audio, and pitch accent fields.",
                "golden-regression": "Separate golden regression gate checked 本|ほん; this regression gate protects generated field expectations but is not source truth and not source evidence.",
                "level-contract": "templates/jlpt_word_level_contract.json lists 本|ほん for JLPT N5.",
                "media-audit": "Managed media provenance audit checked 本|ほん exact asset fragment word-reading-本-ほん in tracked media.",
                "audio-review": "Audio review checked 本|ほん exact asset fragment word-reading-本-ほん.",
                "pitch-accent-review": "Pitch accent review checked 本|ほん source kanjium-cc-by-sa-4.0 pattern 1 [atamadaka] and rendered label Pitch 1: 1.",
                "label-review": "Label review checked 本|ほん JLPT N5, JLPT core + reading coverage, focus 本, and covered readings 本: ほん.",
            };
            return {
                type,
                source: "fixture source",
                detail: details[type],
            };
        }),
        reviewEvidence: REQUIRED_WORD_REVIEW_EVIDENCE_TYPES.map((type) => {
            const details = {
                "example-review": "Example review checked 本|ほん, reading ほん, sentence 日本語の本を読みます。, and the exported reading line for release quality.",
                "manual-review": "Manual review judged 本|ほん common and learner-friendly for the N5 word deck, with accurate reading ほん, meaning book, and example 日本語の本を読みます。",
                "current-standard-review": buildWordProvenance().sentenceQualityReview.reviewerJudgment,
            };
            return {
                type,
                source: "fixture source",
                detail: details[type],
            };
        }),
        qualityGates: Object.fromEntries(REQUIRED_WORD_QUALITY_GATES.map((gate) => [gate, true])),
        rereviewProvenance: buildWordProvenance(),
        ...overrides,
    };
}

function buildWordSapphireEntry(overrides = {}) {
    return {
        word: "本",
        status: "sapphire",
        readingIncludes: ["ほん"],
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        ...overrides,
    };
}

function buildWordGoldExpectation(overrides = {}) {
    const entry = buildWordEntry(overrides);
    return {
        word: entry.word,
        readingIncludes: entry.readingIncludes,
        meaningIncludes: entry.meaningIncludes,
        jlptLevelIncludes: entry.jlptLevelIncludes,
        coverageRoleIncludes: entry.coverageRoleIncludes,
        focusIncludes: entry.focusIncludes,
        coversReadingIncludes: entry.coversReadingIncludes,
        breakdownIncludes: entry.breakdownIncludes,
        exampleIncludes: entry.exampleIncludes,
        notesIncludes: entry.notesIncludes,
    };
}

function buildWordSapphireResult(overrides = {}) {
    const entry = buildWordEntry(overrides);
    const reading = (Array.isArray(entry.readingIncludes) ? entry.readingIncludes : [])[0] || "";
    return {
        identity: `${entry.word}|${reading}`,
        passed: true,
    };
}

function buildWordPriorLaneFixture(overrides = {}) {
    return {
        goldenExpectations: [buildWordGoldExpectation(overrides)],
        sapphireEntries: [buildWordSapphireEntry(overrides)],
        sapphireResults: [buildWordSapphireResult(overrides)],
    };
}

function buildWordProofEvent(overrides = {}) {
    const provenance = buildWordProvenance();
    return {
        schemaVersion: 1,
        recordType: "obsidian-proof-event",
        proofId: "word-n5-obsidian-002-01",
        target: {
            deckKind: "word",
            level: 5,
            written: "本",
            reading: "ほん",
            cardReviewed: "本|ほん",
        },
        batch: {
            id: provenance.batchId,
            sequence: 2,
        },
        proof: {
            type: provenance.type,
            obsidianStandardVersion: provenance.obsidianStandardVersion,
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
            sentenceAudioReview: provenance.sentenceAudioReview,
        },
        authority: OBSIDIAN_PROOF_LEDGER_AUTHORITY,
        ledger: {
            recordedAt: "2026-05-27",
            recordedBy: "fixture-writer",
            sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
            sourceCommit: "abcdef1",
            representationMigration: false,
        },
        ...overrides,
    };
}

function buildFieldSourceInputs() {
    return {
        jlptLevelContract: {
            kanjiLevels: {
                "常": 3,
            },
        },
        platinumCardSourceManifest: {
            sources: {
                kanjipedia_manual: {
                    status: "active",
                    allowedUse: ["kanji-field-verification"],
                    licenseUse: { status: "restricted" },
                    sourceFamily: "kanjipedia",
                    independenceGroup: "kanjipedia",
                    matchers: ["Kanjipedia", "kanjipedia.jp"],
                },
            },
        },
        sourceOriginEvidence: {
            sources: {},
            assignments: {},
        },
    };
}

test("provider parity script parses levels, consumer, json, and unknown args", () => {
    const options = parseArgs([
        "--levels=3",
        "--consumer=kanji-batch-report",
        "--kanji=常,幸",
        "--limit=8",
        "--queue=substantive-rereview",
        "--row-source=generated",
        "--json",
        "--unexpected",
    ]);

    assert.deepEqual(options.levels, [3]);
    assert.equal(options.consumer, "kanji-batch-report");
    assert.deepEqual(options.kanji, ["常", "幸"]);
    assert.equal(options.limit, 8);
    assert.equal(options.queue, "substantive-rereview");
    assert.equal(options.rowSource, "generated");
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("provider parity script parses platinum-level consumer options", () => {
    const options = parseArgs([
        "--levels=3",
        "--consumer=kanji-platinum-level",
        "--allow-legacy-standard",
        "--allow-empty",
    ]);

    assert.equal(options.consumer, "kanji-platinum-level");
    assert.equal(options.requireCurrentReviewStandard, false);
    assert.equal(options.allowEmpty, true);
    assert.equal(options.requireAllRows, true);
});

test("provider parity script parses kanji field-source contract consumer", () => {
    const options = parseArgs([
        "--levels=3",
        "--consumer=kanji-field-source-contract",
    ]);

    assert.equal(options.consumer, "kanji-field-source-contract");
});

test("provider parity script parses platinum governance gate consumer", () => {
    const options = parseArgs([
        "--levels=3",
        "--consumer=platinum-governance-gate",
    ]);

    assert.equal(options.consumer, "platinum-governance-gate");
});

test("provider parity script parses word rereview-status consumer and deck kind", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--consumer=word-rereview-status",
        "--deck-kind=word",
        "--row-source=tracked-review-set",
    ]);

    assert.equal(options.consumer, "word-rereview-status");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("provider parity defaults to word rereview-status for word deck kind", () => {
    const options = parseArgs([
        "--levels=5",
        "--deck-kind=word",
    ]);

    assert.equal(options.consumer, "word-rereview-status");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5]);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("provider parity script parses word platinum-level consumer and deck kind", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--consumer=word-platinum-level",
        "--deck-kind=word",
        "--row-source=tracked-review-set",
        "--allow-legacy-standard",
        "--allow-empty",
    ]);

    assert.equal(options.consumer, "word-platinum-level");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
    assert.equal(options.requireCurrentReviewStandard, false);
    assert.equal(options.allowEmpty, true);
});

test("provider parity script parses word governance inputs consumer and deck kind", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--consumer=word-governance-inputs",
        "--deck-kind=word",
        "--row-source=tracked-review-set",
    ]);

    assert.equal(options.consumer, "word-governance-inputs");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("provider parity script parses word batch-report consumer and word targets", () => {
    const options = parseArgs([
        "--levels=5",
        "--consumer=word-batch-report",
        "--deck-kind=word",
        "--words=本:ほん,今日|きょう",
        "--limit=2",
        "--row-source=tracked-review-set",
    ]);

    assert.equal(options.consumer, "word-batch-report");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5]);
    assert.deepEqual(options.words, [
        { word: "本", reading: "ほん" },
        { word: "今日", reading: "きょう" },
    ]);
    assert.equal(options.limit, 2);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("provider parity script parses word certify-status consumer and deck kind", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--consumer=word-certify-status",
        "--deck-kind=word",
        "--row-source=tracked-review-set",
    ]);

    assert.equal(options.consumer, "word-certify-status");
    assert.equal(options.deckKind, "word");
    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("provider parity defaults to CI-safe tracked review-set rows", () => {
    const options = parseArgs([]);

    assert.equal(options.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
});

test("tracked review-set rows preserve card identity without local generated data", () => {
    const rows = buildTrackedReviewSetRows([buildEntry()], 3);

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        kanji: "常",
        levelLabel: "N3",
        displayWord: "常",
        meaningJP: "normal / usual",
        primaryReading: "じょう",
        kanjiMeanings: "normal / usual / regular",
        studyWordKanji: "",
        onReading: "On: じょう",
        kunReading: "",
        strokeOrder: "<img src=\"常-stroke-order.gif\" />",
        audio: "[sound:常-kanji-reading-常-じょう.wav]",
        radical: "",
        notes: "常 ／ 日常",
        exampleSentence: "日常の生活を大切にしています。",
    });
});

test("tracked word review-set rows preserve word identity without local generated data", () => {
    const rows = buildTrackedWordReviewSetRows([buildWordEntry()], 5);

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
        word: "本",
        reading: "ほん",
        readingBreakdown: "本 （ほん） ／ book",
        audio: "[sound:本-word-reading-本-ほん.wav]",
        pitchAccent: "Pitch 1: 1",
        meaning: "book",
        jlptLevel: "JLPT N5",
        coverageRole: "JLPT core + reading coverage",
        focusKanji: "本",
        coversReading: "本: ほん",
        kanjiBreakdown: "本 （ほん） ／ book",
        exampleSentence: "日本語の本を読みます。",
        notes: "Core beginner noun for book.",
    });
});

test("provider parity report can run from tracked proof inputs without local data files", async () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeReviewSet(rootDir, [buildEntry()]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = await buildObsidianProofProviderParityReport({
        cwd: rootDir,
        levels: [3],
        config: {
            curatedStudyDataPath: path.join(rootDir, "data", "curated_study_data.json"),
        },
    });

    assert.equal(report.passed, true);
    assert.equal(report.rowSource, ROW_SOURCES.TRACKED_REVIEW_SET);
    assert.equal(report.scopes[0].inlineProjection.generatedRows, 1);
    assert.equal(report.scopes[0].ledgerProjection.generatedRows, 1);
});

test("word rereview-status provider parity passes when inline and ledger projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildWordProofEvent()]);

    const scope = buildWordRereviewStatusProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.counts.substantive_current_standard_review_proven, 1);
});

test("word batch-report provider parity passes when inline and ledger projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildWordProofEvent()]);

    const scope = buildWordBatchReportProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        limit: 1,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.summary.substantiveRereviewProven, 1);
    assert.equal(scope.ledgerProjection.summary.substantiveRereviewProven, 1);
    assert.deepEqual(scope.inlineProjection.cards.map((card) => card.identity), []);
    assert.deepEqual(scope.ledgerProjection.cards.map((card) => card.identity), []);
});

test("word batch-report provider parity fails when ledger changes queue selection", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildWordBatchReportProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        limit: 1,
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "word-batch-report",
        deckKind: "word",
        levels: [5],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.summary.selectedCards, 0);
    assert.equal(scope.ledgerProjection.summary.selectedCards, 1);
    assert.deepEqual(scope.mismatch.inlineSelectedWords, []);
    assert.deepEqual(scope.mismatch.ledgerSelectedWords, ["本|ほん"]);
    assert.match(formatted, /Inline selected words/);
    assert.match(formatted, /Ledger selected words/);
});

test("word certify-status provider parity passes when inline and ledger projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildWordProofEvent()]);

    const scope = buildWordCertificationStatusProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.inlineProjection.failureCount, 0);
    assert.equal(scope.ledgerProjection.failureCount, 0);
    assert.equal(scope.inlineProjection.totals.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.totals.substantive_current_standard_review_proven, 1);
});

test("word certify-status provider parity fails when ledger misses inline proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildWordCertificationStatusProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "word-certify-status",
        deckKind: "word",
        levels: [5],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, false);
    assert.equal(scope.inlineProjection.failureCount, 0);
    assert.equal(scope.ledgerProjection.failureCount, 1);
    assert.match(formatted, /Inline gate/);
    assert.match(formatted, /Ledger gate/);
});

test("word platinum-level provider parity passes when structural projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildWordProofEvent()]);

    const scope = buildWordPlatinumLevelProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.inlineProjection.currentStandardPlatinumCount, 1);
    assert.equal(scope.ledgerProjection.currentStandardPlatinumCount, 1);
});

test("word platinum-level provider parity keeps structural gate stable when ledger proof is absent", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildWordPlatinumLevelProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.ledgerProvider.inlineProofsOmitted, 1);
});

test("word governance inputs provider parity passes when gate projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildWordProofEvent()]);

    const scope = buildWordGovernanceInputsProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.inlineProjection.wordRereviewReports[0].counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.wordRereviewReports[0].counts.substantive_current_standard_review_proven, 1);
});

test("word governance inputs provider parity fails when word proof warning posture drifts", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildWordGovernanceInputsProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [buildWordEntry()],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "word-governance-inputs",
        deckKind: "word",
        levels: [5],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.wordRereviewReports[0].counts.needs_substantive_rereview, 0);
    assert.equal(scope.ledgerProjection.wordRereviewReports[0].counts.needs_substantive_rereview, 1);
    assert.match(formatted, /Inline governance gate/);
    assert.match(formatted, /Inline coverage/);
});

test("kanji rereview-status provider parity passes when inline and ledger projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const scope = buildKanjiRereviewStatusProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.counts.substantive_current_standard_review_proven, 1);
});

test("kanji rereview-status provider parity passes canonical ledger integrity after inline proof removal", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);
    const { rereviewProvenance, ...entryWithoutInlineProof } = buildEntry();

    const scope = buildKanjiRereviewStatusProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [entryWithoutInlineProof],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });

    assert.equal(rereviewProvenance.cardReviewed, "常|じょう");
    assert.equal(scope.passed, true);
    assert.equal(scope.comparisonMode, "canonical-ledger-integrity");
    assert.equal(scope.inlineProofCount, 0);
    assert.equal(scope.inlineProjection.counts.needs_substantive_rereview, 1);
    assert.equal(scope.ledgerProjection.counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProvider.ledgerProofsApplied, 1);
});

test("word rereview-status provider parity counts legacy same-target proof as superseded history", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    const currentEvent = buildWordProofEvent();
    const legacyProof = { ...currentEvent.proof };
    delete legacyProof.obsidianStandardVersion;
    delete legacyProof.sentenceAudioReview;
    const legacyEvent = buildWordProofEvent({
        proofId: "word-n5-obsidian-legacy-fixture-01",
        batch: {
            id: "n5-word-obsidian-legacy-fixture-batch",
            sequence: 1,
        },
        proof: legacyProof,
    });
    writeLedger(rootDir, [legacyEvent, currentEvent]);
    const { rereviewProvenance, ...entryWithoutInlineProof } = buildWordEntry();

    const scope = buildWordRereviewStatusProviderParityForLevel({
        rows: [buildWordRow()],
        rawEntries: [entryWithoutInlineProof],
        ...buildWordPriorLaneFixture(),
        cwd: rootDir,
        level: 5,
        sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
        wordPitchAccentData: {
            sources: {
                "kanjium-cc-by-sa-4.0": {
                    name: "Kanjium pitch accent database",
                    license: "CC BY-SA 4.0",
                },
            },
            entries: {
                "本|ほん": {
                    pattern: "1 [atamadaka]",
                    sourceId: "kanjium-cc-by-sa-4.0",
                    sourceWord: "本",
                    sourceReading: "ほん",
                    sourceAccent: "1",
                },
            },
        },
        kanjiLevelData: null,
    });

    assert.equal(rereviewProvenance.cardReviewed, "本|ほん");
    assert.equal(scope.passed, true);
    assert.equal(scope.comparisonMode, "canonical-ledger-integrity");
    assert.equal(scope.inlineProofCount, 0);
    assert.equal(scope.ledgerProvider.ledgerProofEvents, 2);
    assert.equal(scope.ledgerProvider.ledgerProofTargets, 1);
    assert.equal(scope.ledgerProvider.ledgerProofsApplied, 1);
    assert.equal(scope.ledgerProvider.ledgerProofEventsSuperseded, 1);
    assert.equal(scope.ledgerProjection.counts.substantive_current_standard_review_proven, 1);
});

test("kanji platinum-level provider parity passes when structural projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const scope = buildKanjiPlatinumLevelProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.inlineProjection.currentStandardPlatinumCount, 1);
    assert.equal(scope.ledgerProjection.currentStandardPlatinumCount, 1);
});

test("kanji platinum-level provider parity keeps structural gate stable when ledger proof is absent", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildKanjiPlatinumLevelProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.ledgerProvider.inlineProofsOmitted, 1);
});

test("kanji field-source contract provider parity passes when contract projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const scope = buildKanjiFieldSourceContractProviderParityForLevel({
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        fieldSourceInputs: buildFieldSourceInputs(),
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.coverage.entryCount, 1);
    assert.equal(scope.ledgerProjection.coverage.entryCount, 1);
    assert.equal(scope.inlineProjection.entries["常"].reviewBinding.rereviewReviewedAt, "2026-05-26");
    assert.equal(scope.ledgerProjection.entries["常"].reviewBinding.rereviewReviewedAt, "2026-05-26");
});

test("kanji field-source contract provider parity fails when rereview binding would drift", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildKanjiFieldSourceContractProviderParityForLevel({
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        fieldSourceInputs: buildFieldSourceInputs(),
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "kanji-field-source-contract",
        levels: [3],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.entries["常"].reviewBinding.rereviewReviewedAt, "2026-05-26");
    assert.equal(scope.ledgerProjection.entries["常"].reviewBinding.rereviewReviewedAt, "");
    assert.match(formatted, /Inline coverage/);
});

test("platinum governance gate provider parity passes when kanji gate projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const scope = buildPlatinumGovernanceGateProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.passed, true);
    assert.equal(scope.ledgerProjection.passed, true);
    assert.equal(scope.inlineProjection.kanjiRereviewReports[0].counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.kanjiRereviewReports[0].counts.substantive_current_standard_review_proven, 1);
});

test("platinum governance gate provider parity fails when kanji proof warning posture drifts", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildPlatinumGovernanceGateProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "platinum-governance-gate",
        levels: [3],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.kanjiRereviewReports[0].counts.needs_substantive_rereview, 0);
    assert.equal(scope.ledgerProjection.kanjiRereviewReports[0].counts.needs_substantive_rereview, 1);
    assert.match(formatted, /Inline governance gate/);
});

test("kanji rereview-status provider parity fails when ledger misses inline proof", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildKanjiRereviewStatusProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        kanjiSourceEvidence: { assignments: {}, sources: {} },
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "kanji-rereview-status",
        levels: [3],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.counts.substantive_current_standard_review_proven, 1);
    assert.equal(scope.ledgerProjection.counts.needs_substantive_rereview, 1);
    assert.match(formatted, /Inline counts/);
    assert.match(formatted, /Ledger queue samples/);
});

test("kanji batch-report provider parity passes when inline and ledger projections match", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const scope = buildKanjiBatchReportProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        sapphireEntries: [buildSapphireEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        limit: 1,
    });

    assert.equal(scope.passed, true);
    assert.equal(scope.inlineProjection.summary.substantiveRereviewProven, 1);
    assert.equal(scope.ledgerProjection.summary.substantiveRereviewProven, 1);
    assert.deepEqual(scope.inlineProjection.cards.map((card) => card.kanji), []);
    assert.deepEqual(scope.ledgerProjection.cards.map((card) => card.kanji), []);
});

test("kanji batch-report provider parity fails when ledger changes queue selection", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-provider-parity-"));
    writeLedger(rootDir, []);

    const scope = buildKanjiBatchReportProviderParityForLevel({
        rows: [buildRow()],
        rawEntries: [buildEntry()],
        sapphireEntries: [buildSapphireEntry()],
        cwd: rootDir,
        level: 3,
        sourceReviewSetPath: "templates/platinum_n3_review_set.json",
        limit: 1,
    });
    const formatted = formatObsidianProofProviderParityReport({
        passed: false,
        consumer: "kanji-batch-report",
        levels: [3],
        scopes: [scope],
    });

    assert.equal(scope.passed, false);
    assert.equal(scope.inlineProjection.summary.selectedCards, 0);
    assert.equal(scope.ledgerProjection.summary.selectedCards, 1);
    assert.deepEqual(scope.mismatch.inlineSelectedKanji, []);
    assert.deepEqual(scope.mismatch.ledgerSelectedKanji, ["常"]);
    assert.match(formatted, /Inline selected kanji/);
    assert.match(formatted, /Ledger selected kanji/);
});
