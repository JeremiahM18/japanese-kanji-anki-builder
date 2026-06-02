const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildObsidianProofLedgerAppendReport,
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

function writeDraft(rootDir, value, fileName = "events.jsonl") {
    const filePath = path.join(rootDir, "out", "obsidian-proof", "drafts", fileName);
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
