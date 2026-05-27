const test = require("node:test");
const assert = require("node:assert/strict");

const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
} = require("../src/services/obsidianProofProviderService");
const {
    parseArgs,
} = require("../scripts/reportObsidianKanjiCertificationStatus");

test("kanji certification status script parses levels, json, proof provider, and unknown args", () => {
    const options = parseArgs([
        "--levels=5,4",
        "--proof-provider=inline",
        "--json",
        "--unexpected",
    ]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("kanji certification status script defaults to N5 and N4 with ledger fallback provider", () => {
    const options = parseArgs([]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE);
    assert.equal(options.json, false);
});

test("kanji certification status script accepts a scoped default provider", () => {
    const options = parseArgs([], {
        defaultProofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.INLINE,
    });

    assert.equal(options.proofProvider, OBSIDIAN_PROOF_PROVIDER_MODES.INLINE);
});
