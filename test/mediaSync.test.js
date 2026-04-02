const test = require("node:test");
const assert = require("node:assert/strict");

const {
    parseLevelArgument,
    selectKanjiForSync,
    summarizeSyncResults,
    syncMediaForKanjiList,
} = require("../src/services/mediaSync");

test("parseLevelArgument accepts N-prefix and numeric values", () => {
    assert.equal(parseLevelArgument("N5"), 5);
    assert.equal(parseLevelArgument("1"), 1);
    assert.equal(parseLevelArgument("n9"), null);
});

test("selectKanjiForSync supports level and explicit kanji selection", () => {
    const jlptOnlyJson = {
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        学: { jlpt: 4 },
    };

    assert.deepEqual(selectKanjiForSync({ jlptOnlyJson, level: 5, limit: 1 }), ["日"]);
    assert.deepEqual(selectKanjiForSync({ jlptOnlyJson, kanji: ["学", "日", "学"] }), ["学", "日"]);
});

test("summarizeSyncResults reports media hits and source counts", () => {
    const summary = summarizeSyncResults([
        {
            kanji: "日",
            strokeOrder: {
                manifest: {
                    assets: {
                        strokeOrderImage: null,
                        strokeOrderAnimation: { source: "remote-stroke-order-animation" },
                    },
                },
            },
            audio: {
                manifest: {
                    assets: {
                        audio: [{ source: "remote-audio" }],
                    },
                },
            },
        },
        {
            kanji: "本",
            strokeOrder: {
                manifest: {
                    assets: {
                        strokeOrderImage: { source: "local-filesystem" },
                        strokeOrderAnimation: null,
                    },
                },
            },
            audio: {
                error: "audio failed",
            },
        },
    ]);

    assert.equal(summary.totalKanji, 2);
    assert.equal(summary.strokeOrder.imageHits, 1);
    assert.equal(summary.strokeOrder.animationHits, 1);
    assert.equal(summary.audio.hits, 1);
    assert.equal(summary.strokeOrder.sourceCounts["remote-stroke-order-animation"], 1);
    assert.equal(summary.strokeOrder.sourceCounts["local-filesystem"], 1);
    assert.equal(summary.audio.sourceCounts["remote-audio"], 1);
    assert.equal(summary.errors.length, 1);
});

test("syncMediaForKanjiList processes kanji with bounded concurrency", async () => {
    const calls = [];
    let activeStrokeOrAudioTasks = 0;
    let maxActiveStrokeOrAudioTasks = 0;
    const strokeOrderService = {
        async syncKanji(kanji) {
            activeStrokeOrAudioTasks += 1;
            maxActiveStrokeOrAudioTasks = Math.max(maxActiveStrokeOrAudioTasks, activeStrokeOrAudioTasks);
            calls.push(`stroke:${kanji}`);
            await new Promise((resolve) => setTimeout(resolve, 15));
            activeStrokeOrAudioTasks -= 1;
            return {
                manifest: {
                    assets: {
                        strokeOrderImage: { source: "local-filesystem" },
                        strokeOrderAnimation: null,
                    },
                },
            };
        },
    };
    const audioService = {
        async syncKanji(kanji, metadata) {
            activeStrokeOrAudioTasks += 1;
            maxActiveStrokeOrAudioTasks = Math.max(maxActiveStrokeOrAudioTasks, activeStrokeOrAudioTasks);
            calls.push(`audio:${kanji}:${metadata.text}`);
            await new Promise((resolve) => setTimeout(resolve, 15));
            activeStrokeOrAudioTasks -= 1;
            return {
                manifest: {
                    assets: {
                        audio: [{ source: "local-filesystem" }],
                    },
                },
            };
        },
    };

    const result = await syncMediaForKanjiList({
        kanjiList: ["日", "本"],
        strokeOrderService,
        audioService,
        concurrency: 2,
    });

    assert.equal(result.results.length, 2);
    assert.equal(result.summary.totalKanji, 2);
    assert.equal(result.summary.audio.hits, 2);
    assert.equal(calls.includes("stroke:日"), true);
    assert.equal(calls.includes("audio:本:本"), true);
    assert.equal(maxActiveStrokeOrAudioTasks, 4);
});

test("syncMediaForKanjiList preserves one result when stroke-order or audio fails", async () => {
    const result = await syncMediaForKanjiList({
        kanjiList: ["日"],
        strokeOrderService: {
            async syncKanji() {
                throw new Error("stroke failed");
            },
        },
        audioService: {
            async syncKanji() {
                return {
                    manifest: {
                        assets: {
                            audio: [{ source: "local-filesystem" }],
                        },
                    },
                };
            },
        },
        concurrency: 1,
    });

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].strokeOrder.error, "stroke failed");
    assert.equal(result.results[0].audio.manifest.assets.audio.length, 1);
    assert.equal(result.summary.errors.length, 1);
});


test("syncMediaForKanjiList skips audio work cleanly when no audio service is configured", async () => {
    const calls = [];
    const result = await syncMediaForKanjiList({
        kanjiList: ["日"],
        strokeOrderService: {
            async syncKanji(kanji) {
                calls.push(
                    "stroke:" + kanji
                );
                return {
                    manifest: {
                        assets: {
                            strokeOrderImage: { source: "local-filesystem" },
                            strokeOrderAnimation: { source: "remote-stroke-order-animation" },
                        },
                    },
                };
            },
        },
        audioService: null,
        concurrency: 1,
    });

    assert.deepEqual(calls, ["stroke:日"]);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].audio.skipped, true);
    assert.deepEqual(result.results[0].audio.manifest.assets.audio, []);
    assert.equal(result.summary.audio.hits, 0);
    assert.equal(result.summary.errors.length, 0);
});
