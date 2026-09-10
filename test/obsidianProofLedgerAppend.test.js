const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildObsidianProofLedgerAppendReport: buildObsidianProofLedgerAppendReportService,
    GOVERNED_OBSIDIAN_PROOF_DRAFT_DIR,
    parseDraftEventsText,
    readDraftProofEvents,
    runObsidianProofLedgerAppend: runObsidianProofLedgerAppendService,
} = require("../src/services/obsidianProofLedgerAppendService");
const {
    parseArgs,
} = require("../scripts/appendObsidianProofLedgerEvents");
const {
    hashCanonicalJson,
    hashObsidianProofIntegrityPayload,
    sha256Text,
} = require("../src/services/obsidianProofIntegrityService");
const {
    loadObsidianProofLedger,
    parseObsidianProofLedgerEvent,
} = require("../src/datasets/obsidianProofLedger");
const { parseKanjiTsvForPlatinum } = require("../src/services/kanjiGeneratedRowsService");
const { parseWordTsvForPlatinum } = require("../src/services/wordGeneratedRowsService");

const KANJI_REVIEW_ENTRIES = [
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
];
const WORD_REVIEW_ENTRIES = [{
    word: "日本",
    status: "platinum",
    readingIncludes: ["にほん"],
    meaningIncludes: ["Japan"],
    exampleIncludes: ["日本に行きます。"],
}];
const KANJI_TSV = "Kanji\tPrimaryReading\tMeaningJP\n常\tじょう\tusual\n幸\tしあわせ\thappiness\n";
const WORD_TSV = "Word\tReading\tMeaning\n日本\tにほん\tJapan\n";
const TEST_SOURCE_COMMIT = "a".repeat(40);
const TEST_SOURCE_REVIEW_SET_SHA256 = "b".repeat(64);
const TEST_GIT_BINDING = () => {};

function buildObsidianProofLedgerAppendReport(options) {
    return buildObsidianProofLedgerAppendReportService({
        ...options,
        verifySourceCommitBinding: TEST_GIT_BINDING,
    });
}

function runObsidianProofLedgerAppend(options) {
    return runObsidianProofLedgerAppendService({
        ...options,
        verifySourceCommitBinding: TEST_GIT_BINDING,
    });
}

function makeWorkspace() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-append-"));
    fs.mkdirSync(path.join(rootDir, "templates", "obsidian_proof_ledger"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "obsidian-proof", "drafts"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "build", "exports"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "templates", "platinum_n3_review_set.json"), `${JSON.stringify(KANJI_REVIEW_ENTRIES, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(rootDir, "out", "build", "exports", "jlpt-n3.tsv"), KANJI_TSV, "utf8");
    return rootDir;
}

function runFixtureGit(rootDir, args) {
    const result = spawnSync("git", args, {
        cwd: rootDir,
        encoding: "utf8",
        shell: false,
        windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
}

function initializeFixtureGit(rootDir) {
    runFixtureGit(rootDir, ["init"]);
    runFixtureGit(rootDir, ["config", "user.email", "fixture@example.invalid"]);
    runFixtureGit(rootDir, ["config", "user.name", "Fixture Reviewer"]);
    runFixtureGit(rootDir, ["add", "templates/platinum_n3_review_set.json"]);
    runFixtureGit(rootDir, ["-c", "commit.gpgsign=false", "commit", "-m", "fixture review set"]);
    return runFixtureGit(rootDir, ["rev-parse", "HEAD"]);
}

function makeWordWorkspace() {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-word-append-"));
    fs.mkdirSync(path.join(rootDir, "templates", "obsidian_proof_ledger"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "obsidian-proof", "drafts"), { recursive: true });
    fs.mkdirSync(path.join(rootDir, "out", "word-build", "exports"), { recursive: true });
    fs.writeFileSync(path.join(rootDir, "templates", "platinum_n5_word_review_set.json"), `${JSON.stringify(WORD_REVIEW_ENTRIES, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(rootDir, "out", "word-build", "exports", "jlpt-n5-words.tsv"), WORD_TSV, "utf8");
    return rootDir;
}

function generatedRowForEvent(event) {
    if (event.target.deckKind === "kanji") {
        return parseKanjiTsvForPlatinum(KANJI_TSV, { level: 3 })
            .find((row) => row.kanji === event.target.written && row.primaryReading === event.target.reading)
            || { kanji: event.target.written, primaryReading: event.target.reading };
    }
    return parseWordTsvForPlatinum(WORD_TSV)
        .find((row) => row.word === event.target.written && row.reading === event.target.reading)
        || { word: event.target.written, reading: event.target.reading };
}

function reviewEntryForEvent(event) {
    const entries = event.target.deckKind === "kanji" ? KANJI_REVIEW_ENTRIES : WORD_REVIEW_ENTRIES;
    return entries.find((entry) => (
        (entry.kanji || entry.word) === event.target.written
        && entry.readingIncludes.includes(event.target.reading)
    )) || {
        kanji: event.target.written,
        status: "platinum",
        readingIncludes: [event.target.reading],
    };
}

function sealV2ProofEvent(event) {
    const generatedRow = generatedRowForEvent(event);
    const reviewEntry = reviewEntryForEvent(event);
    const sourcePath = event.target.deckKind === "kanji"
        ? "out/build/exports/jlpt-n3.tsv"
        : "out/word-build/exports/jlpt-n5-words.tsv";
    const sourceText = event.target.deckKind === "kanji" ? KANJI_TSV : WORD_TSV;
    event.integrity = {
        canonicalization: "jkb-json-c14n-v1",
        digestAlgorithm: "sha256",
        generatedCard: {
            sourcePath,
            sourceSha256: sha256Text(sourceText),
            row: generatedRow,
            rowSha256: hashCanonicalJson(generatedRow),
        },
        trackedReviewEntry: {
            entry: reviewEntry,
            entrySha256: hashCanonicalJson(reviewEntry),
        },
        payloadSha256: "0".repeat(64),
    };
    event.integrity.payloadSha256 = hashObsidianProofIntegrityPayload(event);
    return event;
}

function buildRevocationEvent(previousEvent, overrides = {}) {
    const event = {
        schemaVersion: 2,
        recordType: "obsidian-proof-revocation-event",
        proofId: `${previousEvent.proofId}-revoked`,
        target: previousEvent.target,
        authority: previousEvent.authority,
        ledger: previousEvent.ledger,
        lifecycle: {
            action: "revoke",
            previousProofId: previousEvent.proofId,
            obsidianStandardVersion: previousEvent.proof.obsidianStandardVersion,
            reason: "Fixture review found the prior proof must no longer be trusted.",
            reviewerIdentity: previousEvent.proof.reviewerIdentity,
        },
        integrity: {
            canonicalization: "jkb-json-c14n-v1",
            digestAlgorithm: "sha256",
            payloadSha256: "0".repeat(64),
        },
        ...overrides,
    };
    event.integrity.payloadSha256 = hashObsidianProofIntegrityPayload(event);
    return event;
}

function buildProofEvent(overrides = {}) {
    return sealV2ProofEvent({
        schemaVersion: 2,
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
            obsidianStandardVersion: "kanji-obsidian-v2-snapshot-bound",
            reviewedAt: "2026-05-28",
            reviewer: "Fixture Reviewer",
            reviewerIdentity: {
                type: "accountable-review-owner",
                id: "fixture-reviewer",
                displayName: "Fixture Reviewer",
            },
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
            typedChecks: {
                liveGeneratedCard: true,
                trackedReviewEntry: true,
                japaneseSourceEvidence: true,
                learnerFacingMeaning: true,
                exampleSentence: true,
                notesAndSupport: true,
                readingStructure: true,
                levelAndCoverage: true,
                primaryAudioIdentity: true,
                managedMediaProvenance: true,
                laneSeparation: true,
                limitationsReviewed: true,
                strokeOrderIdentity: true,
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
            recordedBy: "Fixture Reviewer",
            recordedByIdentity: {
                type: "accountable-review-owner",
                id: "fixture-reviewer",
                displayName: "Fixture Reviewer",
            },
            sourceReviewSetPath: "templates/platinum_n3_review_set.json",
            sourceCommit: TEST_SOURCE_COMMIT,
            sourceReviewSetSha256: TEST_SOURCE_REVIEW_SET_SHA256,
            representationMigration: false,
        },
        lifecycle: {
            action: "certify",
        },
        ...overrides,
    });
}

function buildWordProofEvent(overrides = {}) {
    return sealV2ProofEvent({
        schemaVersion: 2,
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
            reviewer: "Word Rereview Owner",
            reviewerIdentity: {
                type: "accountable-review-owner",
                id: "word-rereview-owner",
                displayName: "Word Rereview Owner",
            },
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
            typedChecks: {
                liveGeneratedCard: true,
                trackedReviewEntry: true,
                japaneseSourceEvidence: true,
                learnerFacingMeaning: true,
                exampleSentence: true,
                notesAndSupport: true,
                readingStructure: true,
                levelAndCoverage: true,
                primaryAudioIdentity: true,
                managedMediaProvenance: true,
                laneSeparation: true,
                limitationsReviewed: true,
                exampleAudioIdentity: true,
                pitchAccent: true,
                wordDeckProductFit: true,
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
            recordedBy: "Word Rereview Owner",
            recordedByIdentity: {
                type: "accountable-review-owner",
                id: "word-rereview-owner",
                displayName: "Word Rereview Owner",
            },
            sourceReviewSetPath: "templates/platinum_n5_word_review_set.json",
            sourceCommit: TEST_SOURCE_COMMIT,
            sourceReviewSetSha256: TEST_SOURCE_REVIEW_SET_SHA256,
            representationMigration: false,
        },
        lifecycle: {
            action: "certify",
        },
        ...overrides,
    });
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

test("append dry-run materializes calculated v2 bindings from the exact clean Git snapshot", () => {
    const rootDir = makeWorkspace();
    const sourceCommit = initializeFixtureGit(rootDir);
    const event = buildProofEvent();
    delete event.integrity;
    delete event.ledger.sourceCommit;
    delete event.ledger.sourceReviewSetSha256;
    const eventsPath = writeDraft(rootDir, [event]);

    const parsed = readDraftProofEvents({
        cwd: rootDir,
        eventsPath,
        ledgerDir: "templates/obsidian_proof_ledger",
    }).events[0];
    const report = buildObsidianProofLedgerAppendReportService({
        cwd: rootDir,
        eventsPath,
    });

    assert.equal(report.passed, true);
    assert.equal(parsed.ledger.sourceCommit, sourceCommit);
    assert.match(parsed.ledger.sourceReviewSetSha256, /^[a-f0-9]{64}$/);
    assert.equal(parsed.integrity.generatedCard.sourcePath, "out/build/exports/jlpt-n3.tsv");
    assert.match(parsed.integrity.generatedCard.sourceSha256, /^[a-f0-9]{64}$/);
    assert.equal(parsed.integrity.generatedCard.row.kanji, "常");
    assert.match(parsed.integrity.payloadSha256, /^[a-f0-9]{64}$/);
});

test("v2 draft materialization rejects untrusted review-set paths and abbreviated commits before Git reads", () => {
    const rootDir = makeWorkspace();
    const wrongPathEvent = buildProofEvent();
    delete wrongPathEvent.integrity;
    wrongPathEvent.ledger.sourceReviewSetPath = "templates/unrelated.json";
    const wrongPathEvents = writeDraft(rootDir, [wrongPathEvent], "wrong-path.jsonl");

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath: wrongPathEvents,
    }), /Expected templates\/platinum_n3_review_set\.json; calculated integrity was not materialized/);

    const abbreviatedCommitEvent = buildProofEvent();
    delete abbreviatedCommitEvent.integrity;
    abbreviatedCommitEvent.ledger.sourceCommit = "abcdef1";
    const abbreviatedCommitEvents = writeDraft(rootDir, [abbreviatedCommitEvent], "abbreviated-commit.jsonl");

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath: abbreviatedCommitEvents,
    }), /full lowercase 40-character commit/);
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

test("append rejects word proof without the complete typed review checklist", () => {
    const rootDir = makeWordWorkspace();
    const baseEvent = buildWordProofEvent();
    const eventsPath = writeDraft(rootDir, [buildWordProofEvent({
        proof: {
            ...baseEvent.proof,
            typedChecks: {
                ...baseEvent.proof.typedChecks,
                primaryAudioIdentity: false,
            },
        },
    })]);

    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath,
    }), /typedChecks|Invalid input/);
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
    }), /reviewSession/);
});

test("append rejects generated or automated author identities for new proof", () => {
    const rootDir = makeWorkspace();
    const eventsPath = writeDraft(rootDir, [buildProofEvent({
        proof: {
            ...buildProofEvent().proof,
            reviewer: "codex-generated-proof-helper",
            reviewerIdentity: {
                type: "accountable-review-owner",
                id: "codex-generated-proof-helper",
                displayName: "codex-generated-proof-helper",
            },
        },
        ledger: {
            ...buildProofEvent().ledger,
            recordedBy: "script-generator",
            recordedByIdentity: {
                type: "accountable-review-owner",
                id: "script-generator",
                displayName: "script-generator",
            },
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
    }), /already exists|Duplicate Obsidian proof target|lifecycle root/);
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
    }), /already exists|Duplicate Obsidian proof target|lifecycle root/);
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

test("schema-v2 proof detects snapshot and payload tampering", () => {
    const event = buildProofEvent();
    assert.equal(parseObsidianProofLedgerEvent(event).schemaVersion, 2);

    const tamperedRow = JSON.parse(JSON.stringify(event));
    tamperedRow.integrity.generatedCard.row.meaningJP = "changed";
    assert.throws(() => parseObsidianProofLedgerEvent(tamperedRow), /generatedCard\.rowSha256/);

    const tamperedProof = JSON.parse(JSON.stringify(event));
    tamperedProof.proof.limitationDecision = "changed after sealing";
    assert.throws(() => parseObsidianProofLedgerEvent(tamperedProof), /payloadSha256/);
});

test("schema-v2 lifecycle supersedes and revokes without erasing audit history", () => {
    const rootDir = makeWorkspace();
    const first = buildProofEvent();
    const firstDraft = writeDraft(rootDir, [first], "first.jsonl");
    runObsidianProofLedgerAppend({ cwd: rootDir, eventsPath: firstDraft, write: true });

    const second = buildProofEvent({
        proofId: "kanji-n3-obsidian-append-fixture-02",
        lifecycle: {
            action: "supersede",
            previousProofId: first.proofId,
            reason: "Fixture card was rereviewed against a replacement generated snapshot.",
        },
    });
    const secondDraft = writeDraft(rootDir, [second], "second.jsonl");
    runObsidianProofLedgerAppend({ cwd: rootDir, eventsPath: secondDraft, write: true });

    let ledger = loadObsidianProofLedger({ cwd: rootDir });
    assert.equal(ledger.records.length, 2);
    assert.equal(ledger.events.length, 2);
    assert.deepEqual(ledger.activeEvents.map((event) => event.proofId), [second.proofId]);

    const revocation = buildRevocationEvent(second);
    const revocationDraft = writeDraft(rootDir, [revocation], "revocation.jsonl");
    runObsidianProofLedgerAppend({ cwd: rootDir, eventsPath: revocationDraft, write: true });

    ledger = loadObsidianProofLedger({ cwd: rootDir });
    assert.equal(ledger.records.length, 3);
    assert.equal(ledger.events.length, 2);
    assert.equal(ledger.revocationEvents.length, 1);
    assert.equal(ledger.activeEvents.length, 0);
});

test("schema-v2 lifecycle requires an explicit reason and monotonic record dates", () => {
    const missingReason = buildProofEvent({
        proofId: "kanji-n3-obsidian-append-fixture-02",
        lifecycle: {
            action: "supersede",
            previousProofId: "kanji-n3-obsidian-append-fixture-01",
        },
    });
    assert.throws(() => parseObsidianProofLedgerEvent(missingReason), /lifecycle\.reason|Invalid input/);

    const rootDir = makeWorkspace();
    const first = buildProofEvent({
        ledger: {
            ...buildProofEvent().ledger,
            recordedAt: "2026-05-30",
        },
    });
    runObsidianProofLedgerAppend({
        cwd: rootDir,
        eventsPath: writeDraft(rootDir, [first], "first-later.jsonl"),
        write: true,
    });

    const regressingSuccessor = buildProofEvent({
        proofId: "kanji-n3-obsidian-append-fixture-02",
        lifecycle: {
            action: "supersede",
            previousProofId: first.proofId,
            reason: "Fixture successor must not predate the proof it replaces.",
        },
    });
    assert.throws(() => buildObsidianProofLedgerAppendReport({
        cwd: rootDir,
        eventsPath: writeDraft(rootDir, [regressingSuccessor], "regressing-successor.jsonl"),
    }), /cannot predate previous proof/);
});
