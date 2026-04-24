const test = require("node:test");
const assert = require("node:assert/strict");

const { buildNodeTestArgs } = require("../scripts/runNodeTests");

test("runNodeTests forwards node test passthrough arguments before explicit files", () => {
    const args = buildNodeTestArgs("22.0.0", ["--test-name-pattern=furigana"]);
    const patternIndex = args.indexOf("--test-name-pattern=furigana");
    const firstFileIndex = args.findIndex((arg) => arg.endsWith(".test.js"));

    assert.ok(patternIndex > -1);
    assert.ok(firstFileIndex > patternIndex);
});
