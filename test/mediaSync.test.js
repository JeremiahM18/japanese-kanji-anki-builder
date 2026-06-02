const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildExistingCompleteSyncResult,
    parseLevelArgument,
    selectKanjiForSync,
    summarizeSyncResults,
    syncMediaForKanjiList,
} = require("../src/services/mediaSync");
const { buildKanjiMediaId } = require("../src/services/mediaStore");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-sync-test-"));
}

function cleanupTempDir(dirPath) {
    fs.rmSync(dirPath, { recursive: true, force: true });
}

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

test("syncMediaForKanjiList skips acquisition when managed media is already complete", async () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        const mediaId = buildKanjiMediaId("日");
        const baseDir = path.join(mediaRootDir, "kanji", "65", mediaId);
        fs.mkdirSync(path.join(baseDir, "images"), { recursive: true });
        fs.mkdirSync(path.join(baseDir, "animations"), { recursive: true });
        fs.mkdirSync(path.join(baseDir, "audio"), { recursive: true });
        fs.writeFileSync(path.join(baseDir, "images", mediaId + "-stroke-order.png"), "image");
        fs.writeFileSync(path.join(baseDir, "animations", mediaId + "-stroke-order.gif"), "animation");
        fs.writeFileSync(path.join(baseDir, "audio", mediaId + "-kanji-reading-日-にち.wav"), "audio");
        fs.writeFileSync(path.join(baseDir, "manifest.json"), JSON.stringify({
            kanji: "日",
            version: 1,
            updatedAt: "2026-01-01T00:00:00.000Z",
            assets: {
                strokeOrderImage: {
                    kind: "image",
                    path: "images/" + mediaId + "-stroke-order.png",
                    mimeType: "image/png",
                    source: "local-filesystem",
                },
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/" + mediaId + "-stroke-order.gif",
                    mimeType: "image/gif",
                    source: "remote-stroke-order-animation",
                },
                audio: [{
                    kind: "audio",
                    path: "audio/" + mediaId + "-kanji-reading-日-にち.wav",
                    mimeType: "audio/wav",
                    source: "voicevox-nemo",
                    category: "kanji-reading",
                    text: "日",
                    reading: "にち",
                    locale: "ja-JP",
                }],
            },
        }, null, 2), "utf-8");

        const existingComplete = await buildExistingCompleteSyncResult({
            kanji: "日",
            mediaRootDir,
            audioMetadata: { reading: "にち" },
        });
        assert.equal(existingComplete.strokeOrder.skipped, true);
        assert.equal(existingComplete.audio.skipped, true);

        const result = await syncMediaForKanjiList({
            kanjiList: ["日"],
            mediaRootDir,
            strokeOrderService: {
                async syncKanji() {
                    throw new Error("stroke sync should not run");
                },
            },
            audioService: {
                async syncKanji() {
                    throw new Error("audio sync should not run");
                },
            },
            audioMetadata: { reading: "にち" },
        });

        assert.equal(result.results.length, 1);
        assert.equal(result.summary.errors.length, 0);
        assert.equal(result.summary.strokeOrder.imageHits, 1);
        assert.equal(result.summary.strokeOrder.animationHits, 1);
        assert.equal(result.summary.audio.hits, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});


test("syncMediaForKanjiList does not skip acquisition for a different requested reading", async () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        const mediaId = buildKanjiMediaId("日");
        const baseDir = path.join(mediaRootDir, "kanji", "65", mediaId);
        fs.mkdirSync(path.join(baseDir, "images"), { recursive: true });
        fs.mkdirSync(path.join(baseDir, "animations"), { recursive: true });
        fs.mkdirSync(path.join(baseDir, "audio"), { recursive: true });
        fs.writeFileSync(path.join(baseDir, "images", mediaId + "-stroke-order.png"), "image");
        fs.writeFileSync(path.join(baseDir, "animations", mediaId + "-stroke-order.gif"), "animation");
        fs.writeFileSync(path.join(baseDir, "audio", mediaId + "-kanji-reading-日-にち.wav"), "audio");
        fs.writeFileSync(path.join(baseDir, "manifest.json"), JSON.stringify({
            kanji: "日",
            version: 1,
            updatedAt: "2026-01-01T00:00:00.000Z",
            assets: {
                strokeOrderImage: {
                    kind: "image",
                    path: "images/" + mediaId + "-stroke-order.png",
                    mimeType: "image/png",
                    source: "local-filesystem",
                },
                strokeOrderAnimation: {
                    kind: "animation",
                    path: "animations/" + mediaId + "-stroke-order.gif",
                    mimeType: "image/gif",
                    source: "remote-stroke-order-animation",
                },
                audio: [{
                    kind: "audio",
                    path: "audio/" + mediaId + "-kanji-reading-日-にち.wav",
                    mimeType: "audio/wav",
                    source: "voicevox-nemo",
                    category: "kanji-reading",
                    text: "日",
                    reading: "にち",
                    locale: "ja-JP",
                }],
            },
        }, null, 2), "utf-8");

        const existingComplete = await buildExistingCompleteSyncResult({
            kanji: "日",
            mediaRootDir,
            audioMetadata: { reading: "ひ" },
        });
        assert.equal(existingComplete, null);

        const calls = [];
        const result = await syncMediaForKanjiList({
            kanjiList: ["日"],
            mediaRootDir,
            strokeOrderService: {
                async syncKanji(kanji) {
                    calls.push("stroke:" + kanji);
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
            audioService: {
                async syncKanji(kanji, metadata) {
                    calls.push("audio:" + kanji + ":" + metadata.reading);
                    return {
                        manifest: {
                            assets: {
                                audio: [{ source: "voicevox-nemo", reading: metadata.reading }],
                            },
                        },
                    };
                },
            },
            audioMetadata: { reading: "ひ" },
        });

        assert.deepEqual(calls, ["stroke:日", "audio:日:ひ"]);
        assert.equal(result.summary.audio.hits, 1);
        assert.equal(result.summary.errors.length, 0);
    } finally {
        cleanupTempDir(rootDir);
    }
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
