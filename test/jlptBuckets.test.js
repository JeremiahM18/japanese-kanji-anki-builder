const test = require("node:test");
const assert = require("node:assert/strict");

const { buildJlptBuckets } = require("../src/datasets/jlptBuckets");

test("buildJlptBuckets groups valid JLPT entries and sorts each level deterministically", () => {
    const buckets = buildJlptBuckets({
        本: { jlpt: 5 },
        校: { jlpt: 4 },
        日: { jlpt: 5 },
        ignored: { jlpt: "5" },
    });

    assert.deepEqual([...buckets.keys()].sort((a, b) => a - b), [4, 5]);
    assert.deepEqual(buckets.get(5), ["日", "本"]);
    assert.deepEqual(buckets.get(4), ["校"]);
});
