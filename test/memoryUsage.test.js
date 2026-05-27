const test = require("node:test");
const assert = require("node:assert/strict");

const {
    MEMORY_FIELDS,
    buildMemorySample,
    diffMemoryUsage,
    formatMemoryDelta,
    formatMemorySnapshot,
    summarizeMemorySamples,
} = require("../src/utils/memoryUsage");

test("memory usage helpers compute stable byte deltas and summaries", () => {
    const before = {
        rss: 100,
        heapTotal: 80,
        heapUsed: 50,
        external: 10,
        arrayBuffers: 5,
    };
    const after = {
        rss: 130,
        heapTotal: 90,
        heapUsed: 60,
        external: 13,
        arrayBuffers: 8,
    };

    assert.deepEqual(diffMemoryUsage(after, before), {
        rss: 30,
        heapTotal: 10,
        heapUsed: 10,
        external: 3,
        arrayBuffers: 3,
    });

    const sample = buildMemorySample(before, after);
    const summary = summarizeMemorySamples([sample]);

    assert.equal(summary.unit, "bytes");
    assert.equal(summary.samples, 1);
    assert.deepEqual(summary.before, before);
    assert.deepEqual(summary.after, after);
    assert.deepEqual(summary.delta, sample.delta);
    assert.deepEqual(Object.keys(summary.max).sort(), [...MEMORY_FIELDS].sort());
    assert.equal(formatMemorySnapshot(after), "rss 0.00 MiB; heapUsed 0.00 MiB; heapTotal 0.00 MiB");
    assert.equal(formatMemoryDelta(sample.delta), "rss +0.00 MiB; heapUsed +0.00 MiB; heapTotal +0.00 MiB");
});
