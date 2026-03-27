const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildKanjiMediaId } = require("../src/services/mediaStore");
const {
    buildKanjiFileCandidates,
    buildStrokeOrderAnimationCandidates,
    buildStrokeOrderImageCandidates,
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
    assert.throws(() => normalizeKanji("   "), /kanji is required/);
});

test("buildKanjiFileCandidates includes kanji and codepoint variants", () => {
    assert.deepEqual(buildKanjiFileCandidates("日"), ["日", "65E5", "U+65E5", "65e5", "u+65e5"]);
});

test("buildStrokeOrderImageCandidates includes Wikimedia-style image variants", () => {
    assert.deepEqual(buildStrokeOrderImageCandidates("日").slice(0, 6), ["日", "日-bw", "日-red", "65E5", "65E5-bw", "65E5-red"]);
});

test("buildStrokeOrderAnimationCandidates includes Wikimedia-style animation variants", () => {
    assert.deepEqual(buildStrokeOrderAnimationCandidates("日").slice(0, 4), ["日", "日-order", "65E5", "65E5-order"]);
});

test("findMatchingAsset resolves a local stroke-order source file", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "images");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "日-bw.png"), "png", "utf-8");

        const asset = await findMatchingAsset(
            imageDir,
            "日",
            new Map([[".png", "image/png"]]),
            buildStrokeOrderImageCandidates
        );

        assert.equal(asset.fileName, "日-bw.png");
        assert.equal(asset.mimeType, "image/png");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("syncKanji imports Wikimedia-style image and animation assets into the media store", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "source-images");
        const animationDir = path.join(rootDir, "source-animations");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.mkdirSync(animationDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "日-bw.png"), "png-binary", "utf-8");
        fs.writeFileSync(path.join(animationDir, "日-order.gif"), "gif-binary", "utf-8");

        const service = createStrokeOrderService({
            mediaRootDir: path.join(rootDir, "media"),
            imageSourceDir: imageDir,
            animationSourceDir: animationDir,
        });

        const result = await service.syncKanji("日");
        const mediaId = buildKanjiMediaId("日");

        assert.equal(result.found.image, true);
        assert.equal(result.found.animation, true);
        assert.equal(result.manifest.assets.strokeOrderImage.path, `images/${mediaId}-stroke-order.png`);
        assert.equal(result.manifest.assets.strokeOrderAnimation.path, `animations/${mediaId}-stroke-order.gif`);
        assert.equal(await service.getStrokeOrderImagePath("日"), `images/${mediaId}-stroke-order.png`);
        assert.equal(await service.getStrokeOrderAnimationPath("日"), `animations/${mediaId}-stroke-order.gif`);
        assert.equal(await service.getBestStrokeOrderPath("日"), `animations/${mediaId}-stroke-order.gif`);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("stroke-order providers fall back when the first provider misses", async () => {
    const rootDir = makeTempDir();

    try {
        const service = createStrokeOrderService({
            mediaRootDir: path.join(rootDir, "media"),
            imageProviders: [
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
                            fileName: "日-bw.png",
                            mimeType: "image/png",
                            checksum: "fixture-checksum",
                            content: Buffer.from("fixture-image"),
                            extension: ".png",
                            source: "fixture-provider",
                        };
                    },
                },
            ],
            animationProviders: [],
        });

        const result = await service.syncKanji("日");

        assert.equal(result.found.image, true);
        assert.equal(result.manifest.assets.strokeOrderImage.source, "fixture-provider");
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

        const result = await service.syncKanji("日");

        assert.equal(result.found.image, false);
        assert.equal(result.found.animation, false);
        assert.equal(result.manifest.assets.strokeOrderImage, null);
        assert.equal(result.manifest.assets.strokeOrderAnimation, null);
        assert.equal(await service.getStrokeOrderImagePath("日"), "");
        assert.equal(await service.getStrokeOrderAnimationPath("日"), "");
    } finally {
        cleanupTempDir(rootDir);
    }
});
