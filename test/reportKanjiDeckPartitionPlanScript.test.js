const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reportKanjiDeckPartitionPlan");

test("parseArgs configures the kanji deck partition plan report", () => {
    const options = parseArgs([
        "--json",
        "--levels=5,4",
        "--limit=7",
        "--include-disputed",
        "--candidate-scope=all-source-claims",
        "--no-source-inputs",
    ]);

    assert.equal(options.json, true);
    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.limit, 7);
    assert.equal(options.includeDisputed, true);
    assert.equal(options.candidateScope, "all-source-claims");
    assert.equal(options.sourceInputs, null);
    assert.deepEqual(options.unknownArgs, []);
});
