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
        assert.equal(fs.existsSync(path.join(rootDir, "media", "kanji", "65", "65E5_日", result.manifest.assets.audio[0].path)), true);
        assert.equal(await audioService.getBestAudioPath("日", { category: "kanji-reading", text: "日" }), result.manifest.assets.audio[0].path);
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
