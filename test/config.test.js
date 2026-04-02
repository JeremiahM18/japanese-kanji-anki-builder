const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadConfig, loadDotEnvFile, parseDotEnvText } = require("../src/config");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "config-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("parseDotEnvText ignores comments and parses quoted values", () => {
    const parsed = parseDotEnvText(`
# comment
PORT=4000
AUDIO_SOURCE_DIR="data/audio files"
REMOTE_AUDIO_BASE_URL='https://media.example.com/audio/'
`);

    assert.equal(parsed.PORT, "4000");
    assert.equal(parsed.AUDIO_SOURCE_DIR, "data/audio files");
    assert.equal(parsed.REMOTE_AUDIO_BASE_URL, "https://media.example.com/audio/");
});

test("loadDotEnvFile returns parsed values when .env exists", () => {
    const rootDir = makeTempDir();

    try {
        fs.writeFileSync(path.join(rootDir, ".env"), "PORT=4020\n", "utf-8");
        const parsed = loadDotEnvFile({ cwd: rootDir });
        assert.equal(parsed.PORT, "4020");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadConfig reads .env values and resolves paths from cwd", () => {
    const rootDir = makeTempDir();

    try {
        fs.writeFileSync(path.join(rootDir, ".env"), [
            "PORT=4021",
            "STROKE_ORDER_IMAGE_SOURCE_DIR=data/custom-images",
            "REMOTE_AUDIO_BASE_URL=https://media.example.com/audio/",
            "VOICEVOX_ENGINE_URL=http://127.0.0.1:50022",
            "VOICEVOX_SPEAKER_ID=3",
        ].join("\n"), "utf-8");

        const config = loadConfig({ cwd: rootDir, env: {} });

        assert.equal(config.port, 4021);
        assert.equal(config.strokeOrderImageSourceDir, path.join(rootDir, "data", "custom-images"));
        assert.equal(config.remoteAudioBaseUrl, "https://media.example.com/audio/");
        assert.equal(config.voicevoxEngineUrl, "http://127.0.0.1:50022");
        assert.equal(config.voicevoxSpeakerId, 3);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadConfig prefers process env over .env", () => {
    const rootDir = makeTempDir();

    try {
        fs.writeFileSync(path.join(rootDir, ".env"), "EXPORT_CONCURRENCY=4\n", "utf-8");
        const config = loadConfig({
            cwd: rootDir,
            env: {
                EXPORT_CONCURRENCY: "12",
            },
        });

        assert.equal(config.exportConcurrency, 12);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadConfig parses ENABLE_AUDIO as a boolean flag", () => {
    const config = loadConfig({
        cwd: process.cwd(),
        env: { ENABLE_AUDIO: "false" },
    });

    assert.equal(config.enableAudio, false);
});

test("loadConfig defaults stroke-order animation remote to the GitHub kanji gif set", () => {
    const config = loadConfig({
        cwd: process.cwd(),
        env: {},
    });

    assert.equal(
        config.remoteStrokeOrderAnimationBaseUrl,
        "https://raw.githubusercontent.com/jcsirot/kanji.gif/master/kanji/gif/150x150/",
    );
});
