const test = require("node:test");
const assert = require("node:assert/strict");

const {
    createFixtureKanjiApiClient,
    parseArgs,
    runExportOnce,
    summarizeRows,
} = require("../scripts/benchmarkExport");

test("benchmarkExport parseArgs defaults to offline fixture mode", () => {
    const options = parseArgs(["--level=3", "--limit=40", "--concurrency=6", "--no-warmup"]);

    assert.deepEqual(options, {
        level: 3,
        limit: 40,
        concurrency: 6,
        warmup: false,
        offline: true,
    });
});

test("benchmarkExport parseArgs supports live mode override", () => {
    const options = parseArgs(["--level=4", "--live"]);

    assert.equal(options.level, 4);
    assert.equal(options.offline, false);
    assert.equal(options.warmup, true);
});

test("summarizeRows counts successful and error rows", () => {
    const summary = summarizeRows([
        "Kanji\tNotes",
        "日\tworks",
        "月\tERROR: fetch failed",
    ].join("\n"));

    assert.deepEqual(summary, {
        rows: 2,
        errorRows: 1,
        successfulRows: 1,
    });
});

test("runExportOnce stays deterministic with the offline fixture client", async () => {
    const result = await runExportOnce({
        jlptOnlyJson: {
            日: { jlpt: 5 },
            月: { jlpt: 5 },
        },
        kradMap: new Map([
            ["日", ["日"]],
            ["月", ["月"]],
        ]),
        kanjiApiClient: createFixtureKanjiApiClient(),
        level: 5,
        limit: 2,
        concurrency: 2,
    });

    assert.equal(result.rows, 2);
    assert.equal(result.errorRows, 0);
    assert.equal(result.successfulRows, 2);
    assert.equal(result.metrics.networkFetches, 0);
    assert.equal(result.exportProfile.rows, 2);
    assert.equal(result.exportProfile.inferredRows, 2);
    assert.equal(result.exportProfile.timingsMs.getKanji >= 0, true);
    assert.equal(result.exportProfile.timingsMs.getWords >= 0, true);
});
