const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");
const {
    parseArgs,
} = require("../scripts/reportPlatinumKanjiRereviewStatus");

test("kanji rereview status script parses proof provider without hiding unknown args", () => {
    const options = parseArgs([
        "--levels=3",
        "--proof-provider=ledger",
        "--json",
        "--unexpected",
    ]);

    assert.deepEqual(options.levels, [3]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("kanji rereview status script uses scoped proof provider as base default", () => {
    const options = parseArgs([]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
});

test("kanji rereview status script accepts a scoped default provider from wrappers", () => {
    const options = parseArgs([], {
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
    });

    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
});
