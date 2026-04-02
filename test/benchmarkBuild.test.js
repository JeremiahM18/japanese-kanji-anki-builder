const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArgs, resolveBenchmarkOutDirBase } = require("../scripts/benchmarkBuild");

test("benchmarkBuild parseArgs supports warmup json and build options", () => {
    const options = parseArgs([
        "--levels=5,3",
        "--limit=25",
        "--concurrency=6",
        "--out-dir-base=out/custom-bench",
        "--json",
        "--no-warmup",
    ]);

    assert.deepEqual(options, {
        levels: [5, 3],
        limit: 25,
        concurrency: 6,
        outDirBase: "out/custom-bench",
        warmup: false,
        json: true,
        unknownArgs: [],
    });
});

test("benchmarkBuild parseArgs tracks unknown flags", () => {
    const options = parseArgs(["--levels=5", "--mystery"]);

    assert.deepEqual(options.unknownArgs, ["--mystery"]);
    assert.deepEqual(options.levels, [5]);
});

test("resolveBenchmarkOutDirBase defaults next to build output", () => {
    const resolved = resolveBenchmarkOutDirBase({
        buildOutDir: path.join("out", "build"),
    });

    assert.equal(resolved, path.join(process.cwd(), "out", "bench-build"));
});
