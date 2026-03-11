const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { readManifestIfExists } = require("../src/services/mediaStore");
const {
    buildKanjiFileCandidates,
    createStrokeOrderService,
    findMatchingAsset,
    normalizeKanji,
} = require("../src/services/strokeOrderService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "stroke-order-service-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("normalizeKanji trims and validates the input", () => {
    assert.equal(normalizeKanji(" 日 "), "日");
    assert.throws(() => normalizeKanji(""), /kanji is required/);
});

test("buildKanjiFileCandidates includes kanji and codepoint variants", () => {
    assert.deepEqual(buildKanjiFileCandidates("日"), ["日", "65E5", "U+65E5", "65e5", "u+65e5"]);
});

test("findMatchingAsset resolves a local stroke-order source file", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "images");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "65E5.svg"), "<svg></svg>", "utf-8");

        const asset = await findMatchingAsset(imageDir, "日", new Map([[".svg", "image/svg+xml"]]));
        assert.equal(asset.fileName, "65E5.svg");
        assert.equal(asset.mimeType, "image/svg+xml");
        assert.equal(asset.checksum.length, 64);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("syncKanji imports image and animation assets into the media store", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "source-images");
        const animationSourceDir = path.join(rootDir, "source-animations");
        const mediaRootDir = path.join(rootDir, "media");

        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.writeFileSync(path.join(imageSourceDir, "日.svg"), "<svg>stroke-order</svg>", "utf-8");
        fs.writeFileSync(path.join(animationSourceDir, "U+65E5.gif"), "gif-binary-fixture", "utf-8");

        const service = createStrokeOrderService({
            mediaRootDir,
            imageSourceDir,
            animationSourceDir,
        });

        const result = await service.syncKanji("日");
        const manifest = await readManifestIfExists(mediaRootDir, "日");

        assert.equal(result.found.image, true);
        assert.equal(result.found.animation, true);
        assert.equal(manifest.assets.strokeOrderImage.path, "images/stroke-order.svg");
        assert.equal(manifest.assets.strokeOrderAnimation.path, "animations/stroke-order.gif");
        assert.equal(await service.getBestStrokeOrderPath("日"), "animations/stroke-order.gif");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("syncKanji preserves an empty manifest when no source assets exist", async () => {
    const rootDir = makeTempDir();

    try {
        const service = createStrokeOrderService({
            mediaRootDir: path.join(rootDir, "media"),
            imageSourceDir: path.join(rootDir, "missing-images"),
            animationSourceDir: path.join(rootDir, "missing-animations"),
        });

        const result = await service.syncKanji("山");

        assert.equal(result.found.image, false);
        assert.equal(result.found.animation, false);
        assert.equal(await service.getBestStrokeOrderPath("山"), "");
    } finally {
        cleanupTempDir(rootDir);
    }
});
