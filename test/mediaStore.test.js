const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiMediaId,
    buildManifestPath,
    buildMediaBasePath,
    createEmptyMediaManifest,
    ensureMediaLayout,
    ensureMediaRoot,
    readManifestIfExists,
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

test("createEmptyMediaManifest defines placeholders for stroke-order and audio assets", () => {
    const manifest = createEmptyMediaManifest("日");

    assert.equal(manifest.kanji, "日");
    assert.equal(manifest.version, 1);
    assert.equal(manifest.assets.strokeOrderImage, null);
    assert.equal(manifest.assets.strokeOrderAnimation, null);
    assert.deepEqual(manifest.assets.audio, []);
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

        await writeManifest(rootDir, manifest);

        const loaded = await readManifestIfExists(rootDir, "日");
        assert.equal(loaded.kanji, "日");
        assert.equal(loaded.assets.strokeOrderImage.path, "images/stroke-order.png");
        assert.equal(loaded.assets.audio.length, 0);
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
