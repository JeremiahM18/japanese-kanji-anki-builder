const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiMediaId,
    buildManifestPath,
    buildMediaBasePath,
    buildTemporaryManifestPath,
    createEmptyMediaManifest,
    ensureMediaLayout,
    ensureMediaRoot,
    isTransientRenameError,
    readManifestIfExists,
    renameWithRetry,
    updateManifest,
    writeManifest,
} = require("../src/services/mediaStore");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-store-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("buildKanjiMediaId produces a stable filesystem-safe identifier", () => {
    assert.equal(buildKanjiMediaId("日"), "65E5_日");
});

test("ensureMediaRoot creates the shared media directory structure", () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        ensureMediaRoot(mediaRootDir);

        assert.equal(fs.existsSync(mediaRootDir), true);
        assert.equal(fs.existsSync(path.join(mediaRootDir, "kanji")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("ensureMediaLayout provisions per-kanji directories and manifest path", () => {
    const rootDir = makeTempDir();

    try {
        const layout = ensureMediaLayout(rootDir, "日");

        assert.equal(layout.basePath, buildMediaBasePath(rootDir, "日"));
        assert.equal(layout.manifestPath, buildManifestPath(rootDir, "日"));
        assert.equal(fs.existsSync(layout.imagesDir), true);
        assert.equal(fs.existsSync(layout.animationsDir), true);
        assert.equal(fs.existsSync(layout.audioDir), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildTemporaryManifestPath creates unique temp file names", () => {
    const manifestPath = path.join("C:", "tmp", "manifest.json");
    const first = buildTemporaryManifestPath(manifestPath);
    const second = buildTemporaryManifestPath(manifestPath);

    assert.notEqual(first, second);
    assert.match(first, /\.tmp$/);
    assert.match(second, /\.tmp$/);
});

test("isTransientRenameError matches expected Windows file-lock errors", () => {
    assert.equal(isTransientRenameError({ code: "EPERM" }), true);
    assert.equal(isTransientRenameError({ code: "EBUSY" }), true);
    assert.equal(isTransientRenameError({ code: "EACCES" }), true);
    assert.equal(isTransientRenameError({ code: "ENOENT" }), false);
});

test("createEmptyMediaManifest defines placeholders for stroke-order and audio assets", () => {
    const manifest = createEmptyMediaManifest("日");

    assert.equal(manifest.kanji, "日");
    assert.equal(manifest.version, 1);
    assert.equal(manifest.assets.strokeOrderImage, null);
    assert.equal(manifest.assets.strokeOrderAnimation, null);
    assert.deepEqual(manifest.assets.audio, []);
});

test("renameWithRetry retries transient rename failures", async () => {
    const rootDir = makeTempDir();
    const fromPath = path.join(rootDir, "from.tmp");
    const toPath = path.join(rootDir, "to.json");
    fs.writeFileSync(fromPath, "fixture", "utf-8");

    const originalRename = fsp.rename;
    let attempts = 0;

    try {
        fsp.rename = async (...args) => {
            attempts += 1;
            if (attempts < 3) {
                const error = new Error("busy");
                error.code = "EPERM";
                throw error;
            }
            return originalRename(...args);
        };

        await renameWithRetry(fromPath, toPath, { retries: 4, baseDelayMs: 1 });
        assert.equal(fs.existsSync(toPath), true);
        assert.equal(attempts, 3);
    } finally {
        fsp.rename = originalRename;
        cleanupTempDir(rootDir);
    }
});

test("writeManifest persists a validated manifest that can be read back", async () => {
    const rootDir = makeTempDir();

    try {
        const manifest = createEmptyMediaManifest("日");
        manifest.assets.strokeOrderImage = {
            kind: "image",
            path: "images/stroke-order.png",
            mimeType: "image/png",
            source: "fixture",
            width: 512,
            height: 512,
        };
        manifest.assets.audio.push({
            kind: "audio",
            path: "audio/kanji-reading.mp3",
            mimeType: "audio/mpeg",
            source: "fixture",
            category: "kanji-reading",
            text: "日",
            reading: "にち",
            locale: "ja-JP",
        });

        await writeManifest(rootDir, manifest);

        const loaded = await readManifestIfExists(rootDir, "日");
        assert.equal(loaded.kanji, "日");
        assert.equal(loaded.assets.strokeOrderImage.path, "images/stroke-order.png");
        assert.equal(loaded.assets.audio.length, 1);
        assert.equal(loaded.assets.audio[0].category, "kanji-reading");
        assert.equal(loaded.assets.audio[0].text, "日");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("updateManifest serializes concurrent writes for the same kanji", async () => {
    const rootDir = makeTempDir();

    try {
        await Promise.all([
            updateManifest(rootDir, "日", async (manifest) => {
                await new Promise((resolve) => setTimeout(resolve, 20));
                return {
                    ...manifest,
                    assets: {
                        ...manifest.assets,
                        strokeOrderImage: {
                            kind: "image",
                            path: "images/stroke-order.svg",
                            mimeType: "image/svg+xml",
                            source: "fixture-image",
                        },
                    },
                };
            }),
            updateManifest(rootDir, "日", async (manifest) => ({
                ...manifest,
                assets: {
                    ...manifest.assets,
                    audio: [
                        ...manifest.assets.audio,
                        {
                            kind: "audio",
                            path: "audio/kanji-reading.mp3",
                            mimeType: "audio/mpeg",
                            source: "fixture-audio",
                            category: "kanji-reading",
                            text: "日",
                            locale: "ja-JP",
                        },
                    ],
                },
            })),
        ]);

        const loaded = await readManifestIfExists(rootDir, "日");
        assert.equal(loaded.assets.strokeOrderImage.path, "images/stroke-order.svg");
        assert.equal(loaded.assets.audio.length, 1);
        assert.equal(loaded.assets.audio[0].path, "audio/kanji-reading.mp3");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("readManifestIfExists returns null for missing manifests", async () => {
    const rootDir = makeTempDir();

    try {
        const manifest = await readManifestIfExists(rootDir, "日");
        assert.equal(manifest, null);
    } finally {
        cleanupTempDir(rootDir);
    }
});
