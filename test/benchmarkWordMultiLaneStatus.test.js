"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
    formatBenchmark,
    parseArgs,
    summarizeDurations,
} = require("../scripts/benchmarkWordMultiLaneStatus");

test("word multi-lane benchmark requires explicit scope and positive repeats", () => {
    assert.deepEqual(parseArgs(["--level=4", "--repeat=3", "--summary"]), {
        levels: [4],
        repeat: 3,
        summary: true,
        unknownArgs: [],
    });
    assert.throws(() => parseArgs([]), /requires --level/);
    assert.throws(() => parseArgs(["--level=4", "--repeat=0"]), /positive integer/);
});

test("word multi-lane benchmark summarizes repeated timing evidence without a budget claim", () => {
    const timing = summarizeDurations([
        { durationMs: 30 },
        { durationMs: 10 },
        { durationMs: 20 },
    ]);
    assert.deepEqual(timing, {
        minimumMs: 10,
        medianMs: 20,
        maximumMs: 30,
        meanMs: 20,
    });

    const formatted = formatBenchmark({
        levels: [4],
        repeat: 3,
        statusPassed: false,
        timing,
    });
    assert.match(formatted, /failing \(lane status preserved\)/);
    assert.match(formatted, /Timing budget: none/);
    assert.match(formatted, /Median: 20\.0 ms/);
    assert.match(formatted, /does not approve cards/);
});
