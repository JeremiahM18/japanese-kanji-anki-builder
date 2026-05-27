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
    REQUIRED_KANJI_INTERNAL_CHECK_TYPES,
    REQUIRED_KANJI_QUALITY_GATES,
    REQUIRED_KANJI_REVIEW_EVIDENCE_TYPES,
    REQUIRED_KANJI_SOURCE_EVIDENCE_TYPES,
} = require("../src/services/platinumKanjiReviewService");
const {
    buildKanjiBatchReportProviderParityForLevel,
    buildKanjiPlatinumLevelProviderParityForLevel,
    buildKanjiRereviewStatusProviderParityForLevel,
    buildObsidianProofProviderParityReport,
    buildTrackedReviewSetRows,
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
