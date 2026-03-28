const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildMediaCoverageSummaryFromRows,
    getBestAudioAsset,
    getBestStrokeOrderAsset,
} = require("../src/datasets/mediaCoverage");

test("getBestStrokeOrderAsset prefers animation over image", () => {
    const asset = getBestStrokeOrderAsset({
        assets: {
            strokeOrderImage: { path: "images/a.svg", source: "local-filesystem" },
            strokeOrderAnimation: { path: "animations/a.gif", source: "remote-stroke-order-animation" },
            audio: [],
        },
    });

    assert.equal(asset.path, "animations/a.gif");
});

test("getBestAudioAsset prefers kanji-reading audio for the current kanji", () => {
    const asset = getBestAudioAsset({
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: [
                {
                    path: "audio/sentence.mp3",
                    source: "remote-audio",
                    category: "sentence",
                    text: "日本へ行きます。",
                },
                {
                    path: "audio/kanji.mp3",
                    source: "local-filesystem",
                    category: "kanji-reading",
                    text: "日",
                    locale: "ja-JP",
                },
            ],
        },
    }, "日");

    assert.equal(asset.path, "audio/kanji.mp3");
});

test("buildMediaCoverageSummaryFromRows reports coverage and source distribution", () => {
    const summary = buildMediaCoverageSummaryFromRows([
        {
            kanji: "日",
            level: 5,
            strokeOrderAsset: { source: "remote-stroke-order-animation" },
            strokeOrderAnimationAsset: { path: "animations/a.gif", source: "remote-stroke-order-animation" },
            trueAnimationAsset: { path: "animations/a.gif", source: "remote-stroke-order-animation" },
            audioAsset: { source: "remote-audio" },
        },
        {
            kanji: "本",
            level: 5,
            strokeOrderAsset: { source: "local-filesystem" },
            strokeOrderAnimationAsset: { path: "animations/b.svg", source: "local-filesystem" },
            trueAnimationAsset: null,
            audioAsset: null,
        },
        {
            kanji: "学",
            level: 4,
            strokeOrderAsset: null,
            strokeOrderAnimationAsset: null,
            trueAnimationAsset: null,
            audioAsset: null,
        },
    ], {
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        学: { jlpt: 4 },
    });

    assert.equal(summary.totalKanji, 3);
    assert.equal(summary.strokeOrderCovered, 2);
    assert.equal(summary.trueAnimationCovered, 1);
    assert.equal(summary.audioCovered, 1);
    assert.equal(summary.fullMediaCovered, 1);
    assert.equal(summary.strokeOrderSources["remote-stroke-order-animation"], 1);
    assert.equal(summary.strokeOrderSources["local-filesystem"], 1);
    assert.equal(summary.audioSources["remote-audio"], 1);
    assert.equal(summary.trueAnimationCoverageRatio, 0.3333);
    assert.deepEqual(summary.missingByPriority, [
        { kanji: "学", level: 4, missingStrokeOrder: true, missingTrueAnimation: true, missingAudio: true },
        { kanji: "日", level: 5, missingStrokeOrder: false, missingTrueAnimation: false, missingAudio: false },
        { kanji: "本", level: 5, missingStrokeOrder: false, missingTrueAnimation: true, missingAudio: true },
    ].filter((row) => row.missingStrokeOrder || row.missingTrueAnimation || row.missingAudio));
});
