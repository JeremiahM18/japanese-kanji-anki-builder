const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reviewGoldenLevel");

test("reviewGoldenLevel parseArgs accepts N1 and json flags", () => {
    const args = parseArgs(["--level=1", "--json"]);

    assert.equal(args.level, 1);
    assert.equal(args.json, true);
});
