const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    COLD_APKG_BUILD_BUDGET,
    DEFAULT_BUILD_BUDGET,
    buildBuildBenchmarkKeysOnly,
    buildBuildBenchmarkSummary,
    cleanOutDir,
    evaluateBudget,
    evaluateRepeatedBudget,
    formatRunMemory,
    parseArgs,
    resolveBuildApkgCacheDir,
    resolveBenchmarkOutDirBase,
    resolveBudget,
    resolveRepeatCount,
} = require("../scripts/benchmarkBuild");

test("benchmarkBuild parseArgs supports warmup json and build options", () => {
    const options = parseArgs([
        "--levels=5,3",
        "--limit=25",
        "--concurrency=6",
        "--out-dir-base=out/custom-bench",
        "--json",
        "--no-warmup",
        "--cold-apkg-cache",
        "--repeat=3",
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
        coldApkgCache: true,
        json: true,
        summary: false,
        keysOnly: false,
        repeat: 3,
        budget: "default",
        budgetTotalMs: 4200,
        budgetExportMs: 2100,
        budgetMediaSyncMs: 900,
        budgetPackagingMs: 500,
        unknownArgs: [],
    });
});

test("benchmarkBuild parseArgs supports compact output modes", () => {
    const options = parseArgs(["--summary", "--keys-only"]);

    assert.equal(options.summary, true);
    assert.equal(options.keysOnly, true);
});

test("build benchmark compact summary keeps timings and drops bulky coverage payloads", () => {
    const result = {
        configuration: { levels: [5], repeat: 1 },
        garbageCollection: { beforeMeasuredRuns: true },
        warmup: null,
        measured: {
            outDir: "out/bench-build/measured",
            durationMs: 123,
            doctorReady: true,
            exports: [{ level: 5, rows: 80 }],
            package: {
                mediaAssetCount: 2,
                exportCount: 1,
                ankiPackageSkipped: false,
                cacheHit: true,
                timingsMs: { copyMedia: 1 },
            },
            timingsMs: { export: 10 },
            memory: { samples: 1 },
            coverage: { giant: ["payload"] },
        },
        measuredRuns: [],
        budget: { passed: true, failures: [] },
    };
    const summary = buildBuildBenchmarkSummary(result);
    const keys = buildBuildBenchmarkKeysOnly(result);

    assert.equal(summary.measured.durationMs, 123);
    assert.equal(summary.measured.package.cacheHit, true);
    assert.equal(Object.hasOwn(summary.measured, "coverage"), false);
    assert.deepEqual(keys.children.measured.children.coverage.children.giant.type, "array");
});

test("resolveRepeatCount floors positive values and rejects zero", () => {
    assert.equal(resolveRepeatCount(3.8), 3);
    assert.equal(resolveRepeatCount(null), 1);
    assert.throws(() => resolveRepeatCount(0), /repeat must be at least 1/);
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

test("build benchmark APKG cache is shared outside warmup and measured roots", () => {
    const benchmarkRoot = path.join(process.cwd(), "out", "bench-build");

    assert.equal(
        resolveBuildApkgCacheDir(path.join(benchmarkRoot, "warmup")),
        path.join(benchmarkRoot, ".apkg-cache"),
    );
    assert.equal(
        resolveBuildApkgCacheDir(path.join(benchmarkRoot, "measured")),
        path.join(benchmarkRoot, ".apkg-cache"),
    );
});

test("cleanOutDir refuses non-generated workspace paths", () => {
    assert.throws(() => cleanOutDir(path.join(process.cwd(), "README.md")), /outside governed generated-output roots/);
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

test("resolveBudget returns the cold APKG build budget", () => {
    const budget = resolveBudget({
        budget: "cold-apkg",
        budgetTotalMs: null,
        budgetExportMs: null,
        budgetMediaSyncMs: null,
        budgetPackagingMs: null,
    });

    assert.deepEqual(budget, COLD_APKG_BUILD_BUDGET);
    assert.equal(budget.totalMs, null);
    assert.equal(budget.exportMs, null);
    assert.equal(budget.mediaSyncMs, null);
    assert.equal(budget.packagingMs, 2500);
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

test("evaluateRepeatedBudget fails when any measured run exceeds a threshold", () => {
    const result = evaluateRepeatedBudget([
        {
            durationMs: 3400,
            timingsMs: {
                export: 1700,
                mediaSync: 900,
                packaging: 350,
            },
        },
        {
            durationMs: 5300,
            timingsMs: {
                export: 1700,
                mediaSync: 900,
                packaging: 350,
            },
        },
    ], DEFAULT_BUILD_BUDGET);

    assert.equal(result.passed, false);
    assert.equal(result.runs.length, 2);
    assert.deepEqual(result.failures.map((entry) => [entry.runIndex, entry.key]), [
        [2, "totalMs"],
    ]);
});

test("formatRunMemory reports measured build and package memory deltas", () => {
    const text = formatRunMemory({
        memory: {
            after: {
                rss: 1048576,
                heapUsed: 524288,
                heapTotal: 2097152,
            },
            delta: {
                rss: 1048576,
                heapUsed: 524288,
                heapTotal: 1048576,
            },
        },
        package: {
            memory: {
                delta: {
                    rss: 262144,
                    heapUsed: 131072,
                    heapTotal: 262144,
                },
            },
        },
    });

    assert.match(text, /run after rss 1\.00 MiB; heapUsed 0\.50 MiB; heapTotal 2\.00 MiB/);
    assert.match(text, /run delta rss \+1\.00 MiB; heapUsed \+0\.50 MiB; heapTotal \+1\.00 MiB/);
    assert.match(text, /package delta rss \+0\.25 MiB; heapUsed \+0\.13 MiB; heapTotal \+0\.25 MiB/);
});
