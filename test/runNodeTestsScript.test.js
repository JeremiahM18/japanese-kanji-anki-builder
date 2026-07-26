const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
    TEST_SCOPES,
    buildNodeTestArgs,
    findScopedTestFiles,
    parseRunNodeTestsArgs,
} = require("../scripts/runNodeTests");

test("runNodeTests forwards node test passthrough arguments before explicit files", () => {
    const args = buildNodeTestArgs("22.0.0", ["--test-name-pattern=furigana"]);
    const patternIndex = args.indexOf("--test-name-pattern=furigana");
    const firstFileIndex = args.findIndex((arg) => arg.endsWith(".test.js"));

    assert.ok(patternIndex > -1);
    assert.ok(firstFileIndex > patternIndex);
});

test("runNodeTests strips source-evidence scope from node passthrough arguments", () => {
    const parsed = parseRunNodeTestsArgs([
        "--scope=source-evidence",
        "--test-name-pattern=source input",
    ]);

    assert.equal(parsed.scope, "source-evidence");
    assert.deepEqual(parsed.passthroughArgs, ["--test-name-pattern=source input"]);
});

test("runNodeTests can select the source-evidence test scope", () => {
    const args = buildNodeTestArgs("22.0.0", ["--scope=source-evidence"]);
    const explicitFiles = args.filter((arg) => arg.endsWith(".test.js"));

    assert.ok(explicitFiles.some((file) => file.endsWith(path.join("test", "jlptKanjiSourceEvidence.test.js"))));
    assert.ok(explicitFiles.some((file) => file.endsWith(path.join("test", "pinJlptKanjiSourceInputScript.test.js"))));
    assert.equal(explicitFiles.some((file) => file.endsWith(path.join("test", "wordExportService.test.js"))), false);
});

test("runNodeTests can select expanded focused test scopes", () => {
    const nlpArgs = buildNodeTestArgs("22.0.0", ["--scope=nlp"]);
    const wordArgs = buildNodeTestArgs("22.0.0", ["--scope=word-lanes"]);
    const ciArgs = buildNodeTestArgs("22.0.0", ["--scope=ci-release"]);

    assert.ok(nlpArgs.some((file) => file.endsWith(path.join("test", "nlpGovernanceGateService.test.js"))));
    assert.ok(nlpArgs.some((file) => file.endsWith(path.join("test", "runWordNlpExpansionSupportScript.test.js"))));
    assert.ok(wordArgs.some((file) => file.endsWith(path.join("test", "reviewSapphireWordLevel.test.js"))));
    assert.ok(wordArgs.some((file) => file.endsWith(path.join("test", "wordSilverReviewPipelineService.test.js"))));
    assert.ok(wordArgs.some((file) => file.endsWith(path.join("test", "sapphireVerificationLimitations.test.js"))));
    assert.ok(ciArgs.some((file) => file.endsWith(path.join("test", "releaseGateService.test.js"))));
});

test("Obsidian proof scope includes the word certification CLI and transaction recovery", () => {
    const args = buildNodeTestArgs("22.0.0", ["--scope=obsidian-proof"]);

    assert.ok(args.some((file) => file.endsWith(path.join("test", "reportObsidianWordCertificationStatusScript.test.js"))));
    assert.ok(args.some((file) => file.endsWith(path.join("test", "governedFileTransaction.test.js"))));
    assert.ok(args.some((file) => file.endsWith(path.join("test", "recoverGovernedFileTransactionScript.test.js"))));
});

test("docs governance scope includes ignored workspace side-effect auditing", () => {
    const args = buildNodeTestArgs("22.0.0", ["--scope=docs-governance"]);

    assert.ok(args.some((file) => file.endsWith(path.join("test", "workspaceSideEffectAuditService.test.js"))));
    assert.ok(args.some((file) => file.endsWith(path.join("test", "kanjiBuilderVaultValidationService.test.js"))));
});

test("runNodeTests focused scopes resolve to existing unique test files", () => {
    for (const scope of Object.keys(TEST_SCOPES)) {
        const files = findScopedTestFiles(path.resolve(__dirname), scope);
        assert.equal(files.length > 0, true, `${scope} should include at least one test`);
        assert.equal(new Set(files).size, files.length, `${scope} should not include duplicate tests`);
    }
});

test("every discovered test belongs to at least one focused scope", () => {
    const discovered = fs.readdirSync(__dirname)
        .filter((fileName) => fileName.endsWith(".test.js"))
        .sort();
    const scoped = new Set(Object.values(TEST_SCOPES).flat());

    assert.deepEqual(discovered.filter((fileName) => !scoped.has(fileName)), []);
});

test("runNodeTests rejects unknown test scopes", () => {
    assert.throws(() => buildNodeTestArgs("22.0.0", ["--scope=unknown"]), /Unknown test scope: unknown/);
});
