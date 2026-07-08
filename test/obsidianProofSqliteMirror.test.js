const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const {
    buildObsidianProofSqliteMirror,
    buildObsidianProofSqliteMirrorReport,
    queryObsidianProofSqliteMirror,
} = require("../src/services/obsidianProofSqliteMirrorService");
const { resolvePythonCommand } = require("../src/services/toolchainService");

const python = resolvePythonCommand();

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

function inspectSqlite(dbPath) {
    const inspectScript = [
        "import json, sqlite3, sys",
        "conn = sqlite3.connect(sys.argv[1])",
        "summary = {",
        "  'proofEvents': conn.execute('select count(*) from proof_events').fetchone()[0],",
        "  'evidenceChecks': conn.execute('select count(*) from evidence_checks').fetchone()[0],",
        "  'cardReviewed': conn.execute('select card_reviewed from proof_events').fetchone()[0],",
        "  'obsidianStandardVersion': conn.execute('select obsidian_standard_version from proof_events').fetchone()[0],",
        "  'metadataSource': conn.execute(\"select value from metadata where key='sourceOfTruth'\").fetchone()[0],",
        "}",
        "conn.close()",
        "print(json.dumps(summary, ensure_ascii=False, sort_keys=True))",
    ].join("\n");
    const result = spawnSync(python.command, [
        ...python.argsPrefix,
        "-c",
        inspectScript,
        dbPath,
    ], {
        encoding: "utf8",
        env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
        },
        shell: false,
        windowsHide: true,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
}

test("buildObsidianProofSqliteMirror writes a queryable local SQLite mirror", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-sqlite-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofSqliteMirror({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/sqlite",
    });

    const dbPath = path.join(rootDir, report.outputDbPath);
    assert.equal(report.passed, true);
    assert.equal(report.proofEvents, 1);
    assert.equal(fs.existsSync(dbPath), true);
    assert.match(report.inputHashes.ledgerFiles[0].sha256, /^[a-f0-9]{64}$/);
    assert.match(report.generatedArtifacts.payload.sha256, /^[a-f0-9]{64}$/);
    assert.match(report.generatedArtifacts.sqlite.sha256, /^[a-f0-9]{64}$/);

    const inspected = inspectSqlite(dbPath);
    assert.equal(inspected.proofEvents, 1);
    assert.equal(inspected.evidenceChecks, 8);
    assert.equal(inspected.cardReviewed, "常|じょう");
    assert.equal(inspected.obsidianStandardVersion, "legacy-kanji-obsidian-standard");
    assert.equal(inspected.metadataSource, "templates/obsidian_proof_ledger/*.jsonl");
});

test("buildObsidianProofSqliteMirror allows versioned proof history for the same card target", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-sqlite-versioned-"));
    writeLedger(rootDir, [
        buildProofEvent(),
        buildProofEvent({
            proofId: "kanji-n3-obsidian-fixture-02",
            proof: {
                ...buildProofEvent().proof,
                obsidianStandardVersion: "kanji-obsidian-v2",
            },
        }),
    ]);

    const report = queryObsidianProofSqliteMirror({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/sqlite",
        deckKind: "kanji",
        level: 3,
        target: "常|じょう",
        limit: 5,
    });

    assert.equal(report.passed, true);
    assert.equal(report.mirror.proofEvents, 2);
    assert.equal(report.query.matchedProofEvents, 2);
    assert.deepEqual(
        report.query.rows.map((row) => row.obsidianStandardVersion).sort(),
        ["kanji-obsidian-v2", "legacy-kanji-obsidian-standard"]
    );
});

test("buildObsidianProofSqliteMirrorReport rejects unsafe database filenames", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-sqlite-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofSqliteMirrorReport({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/sqlite",
        dbFile: "..\\unsafe.sqlite",
    });

    assert.equal(report.passed, false);
    assert.match(report.failures[0], /plain filename/);
});

test("queryObsidianProofSqliteMirror rebuilds then queries the read-only local mirror", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-sqlite-query-"));
    writeLedger(rootDir, [
        buildProofEvent(),
        buildProofEvent({
            proofId: "kanji-n3-obsidian-fixture-02",
            target: {
                deckKind: "kanji",
                level: 3,
                written: "幸",
                reading: "こう",
                cardReviewed: "幸|こう",
            },
            batch: {
                id: "n3-kanji-obsidian-fixture-batch",
                sequence: 100,
            },
            proof: {
                ...buildProofEvent().proof,
                cardReviewed: "幸|こう",
                reviewedAt: "2026-05-27",
                evidenceChecked: [
                    "live generated kanji card surface checked for 幸|こう",
                    "governed japanese-source evidence checked for 幸|こう",
                    "primary reading, on/kun compatibility, learner meaning, and broader meanings checked",
                    "example sentence quality review checked for natural Japanese, learner usefulness, level appropriateness, support-only usage, reading, and translation",
                    "notes and support vocabulary checked for learner usefulness",
                    "exact primary-reading audio identity checked for 幸|こう",
                    "stroke-order media identity checked for 幸",
                    "source evidence, JLPT placement evidence, internal checks, NLP assistive signals, and review proof kept in separate evidence lanes",
                ],
            },
        }),
    ]);

    const report = queryObsidianProofSqliteMirror({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/sqlite",
        deckKind: "kanji",
        level: 3,
        target: "常|じょう",
        limit: 5,
    });

    assert.equal(report.passed, true);
    assert.equal(report.mirror.proofEvents, 2);
    assert.equal(report.query.matchedProofEvents, 1);
    assert.equal(report.query.rows.length, 1);
    assert.equal(report.query.rows[0].proofId, "kanji-n3-obsidian-fixture-01");
    assert.equal(report.query.rows[0].cardReviewed, "常|じょう");
    assert.deepEqual(report.filters, {
        deckKind: "kanji",
        level: 3,
        batchId: null,
        target: "常|じょう",
        limit: 5,
    });
    assert.equal(report.query.batchCounts[0].proofEvents, 2);
});

test("queryObsidianProofSqliteMirror reports empty result sets without failing", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-sqlite-query-"));
    writeLedger(rootDir, [buildProofEvent()]);

    const report = queryObsidianProofSqliteMirror({
        cwd: rootDir,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDir: "out/obsidian-proof/sqlite",
        deckKind: "kanji",
        level: 3,
        target: "幸|こう",
    });

    assert.equal(report.passed, true);
    assert.equal(report.query.matchedProofEvents, 0);
    assert.deepEqual(report.query.rows, []);
    assert.equal(report.query.batchCounts[0].proofEvents, 1);
});
