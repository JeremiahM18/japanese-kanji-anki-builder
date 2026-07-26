const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildObsidianProofLedgerAppendReport,
    GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR,
    parseDraftEventsText,
    runObsidianProofLedgerAppend,
} = require("../src/services/obsidianProofLedgerAppendService");
const {
    parseArgs,
} = require("../scripts/appendObsidianProofLedgerEvents");

function makeWorkspace() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-append-"));
    fs.mkdirSync(path.join(rootDir, "templates", "obsidian_proof_ledger"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "obsidian-proof", "drafts"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "templates", "platinum_n3_review_set.json"), `${JSON.stringify([
        {
            kanji: "常",
            status: "platinum",
            readingIncludes: ["じょう"],
            meaningIncludes: ["usual"],
            kanjiMeaningsIncludes: ["usual", "normal"],
            exampleIncludes: ["日常の生活を大切にしています。"],
        },
        {
            kanji: "幸",
            status: "platinum",
            readingIncludes: ["しあわせ"],
            meaningIncludes: ["happiness"],
            kanjiMeaningsIncludes: ["happiness", "fortune"],
            exampleIncludes: ["家族の幸せを願っています。"],
        },
    ], null, 2)}\n`, "utf8");
    return rootDir;
}

function makeWordWorkspace() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-word-append-"));
    fs.mkdirSync(path.join(rootDir, "templates", "obsidian_proof_ledger"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "obsidian-proof", "drafts"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "templates", "platinum_n5_word_review_set.json"), `${JSON.stringify([
        {
            word: "日本",
            status: "platinum",
            readingIncludes: ["にほん"],
            meaningIncludes: ["Japan"],
            exampleIncludes: ["日本に行きます。"],
        },
    ], null, 2)}\n`, "utf8");
    return rootDir;
}

function buildProofEvent(overrides = {}) {
    return {
        schemaVersion: 1,
        recordType: "obsidian-proof-event",
        proofId: "kanji-n3-obsidian-append-fixture-01",
        target: {
            deckKind: "kanji",
            level: 3,
            written: "常",
            reading: "じょう",
            cardReviewed: "常|じょう",
        },
        batch: {
            id: "n3-kanji-obsidian-rereview-batch-999",
            sequence: 999,
        },
        proof: {
            type: "substantive current standard rereview",
            reviewStandard: "kanji-platinum-v3-evidence-lanes",
            reviewedAt: "2026-05-28",
            reviewer: "fixture-reviewer",
            reviewedAfterStandard: true,
            mechanicalMigration: false,
            result: "approved_for_current_standard_platinum",
            scope: "full kanji card rereview from square zero",
            cardReviewed: "常|じょう",
            evidenceChecked: [
                "live generated kanji card surface checked for 常|じょう",
                "tracked Platinum review set checked as card identity and structural context",
                "governed japanese-source evidence checked for 常|じょう",
                "primary reading, on/kun compatibility, learner meaning, and broader meanings checked",
                "example sentence checked for natural Japanese, learner usefulness, level appropriateness, support-only usage, reading, and translation",
                "notes and support vocabulary checked for learner usefulness",
                "exact primary-reading audio identity checked for 常|じょう",
                "stroke-order media identity checked for 常",
                "evidence lanes kept separate from generated output and NLP support",
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
                reviewerJudgment: "Fixture reviewer checked naturalness, usefulness, level fit, reading, and translation.",
            },
            reviewSession: {
                mode: "card-by-card-observable-rereview",
                source: "live-generated-card-and-tracked-evidence",
                generatedFromPriorLaneOnly: false,
                batchReportOnly: false,
            },
        },
        authority: {
            sourceOfTruth: "tracked-jsonl-obsidian-proof-ledger",
            generatedCompatibilityView: true,
            generatedSqliteMirror: true,
            boundary: "Obsidian proof only; not source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
        },
        ledger: {
            recordedAt: "2026-05-28",
            recordedBy: "fixture-reviewer",
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
        proofId: "word-n5-obsidian-append-fixture-01",
        target: {
            deckKind: "word",
            level: 5,
            written: "日本",
            reading: "にほん",
            cardReviewed: "日本|にほん",
        },
        batch: {
            id: "n5-word-obsidian-rereview-batch-999",
            sequence: 999,
        },
        proof: {
            type: "substantive current standard rereview",
            reviewStandard: "word-platinum-v3-evidence-lanes",
            obsidianStandardVersion: "word-obsidian-v2.5-sentence-audio",
            reviewedAt: "2026-07-02",
            reviewer: "word-rereview-owner",
            reviewedAfterStandard: true,
            mechanicalMigration: false,
            result: "approved_for_current_standard_obsidian",
            scope: "full word card rereview from square zero",
            cardReviewed: "日本|にほん",
            evidenceChecked: [
                "Substantive post-v3 Obsidian rereview; not mechanically migrated.",
                "Live generated word surface checked for 日本|にほん.",
                "Governed Japanese-source evidence checked for 日本|にほん.",
                "Learner-facing meaning checked for Japan.",
                "Example sentence quality review checked for 日本に行きます。 / にほんにいきます。 / I go to Japan.",
                "Notes support surface checked for source-level limitations.",
                "Reading breakdown checked for 日 （に） / 本 （ほん）.",
                "JLPT, coverage, focus, and covers labels checked for 日本|にほん.",
                "Exact word reading audio identity checked for word-reading-日本-にほん.",
                "Exact example sentence audio identity checked for word-example-sentence 日本に行きます。 / にほんにいきます。.",
                "Pitch accent source and rendered label checked.",
                "Managed media provenance checked.",
                "Golden regression checked as internal regression and not source truth.",
                "Word-deck product fit and learner usefulness checked.",
                "Verification limitations considered.",
            ],
            limitationDecision: "no active limitation remains",
            sentenceQualityReview: {
                example: "日本に行きます。",
                reading: "にほんにいきます。",
                translation: "I go to Japan.",
                naturalJapanese: true,
                learnerUseful: true,
                levelAppropriate: true,
                releaseQuality: true,
                reviewerJudgment: "Fixture reviewer checked naturalness, usefulness, level fit, reading, and translation.",
            },
            sentenceAudioReview: {
                category: "word-example-sentence",
                source: "voicevox-nemo",
                voice: "女声1 / ノーマル",
                locale: "ja-JP",
                assetPath: "audio/65E5_日-word-example-sentence-0123456789abcdef.wav",
                identityHash: "0123456789abcdef",
                example: "日本に行きます。",
                reading: "にほんにいきます。",
                translation: "I go to Japan.",
                exactExampleText: true,
                exactExampleReading: true,
                policyCompliant: true,
                readyToReview: true,
                reviewerJudgment: "Fixture reviewer checked exact managed example sentence audio provenance for the reviewed example.",
            },
            reviewSession: {
                mode: "card-by-card-observable-rereview",
                source: "live-generated-card-and-tracked-evidence",
                generatedFromPriorLaneOnly: false,
                batchReportOnly: false,
            },
        },
        authority: {
            sourceOfTruth: "tracked-jsonl-obsidian-proof-ledger",
            generatedCompatibilityView: true,
            generatedSqliteMirror: true,
            boundary: "Obsidian proof only; not source evidence, generated TSV authority, APKG authority, NLP certification, or release readiness.",
        },
        ledger: {
            recordedAt: "2026-07-02",
            recordedBy: "word-rereview-owner",
            sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
            sourceCommit: "abcdef1",
            representationMigration: false,
        },
        ...overrides,
    };
}

function writeDraft(rootDir, value, fileName = "events.jsonl") {
    const filePath = path.join(rootDir, GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR, fileName);
    const text = Array.isArray(value)
        ? `${value.map((event) => JSON.stringify(event)).join("\n")}\n`
        : `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(filePath, text, "utf8");
    return path.relative(rootDir, filePath);
}

function writeAdHocLaneBatchDraft(rootDir, value, fileName = "events.jsonl") {
    const filePath = path.join(rootDir, "out", "lane-batches", fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const text = Array.isArray(value)
        ? `${value.map((event) => JSON.stringify(event)).join("\n")}\n`
        : `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(filePath, text, "utf8");
    return path.relative(rootDir, filePath);
}

test("parseArgs keeps append command dry-run by default", () => {
    assert.deepEqual(parseArgs(["--events=out/obsidian-proof/drafts/events.jsonl"]), {
        write: false,
        json: false,
        eventsPath: "out/obsidian-proof/drafts/events.jsonl",
        ledgerDir: undefined,
        unknownArgs: [],
    });
});

test("parseDraftEventsText accepts JSONL and JSON event containers", () => {
    const event = buildProofEvent();
    assert.equal(parseDraftEventsText(`${JSON.stringify(event)}\n`, { filePath: "events.jsonl" }).length, 1);
    assert.equal(parseDraftEventsText(JSON.stringify([event]), { filePath: "events.json" }).length, 1);
    assert.equal(parseDraftEventsText(JSON.stringify({ events: [event] }), { filePath: "events.json" }).length, 1);
});

test("append dry-run validates complete events without writing ledger output", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent()]);
    const report = buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    });
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3.jsonl");

    assert.equal(report.passed, true);
    assert.equal(report.write, false);
    assert.equal(report.appendEvents, 1);
    assert.equal(report.ledgerOutputPath, "templates/obsidian_proof_ledger/kanji_n3.jsonl");
    assert.deepEqual(report.targets, ["kanji:n3:常|じょう"]);
    assert.equal(fs.existsSync(ledgerPath), false);
});

test("append dry-run validates word proof against Obsidian status predicate", () => {
    const rootDir = makeWordWorkspace();
    const eventsPath = writeDraft(rootDir, [buildWordProofEvent()]);
    const report = buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    });
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "word_n5.jsonl");

    assert.equal(report.passed, true);
    assert.equal(report.write, false);
    assert.equal(report.appendEvents, 1);
    assert.equal(report.ledgerOutputPath, "templates/obsidian_proof_ledger/word_n5.jsonl");
    assert.deepEqual(report.targets, ["word:n5:日本|にほん"]);
    assert.equal(fs.existsSync(ledgerPath), false);
});

test("append rejects word proof that would not count in Obsidian status", () => {
    const rootDir = makeWordWorkspace();
    const baseEvent = buildWordProofEvent();
    const eventsPath = writeDraft(rootDir, [buildWordProofEvent({
        proof: {
            ...baseEvent.proof,
            evidenceChecked: baseEvent.proof.evidenceChecked.map((entry) => (
                entry.startsWith("Exact word reading audio identity")
                    ? "Exact word-reading-日本-にほん identity checked without the status checklist phrase."
                    : entry
            )),
        },
    })]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /would not count as substantive current-standard proof.*日本\|にほん/);
});

test("append rejects ad hoc lane-batch proof drafts", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeAdHocLaneBatchDraft(rootDir, [buildProofEvent()]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /must stay under out\/obsidian-proof\/drafts/);
});

test("append rejects new proof without an explicit card-by-card review session", () => {
    const rootDir = makeWorkspace();
    const event = buildProofEvent();
    delete event.proof.reviewSession;
    const eventsPath = writeDraft(rootDir, [event]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /missing proof\.reviewSession/);
});

test("append rejects generated or automated author identities for new proof", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent({
        proof: {
            ...buildProofEvent().proof,
            reviewer: "codex-generated-proof-helper",
        },
        ledger: {
            ...buildProofEvent().ledger,
            recordedBy: "script-generator",
        },
    })]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /not generated or automated tooling/);
});

test("append write appends canonical JSONL and runs reconciliation", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent()]);
    const report = runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath,
        write: true,
    });
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3.jsonl");

    assert.equal(report.passed, true);
    assert.equal(report.write, true);
    assert.equal(report.reconciliation.passed, true);
    assert.equal(report.reconciliation.totals.ledgerProofs, 1);
    assert.equal(report.reconciliation.totals.canonicalLedgerProofs, 1);
    assert.match(fs.readFileSync(ledgerPath, "utf8"), /kanji-n3-obsidian-append-fixture-01/);
});

test("append write preserves JSONL boundaries when existing ledger lacks final newline", () => {
    const rootDir = makeWorkspace();
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3.jsonl");
    fs.writeFileSync(ledgerPath, JSON.stringify(buildProofEvent()), "utf8");
    const secondEvent = buildProofEvent({
        proofId: "kanji-n3-obsidian-append-fixture-02",
        target: {
            deckKind: "kanji",
            level: 3,
            written: "幸",
            reading: "しあわせ",
            cardReviewed: "幸|しあわせ",
        },
        proof: {
            ...buildProofEvent().proof,
            cardReviewed: "幸|しあわせ",
            sentenceQualityReview: {
                example: "家族の幸せを願っています。",
                reading: "かぞくのしあわせをねがっています。",
                translation: "I wish for my family's happiness.",
                naturalJapanese: true,
                learnerUseful: true,
                levelAppropriate: true,
                supportOnly: true,
                reviewerJudgment: "Fixture reviewer checked naturalness, usefulness, level fit, reading, and translation.",
            },
        },
    });
    const eventsPath = writeDraft(rootDir, [secondEvent]);

    const report = runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath,
        write: true,
    });
    const ledgerLines = fs.readFileSync(ledgerPath, "utf8").trimEnd().split("\n");

    assert.equal(report.passed, true);
    assert.equal(report.reconciliation.totals.canonicalLedgerProofs, 2);
    assert.equal(ledgerLines.length, 2);
    assert.match(ledgerLines[0], /kanji-n3-obsidian-append-fixture-01/);
    assert.match(ledgerLines[1], /kanji-n3-obsidian-append-fixture-02/);
});

test("append write rolls the ledger back when post-write reconciliation fails", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent()]);
    const ledgerPath = path.join(rootDir, "templates", "obsidian_proof_ledger", "kanji_n3.jsonl");

    assert.throws(() => runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath,
        write: true,
        buildReconciliationReport() {
            return {
                passed: false,
                totals: {
                    ledgerProofs: 1,
                    canonicalLedgerProofs: 0,
                    proofMismatches: 1,
                },
                failures: ["injected reconciliation mismatch"],
            };
        },
    }), /rolled back.*Post-write Obsidian proof reconciliation did not pass/);
    assert.equal(fs.existsSync(ledgerPath), false);
});

test("append write revalidates duplicate targets after taking the transaction lock", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent()]);
    let prepareChanges = null;

    assert.throws(() => runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath,
        write: true,
        runFileTransaction(options) {
            prepareChanges = options.prepareChanges;
            runObsidianProofLedgerAppend({
                cwd: rootDir,
                eventsPath,
                write: true,
            });
            return options.prepareChanges();
        },
    }), /already exists/);
    assert.equal(typeof prepareChanges, "function");
});

test("append rejects duplicate existing proof targets", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent()]);
    runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath,
        write: true,
    });

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /already exists/);
});

test("append rejects proof events that do not bind to the tracked review set", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent({
        proofId: "kanji-n3-obsidian-append-fixture-02",
        target: {
            deckKind: "kanji",
            level: 3,
            written: "未",
            reading: "み",
            cardReviewed: "未|み",
        },
        proof: {
            ...buildProofEvent().proof,
            cardReviewed: "未|み",
        },
    })]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /does not bind/);
});
