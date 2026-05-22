const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseArgs,
} = require("../scripts/reportObsidianKanjiCertificationStatus");

test("kanji certification status script parses levels, json, and unknown args", () => {
    const options = parseArgs(["--levels=5,4", "--json", "--unexpected"]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.json, true);
    assert.deepEqual(options.unknownArgs, ["--unexpected"]);
});

test("kanji certification status script defaults to N5 and N4", () => {
    const options = parseArgs([]);

    assert.deepEqual(options.levels, [5, 4]);
    assert.equal(options.json, false);
});
