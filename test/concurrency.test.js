const test = require("node:test");
const assert = require("node:assert/strict");

const { mapWithConcurrency } = require("../src/utils/concurrency");

test("mapWithConcurrency preserves input order while limiting active work", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return value * 10;
    });

    assert.deepEqual(results, [10, 20, 30, 40]);
    assert.equal(maxActive, 2);
});

test("mapWithConcurrency normalizes invalid concurrency to a single worker", async () => {
    const order = [];

    const results = await mapWithConcurrency(["a", "b", "c"], 0, async (value, index) => {
        order.push(index);
        return value.toUpperCase();
    });

    assert.deepEqual(results, ["A", "B", "C"]);
    assert.deepEqual(order, [0, 1, 2]);
});
