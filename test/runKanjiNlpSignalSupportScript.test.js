const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCommandPlan,
    commandText,
    formatKanjiNlpSignalSupportPlan,
    parseArgs,
} = require("../scripts/runKanjiNlpSignalSupport");

test("parseArgs supports kanji NLP signal support controls", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--artifact-limit=12",
        "--manifest=templates/nlp_model_manifest.json",
        "--workspace-root=.",
        "--no-governance-gate",
        "--dry-run",
        "--json",
        "--oops",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.artifactLimit, 12);
    assert.equal(options.manifestPath, "templates/nlp_model_manifest.json");
    assert.equal(options.workspaceRoot, ".");
    assert.equal(options.runGovernanceGate, false);
    assert.equal(options.dryRun, true);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--oops"]);
});

test("parseArgs rejects invalid kanji NLP signal support options", () => {
    const options = parseArgs([
        "--levels=0,6,bad",
        "--artifact-limit=0",
    ]);

    assert.deepEqual(options.unknownArgs, [
        "--levels must contain integers from 1 to 5",
        "--artifact-limit must be a positive integer",
    ]);
});

test("buildCommandPlan wires kanji-only NLP signal steps without word expansion lanes", () => {
    const plan = buildCommandPlan(parseArgs(["--levels=5,4"]));
    const commandTexts = plan.steps.map(commandText);

    assert.deepEqual(plan.levels, [5, 4]);
    assert.ok(commandTexts.some((command) => command.includes("prepareDeck.js --levels=5,4")));
    for (const level of [5, 4]) {
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpTokenization.js --deck=kanji --level=${level}`)), `missing N${level} kanji tokenization`);
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpReviewPackets.js --deck=kanji --level=${level}`)), `missing N${level} kanji review packets`);
        assert.ok(commandTexts.some((command) => command.includes(`generateNlpDraftProposals.js --deck=kanji --level=${level}`)), `missing N${level} kanji draft notes`);
    }
    assert.equal(commandTexts.some((command) => command.includes("generateNlpEmbeddings.js")), false);
    assert.equal(commandTexts.some((command) => command.includes("discoverNlpReadingGapCandidates.js")), false);
    assert.equal(commandTexts.some((command) => command.includes("rerankNlpExamples.js")), false);
    assert.equal(commandTexts.some((command) => command.includes("auditNlpSenseFit.js")), false);
    assert.equal(plan.authority.productBoundary, "kanji");
    assert.equal(plan.authority.certifiesCards, false);
});

test("formatKanjiNlpSignalSupportPlan keeps product and certification boundaries visible", () => {
    const plan = buildCommandPlan(parseArgs(["--level=5"]));
    const text = formatKanjiNlpSignalSupportPlan(plan, { dryRun: true });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Levels: N5/);
    assert.match(text, /review-amplification/);
    assert.match(text, /not a certification path/);
    assert.match(text, /Product boundary: kanji deck only/);
    assert.match(text, /no word expansion/);
    assert.match(text, /no word-card embeddings/);
    assert.match(text, /no card certification/);
    assert.match(text, /deck:kanji:obsidian:rereview-status/);
    assert.match(text, /N5 kanji-card tokenization artifact/);
});
