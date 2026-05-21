const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCommandPlan,
    commandText,
    formatWordNlpExpansionSupportPlan,
    parseArgs,
} = require("../scripts/runWordNlpExpansionSupport");

test("parseArgs supports all word NLP expansion support controls", () => {
    const options = parseArgs([
        "--levels=5,4,3",
        "--artifact-limit=12",
        "--candidate-limit=25",
        "--suggestions=4",
        "--min-suggestion-score=80",
        "--quality=review",
        "--only=contract-extensions",
        "--min-model-score=0.65",
        "--manifest=templates/nlp_model_manifest.json",
        "--model-id=fixture-model",
        "--workspace-root=.",
        "--cache-dir=cache/nlp-models/transformers-js",
        "--allow-remote-models",
        "--no-include-deferred",
        "--no-governance-gate",
        "--dry-run",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 4, 3]);
    assert.equal(options.artifactLimit, 12);
    assert.equal(options.candidateLimit, 25);
    assert.equal(options.suggestions, 4);
    assert.equal(options.minSuggestionScore, 80);
    assert.equal(options.quality, "review");
    assert.equal(options.only, "contract-extensions");
    assert.equal(options.minModelScore, 0.65);
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.modelId, "fixture-model");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.cacheDir, "cache/nlp-models/transformers-js");
    assert.equal(options.allowRemoteModels, true);
    assert.equal(options.includeDeferred, false);
    assert.equal(options.runGovernanceGate, false);
    assert.equal(options.dryRun, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("parseArgs rejects invalid word NLP expansion support options", () => {
    const options = parseArgs([
        "--levels=0,6,bad",
        "--artifact-limit=0",
        "--candidate-limit=0",
        "--suggestions=-1",
        "--only=nope",
        "--quality=nope",
        "--min-model-score=2",
    ]);

    assert.deepEqual(options.unknownArgs, [
        "--levels must contain integers from 1 to 5",
        "--artifact-limit must be a positive integer",
        "--candidate-limit must be a positive integer",
        "--suggestions must be a non-negative integer",
        "--only must be one of: all, contract-extensions",
        "--quality must be one of: weak, review, strong",
        "--min-model-score must be a number from 0 to 1",
    ]);
});

test("parseArgs rejects partially invalid word NLP expansion support levels", () => {
    const options = parseArgs(["--levels=5,bad"]);

    assert.deepEqual(options.levels, [5]);
    assert.deepEqual(options.unknownArgs, ["--levels must contain integers from 1 to 5"]);
});

test("buildCommandPlan wires NLP expansion support into every selected N level", () => {
    const options = parseArgs([
        "--levels=5,4,3,2,1",
        "--candidate-limit=15",
        "--suggestions=2",
        "--min-model-score=0.5",
    ]);
    const plan = buildCommandPlan(options);
    const commandTexts = plan.steps.map(commandText);

    assert.deepEqual(plan.levels, [5, 4, 3, 2, 1]);
    for (const level of [5, 4, 3, 2, 1]) {
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpTokenization.js --level=${level}`)), `missing N${level} tokenization`);
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpEmbeddings.js --level=${level}`)), `missing N${level} embeddings`);
        assert.ok(commandTexts.some((command) => command.includes(`rerankNlpExamples.js --level=${level}`)), `missing N${level} example reranking`);
        assert.ok(commandTexts.some((command) => command.includes(`auditNlpSenseFit.js --level=${level}`)), `missing N${level} sense-fit audit`);
        assert.ok(commandTexts.some((command) => command.includes(`discoverNlpReadingGapCandidates.js --level=${level}`)), `missing N${level} candidate discovery`);
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpReviewPackets.js --deck=word --level=${level}`)), `missing N${level} review packets`);
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpDraftProposals.js --deck=word --level=${level}`)), `missing N${level} drafts`);
    }

    assert.ok(commandTexts.some((command) => command.includes("validateNlpTokenization.js")));
    assert.ok(commandTexts.some((command) => command.includes("validateNlpEmbeddings.js")));
    assert.ok(commandTexts.some((command) => command.includes("validateNlpSuggestions.js")));
    assert.ok(commandTexts.some((command) => command.includes("runNlpGovernanceGate.js")));
    assert.equal(plan.authority.outputAuthority, "assistive_only");
    assert.equal(plan.authority.writesTrackedTemplates, false);
    assert.equal(plan.authority.certifiesCards, false);
});

test("formatWordNlpExpansionSupportPlan keeps the certification boundary visible", () => {
    const plan = buildCommandPlan(parseArgs(["--levels=4"]));
    const text = formatWordNlpExpansionSupportPlan(plan, { dryRun: true });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Levels: N4/);
    assert.match(text, /assistive-only; human promotion required/);
    assert.match(text, /N4 reading-gap candidate suggestions/);
    assert.match(text, /NLP governance gate/);
});
