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
            "MEDIA_MANIFEST_CACHE_TTL_MS=45000",
        ].join("\n"), "utf-8");

        const config = loadConfig({ cwd: rootDir, env: {} });

        assert.equal(config.port, 4021);
        assert.equal(config.serverHost, "127.0.0.1");
        assert.equal(config.kanjiComponentContractPath, path.join(rootDir, "templates", "kanji_component_contract.json"));
        assert.equal(config.strokeOrderImageSourceDir, path.join(rootDir, "data", "custom-images"));
        assert.equal(config.remoteAudioBaseUrl, "https://media.example.com/audio/");
        assert.equal(config.voicevoxEngineUrl, "http://127.0.0.1:50022");
        assert.equal(config.voicevoxSpeakerId, 3);
        assert.equal(config.mediaManifestCacheTtlMs, 45000);
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

test("loadConfig reads the explicit server bind host", () => {
    const config = loadConfig({
        cwd: process.cwd(),
        env: { SERVER_HOST: "0.0.0.0" },
    });

    assert.equal(config.serverHost, "0.0.0.0");
});

test("loadConfig parses ENABLE_AUDIO as a boolean flag", () => {
    const config = loadConfig({
        cwd: process.cwd(),
        env: { ENABLE_AUDIO: "false" },
    });

    assert.equal(config.enableAudio, false);
});

test("loadConfig leaves stroke-order animation remote unset unless configured", () => {
    const rootDir = makeTempDir();

    try {
        const config = loadConfig({
            cwd: rootDir,
            env: {},
        });

        assert.equal(config.remoteStrokeOrderAnimationBaseUrl, undefined);
        assert.equal(config.remoteStrokeOrderAnimCjkBaseUrl, undefined);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("loadConfig reads the optional AnimCJK fallback base URL", () => {
    const config = loadConfig({
        cwd: process.cwd(),
        env: {
            REMOTE_STROKE_ORDER_ANIMCJK_BASE_URL: "https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsJa/",
        },
    });

    assert.equal(
        config.remoteStrokeOrderAnimCjkBaseUrl,
        "https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsJa/"
    );
});

test("loadConfig rejects invalid boolean-like values for ENABLE_AUDIO", () => {
    assert.throws(
        () => loadConfig({
            cwd: process.cwd(),
            env: { ENABLE_AUDIO: "maybe" },
        }),
        /expected boolean, received undefined/i
    );
});

test("loadConfig validates NODE_ENV and defaults it to development", () => {
    const defaultConfig = loadConfig({
        cwd: process.cwd(),
        env: {},
    });
    assert.equal(defaultConfig.nodeEnv, "development");

    const productionConfig = loadConfig({
        cwd: process.cwd(),
        env: { NODE_ENV: "production" },
    });
    assert.equal(productionConfig.nodeEnv, "production");

    assert.throws(
        () => loadConfig({
            cwd: process.cwd(),
            env: { NODE_ENV: "staging" },
        }),
        /Invalid option/
    );
});
