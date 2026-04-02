const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reviewGoldenLevel");

test("reviewGoldenLevel parseArgs accepts N2 and json flags", () => {
    const args = parseArgs(["--level=2", "--json"]);

    assert.equal(args.level, 2);
    assert.equal(args.json, true);
});
