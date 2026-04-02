const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    DEFAULT_BUILD_BUDGET,
    evaluateBudget,
    parseArgs,
    resolveBenchmarkOutDirBase,
    resolveBudget,
} = require("../scripts/benchmarkBuild");

test("benchmarkBuild parseArgs supports warmup json and build options", () => {
    const options = parseArgs([
        "--levels=5,3",
        "--limit=25",
        "--concurrency=6",
        "--out-dir-base=out/custom-bench",
        "--json",
        "--no-warmup",
        "--budget=default",
        "--budget-total-ms=4200",
        "--budget-export-ms=2100",
        "--budget-media-sync-ms=900",
        "--budget-packaging-ms=500",
    ]);

    assert.deepEqual(options, {
        levels: [5, 3],
        limit: 25,
        concurrency: 6,
        outDirBase: "out/custom-bench",
        warmup: false,
        json: true,
        budget: "default",
        budgetTotalMs: 4200,
        budgetExportMs: 2100,
        budgetMediaSyncMs: 900,
        budgetPackagingMs: 500,
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

test("resolveBudget returns the default build budget", () => {
    const budget = resolveBudget({
        budget: "default",
        budgetTotalMs: null,
        budgetExportMs: null,
        budgetMediaSyncMs: null,
        budgetPackagingMs: null,
    });

    assert.deepEqual(budget, DEFAULT_BUILD_BUDGET);
});

test("resolveBudget allows custom overrides on top of the default budget", () => {
    const budget = resolveBudget({
        budget: "default",
        budgetTotalMs: 4100,
        budgetExportMs: null,
        budgetMediaSyncMs: 1200,
        budgetPackagingMs: null,
    });

    assert.deepEqual(budget, {
        totalMs: 4100,
        exportMs: DEFAULT_BUILD_BUDGET.exportMs,
        mediaSyncMs: 1200,
        packagingMs: DEFAULT_BUILD_BUDGET.packagingMs,
    });
});

test("evaluateBudget reports pass and fail cases clearly", () => {
    const passing = evaluateBudget({
        durationMs: 3400,
        timingsMs: {
            export: 1700,
            mediaSync: 900,
            packaging: 350,
        },
    }, DEFAULT_BUILD_BUDGET);

    assert.equal(passing.passed, true);
    assert.deepEqual(passing.failures, []);

    const failing = evaluateBudget({
        durationMs: 5300,
        timingsMs: {
            export: 2600,
            mediaSync: 1800,
            packaging: 610,
        },
    }, DEFAULT_BUILD_BUDGET);

    assert.equal(failing.passed, false);
    assert.deepEqual(failing.failures.map((entry) => entry.key), [
        "totalMs",
        "exportMs",
        "mediaSyncMs",
        "packagingMs",
    ]);
});
