const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/reportCuratedStudyCoverage");

test("reportCuratedStudyCoverage parseArgs accepts level and limit", () => {
    const options = parseArgs(["--level=1", "--limit=8"]);

    assert.equal(options.level, 1);
    assert.equal(options.limit, 8);
    assert.deepEqual(options.unknownArgs, []);
});

test("reportCuratedStudyCoverage parseArgs records unsupported flags", () => {
    const options = parseArgs(["--level=1", "--oops"]);

    assert.deepEqual(options.unknownArgs, ["--oops"]);
});
