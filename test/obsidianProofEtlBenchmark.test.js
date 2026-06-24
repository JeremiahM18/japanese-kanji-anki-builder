const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_LEDGER_AUTHORITY,
} = require("../src/datasets/obsidianProofLedger");
const { resolvePythonCommand } = require("../src/services/toolchainService");
const {
    DEFAULT_OBSIDIAN_PROOF_ETL_BUDGET,
    buildObsidianProofEtlBenchmarkKeysOnly,
    buildObsidianProofEtlBenchmarkReport,
    buildObsidianProofEtlBenchmarkSummary,
    evaluateBudget,
    formatBudgetResult,
    formatObsidianProofEtlBenchmarkReport,
    normalizeRepeat,
    parseArgs,
    resolveBenchmarkOutputRoot,
    resolveBudget,
} = require("../scripts/benchmarkObsidianProofEtl");

const python = resolvePythonCommand();

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

test("Obsidian proof ETL benchmark parses local guardrail options", () => {
    const options = parseArgs([
        "--repeat=3",
        "--ledger-dir=templates/custom-ledger",
        "--out-dir-base=out/custom-obsidian-bench",
        "--python=python3",
        "--budget=default",
        "--budget-validation-ms=123",
        "--budget-sqlite-mirror-ms=456",
        "--json",
        "--summary",
        "--keys-only",
    ]);

    assert.deepEqual(options, {
        json: true,
        summary: true,
        keysOnly: true,
        repeat: 3,
        ledgerDir: "templates/custom-ledger",
        outputDirBase: "out/custom-obsidian-bench",
        pythonCommand: "python3",
        budget: "default",
        budgetTotalMs: null,
        budgetValidationMs: 123,
        budgetCompatibilityViewMs: null,
        budgetSqliteMirrorMs: 456,
        unknownArgs: [],
    });
});

test("Obsidian proof ETL benchmark compact summary keeps stage accounting", () => {
    const report = {
        passed: true,
        configuration: { repeat: 1 },
        readOnlyCanonicalInputs: true,
        generatedArtifactsOnly: true,
        memory: { unit: "bytes" },
        timings: {
            total: { averageMs: 10 },
            validation: { label: "ledger validation", repeat: 1, averageMs: 1, minMs: 1, maxMs: 1, memory: { samples: 1 }, lastResult: { large: true } },
            compatibilityView: { label: "compatibility", repeat: 1, averageMs: 2, minMs: 2, maxMs: 2, memory: { samples: 1 }, lastResult: { large: true } },
            sqliteMirror: { label: "sqlite", repeat: 1, averageMs: 3, minMs: 3, maxMs: 3, memory: { samples: 1 }, lastResult: { large: true } },
        },
        stages: {
            validation: { passed: true, proofEvents: 2, files: ["a", "b"], failures: [] },
            compatibilityView: { passed: true, ledgerProofEvents: 2, reviewSets: [{ level: 5 }], failures: [] },
            sqliteMirror: { passed: true, proofEvents: 2, evidenceChecks: 4, failures: [] },
        },
        budget: { passed: true, failures: [] },
        failures: [],
    };
    const summary = buildObsidianProofEtlBenchmarkSummary(report);
    const keys = buildObsidianProofEtlBenchmarkKeysOnly(report);

    assert.equal(summary.stageCounts.validation.files, 2);
    assert.equal(summary.stageCounts.compatibilityView.reviewSets, 1);
    assert.equal(Object.hasOwn(summary.timings.validation, "lastResult"), false);
    assert.deepEqual(keys.children.stages.children.compatibilityView.children.reviewSets.type, "array");
});

test("Obsidian proof ETL benchmark validates repeat and budgets", () => {
    assert.equal(normalizeRepeat(1), 1);
    assert.equal(normalizeRepeat("20"), 20);
    assert.throws(() => normalizeRepeat(0), /Invalid --repeat/);
    assert.throws(() => normalizeRepeat(21), /Invalid --repeat/);

    const budget = resolveBudget({
        budget: "default",
        budgetTotalMs: null,
        budgetValidationMs: 77,
        budgetCompatibilityViewMs: null,
        budgetSqliteMirrorMs: null,
    });
    assert.deepEqual(budget, {
        ...DEFAULT_OBSIDIAN_PROOF_ETL_BUDGET,
        validationMs: 77,
    });

    const budgetResult = evaluateBudget({
        timings: {
            total: { averageMs: 10 },
            validation: { averageMs: 100 },
            compatibilityView: { averageMs: 20 },
            sqliteMirror: { averageMs: 30 },
        },
    }, budget);
    assert.equal(budgetResult.passed, false);
    assert.deepEqual(budgetResult.failures.map((failure) => failure.key), ["validationMs"]);
    assert.match(formatBudgetResult(budgetResult), /ledger validation/);
});

test("Obsidian proof ETL benchmark refuses non-generated output roots", () => {
    assert.throws(() => buildObsidianProofEtlBenchmarkReport({
        outputDirBase: "templates/not-generated",
    }), /outside governed generated-output roots/);
});

test("Obsidian proof ETL benchmark runs the governed local pipeline", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "jkb-obsidian-etl-bench-"));
    writeJson(path.join(rootDir, "templates", "platinum_n3_review_set.json"), [{
        kanji: "常",
        status: "platinum",
        readingIncludes: ["じょう"],
        rereviewProvenance: { type: "legacy inline proof should be replaced" },
    }]);
    writeLedger(rootDir, [buildProofEvent()]);

    const report = buildObsidianProofEtlBenchmarkReport({
        cwd: rootDir,
        repeat: 1,
        ledgerDir: "templates/obsidian_proof_ledger",
        outputDirBase: "out/obsidian-proof/benchmark",
    });

    assert.equal(report.passed, true);
    assert.equal(report.readOnlyCanonicalInputs, true);
    assert.equal(report.generatedArtifactsOnly, true);
    assert.equal(report.stages.validation.proofEvents, 1);
    assert.equal(report.stages.compatibilityView.reviewSets[0].ledgerProofsApplied, 1);
    assert.equal(report.stages.sqliteMirror.proofEvents, 1);
    assert.equal(report.configuration.outputDirBase, "out/obsidian-proof/benchmark");
    assert.equal(resolveBenchmarkOutputRoot({ cwd: rootDir, outputDirBase: "out/bench" }), path.join(rootDir, "out", "bench"));

    const text = formatObsidianProofEtlBenchmarkReport(report);
    assert.match(text, /Canonical inputs are read-only/);
    assert.match(text, /not Obsidian certification/);
    assert.match(text, /Stage summaries/);
});
