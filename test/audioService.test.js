const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildAudioFileCandidates,
    createAudioService,
    selectBestAudioAsset,
} = require("../src/services/audioService");
const { createStrokeOrderService } = require("../src/services/strokeOrderService");
const { buildKanjiMediaId } = require("../src/services/mediaStore");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "audio-service-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildAudioFileCandidates includes kanji text and reading-based variants", () => {
    const candidates = buildAudioFileCandidates({
        kanji: "日",
        text: "日本",
        reading: "にほん",
    });

    assert.equal(candidates.includes("日"), true);
    assert.equal(candidates.includes("日本"), true);
    assert.equal(candidates.includes("にほん"), true);
    assert.equal(candidates.includes("日_にほん"), true);
});

test("selectBestAudioAsset prefers kanji reading assets with matching preferences", () => {
    const best = selectBestAudioAsset([
        {
            path: "audio/sentence.mp3",
            category: "sentence",
            text: "日本へ行きます。",
            locale: "ja-JP",
        },
        {
            path: "audio/kanji.mp3",
            category: "kanji-reading",
            text: "日",
            locale: "ja-JP",
        },
    ], {
        category: "kanji-reading",
        text: "日",
    });

    assert.equal(best.path, "audio/kanji.mp3");
});

test("syncKanji imports audio into managed media storage", async () => {
    const rootDir = makeTempDir();

    try {
        const audioSourceDir = path.join(rootDir, "sources");
        fs.mkdirSync(audioSourceDir, { recursive: true });
        fs.writeFileSync(path.join(audioSourceDir, "日.mp3"), Buffer.from("fake-mp3"));

        const audioService = createAudioService({
            mediaRootDir: path.join(rootDir, "media"),
            audioSourceDir,
        });

        const result = await audioService.syncKanji("日", {
            category: "kanji-reading",
            text: "日",
            reading: "にち",
            voice: "study-voice-a",
        });

        assert.equal(result.found.audio, true);
        assert.equal(result.manifest.assets.audio.length, 1);
        assert.equal(result.manifest.assets.audio[0].category, "kanji-reading");
        assert.equal(result.manifest.assets.audio[0].text, "日");
        assert.equal(result.manifest.assets.audio[0].reading, "にち");
        assert.equal(result.manifest.assets.audio[0].voice, "study-voice-a");
        assert.equal(result.manifest.assets.audio[0].locale, "ja-JP");
        assert.equal(result.manifest.assets.audio[0].mimeType, "audio/mpeg");
        assert.match(result.manifest.assets.audio[0].path, /^audio\/65E5_日-kanji-reading-日/);
        assert.equal(fs.existsSync(path.join(rootDir, "media", "kanji", "65", "65E5_日", result.manifest.assets.audio[0].path)), true);
        assert.equal(await audioService.getBestAudioPath("日", { category: "kanji-reading", text: "日" }), result.manifest.assets.audio[0].path);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("concurrent stroke-order and audio sync preserve both manifest sections", async () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        const audioService = createAudioService({
            mediaRootDir,
            providers: [
                {
                    name: "fixture-audio",
                    async findAsset() {
                        await new Promise((resolve) => setTimeout(resolve, 10));
                        return {
                            fileName: "日.mp3",
                            mimeType: "audio/mpeg",
                            checksum: "audio-checksum",
                            content: Buffer.from("fixture-audio"),
                            extension: ".mp3",
                            source: "fixture-audio",
                        };
                    },
                },
            ],
        });
        const strokeOrderService = createStrokeOrderService({
            mediaRootDir,
            imageProviders: [
                {
                    name: "fixture-image",
                    async findAsset() {
                        return {
                            fileName: "日.svg",
                            mimeType: "image/svg+xml",
                            checksum: "image-checksum",
                            content: Buffer.from("fixture-image"),
                            extension: ".svg",
                            source: "fixture-image",
                        };
                    },
                },
            ],
            animationProviders: [
                {
                    name: "fixture-animation",
                    async findAsset() {
                        await new Promise((resolve) => setTimeout(resolve, 5));
                        return {
                            fileName: "日.gif",
                            mimeType: "image/gif",
                            checksum: "animation-checksum",
                            content: Buffer.from("fixture-animation"),
                            extension: ".gif",
                            source: "fixture-animation",
                        };
                    },
                },
            ],
        });

        await Promise.all([
            strokeOrderService.syncKanji("日"),
            audioService.syncKanji("日", { text: "日", reading: "にち" }),
        ]);

        const manifest = await audioService.getManifest("日");
        assert.equal(manifest.assets.strokeOrderImage.source, "fixture-image");
        assert.equal(manifest.assets.strokeOrderAnimation.source, "fixture-animation");
        assert.equal(manifest.assets.audio.length, 1);
        assert.equal(manifest.assets.audio[0].source, "fixture-audio");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("getManifest caches audio manifests and refreshes after sync", async () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        const audioSourceDir = path.join(rootDir, "sources");
        const mediaId = buildKanjiMediaId("日");
        const manifestPath = path.join(mediaRootDir, "kanji", "65", mediaId, "manifest.json");
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.mkdirSync(audioSourceDir, { recursive: true });
        fs.writeFileSync(manifestPath, JSON.stringify({
            kanji: "日",
            version: 1,
            updatedAt: "2026-01-01T00:00:00.000Z",
            assets: {
                strokeOrderImage: null,
                strokeOrderAnimation: null,
                audio: [],
            },
        }, null, 2), "utf-8");

        const audioService = createAudioService({
            mediaRootDir,
            audioSourceDir,
        });

        const firstManifest = await audioService.getManifest("日");
        fs.writeFileSync(manifestPath, JSON.stringify({
            kanji: "日",
            version: 1,
            updatedAt: "2026-01-02T00:00:00.000Z",
            assets: {
                strokeOrderImage: null,
                strokeOrderAnimation: null,
                audio: [{
                    kind: "audio",
                    path: "audio/stale.mp3",
                    mimeType: "audio/mpeg",
                    source: "stale-disk-write",
                    category: "kanji-reading",
                    text: "日",
                    locale: "ja-JP",
                }],
            },
        }, null, 2), "utf-8");

        const cachedManifest = await audioService.getManifest("日");
        assert.deepEqual(cachedManifest.assets.audio, []);
        assert.equal(cachedManifest.updatedAt, firstManifest.updatedAt);

        fs.writeFileSync(path.join(audioSourceDir, "日.mp3"), Buffer.from("fake-mp3"));
        await audioService.syncKanji("日", { text: "日", reading: "にち" });

        const refreshedManifest = await audioService.getManifest("日");
        assert.equal(refreshedManifest.assets.audio.some((asset) => asset.source === "local-filesystem"), true);
        const localAsset = refreshedManifest.assets.audio.find((asset) => asset.source === "local-filesystem");
        assert.match(localAsset.path, new RegExp("^audio/" + mediaId + "-kanji-reading-日"));
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("audio providers fall back when the first provider misses", async () => {
    const rootDir = makeTempDir();

    try {
        const audioService = createAudioService({
            mediaRootDir: rootDir,
            providers: [
                {
                    name: "missing-provider",
                    async findAsset() {
                        return null;
                    },
                },
                {
                    name: "fixture-provider",
                    async findAsset() {
                        return {
                            absolutePath: "C:/fixture/日.mp3",
                            fileName: "日.mp3",
                            mimeType: "audio/mpeg",
                            checksum: "fixture-checksum",
                            content: Buffer.from("fixture-audio"),
                            extension: ".mp3",
                            source: "fixture-provider",
                        };
                    },
                },
            ],
        });

        const result = await audioService.syncKanji("日", { text: "日" });

        assert.equal(result.found.audio, true);
        assert.equal(result.manifest.assets.audio[0].source, "fixture-provider");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("syncKanji preserves an empty manifest when no audio source exists", async () => {
    const rootDir = makeTempDir();

    try {
        const audioService = createAudioService({
            mediaRootDir: path.join(rootDir, "media"),
            audioSourceDir: path.join(rootDir, "missing-audio"),
        });

        const result = await audioService.syncKanji("日");

        assert.equal(result.found.audio, false);
        assert.deepEqual(result.manifest.assets.audio, []);
    } finally {
        cleanupTempDir(rootDir);
    }
});
