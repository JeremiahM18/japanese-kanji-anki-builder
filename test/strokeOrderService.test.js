const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildKanjiMediaId } = require("../src/services/mediaStore");
const {
    buildKanjiFileCandidates,
    buildKanjiVgStrokeOrderCandidates,
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

test("buildKanjiVgStrokeOrderCandidates includes Commons KanjiVG variants", () => {
    assert.deepEqual(buildKanjiVgStrokeOrderCandidates("今"), [
        "今 - U+04ECA- KanjiVG stroke order",
        "今 - U+04ECA (Kaisho) - KanjiVG stroke order",
    ]);
});

test("buildStrokeOrderImageCandidates includes Wikimedia and KanjiVG image variants", () => {
    const candidates = buildStrokeOrderImageCandidates("円");
    assert.ok(candidates.includes("円-bw"));
    assert.ok(candidates.includes("円-jbw"));
    assert.ok(candidates.includes("円-jred"));
    assert.ok(candidates.includes("円 - U+05186- KanjiVG stroke order"));
});

test("buildStrokeOrderAnimationCandidates includes Commons and KanjiVG animation variants", () => {
    const candidates = buildStrokeOrderAnimationCandidates("四");
    assert.ok(candidates.includes("四-order"));
    assert.ok(candidates.includes("四-calligraphic-order"));
    assert.ok(candidates.includes("四-cursive-order"));
    assert.ok(candidates.includes("四 - U+056DB- KanjiVG stroke order"));
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

test("findMatchingAsset resolves KanjiVG and alternate Commons image file names", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "images");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "円-jbw.png"), "png", "utf-8");
        fs.writeFileSync(path.join(imageDir, "今 - U+04ECA- KanjiVG stroke order.svg"), "svg", "utf-8");

        const altAsset = await findMatchingAsset(
            imageDir,
            "円",
            new Map([[".png", "image/png"], [".svg", "image/svg+xml"]]),
            buildStrokeOrderImageCandidates
        );
        const svgAsset = await findMatchingAsset(
            imageDir,
            "今",
            new Map([[".png", "image/png"], [".svg", "image/svg+xml"]]),
            buildStrokeOrderImageCandidates
        );

        assert.equal(altAsset.fileName, "円-jbw.png");
        assert.equal(svgAsset.fileName, "今 - U+04ECA- KanjiVG stroke order.svg");
        assert.equal(svgAsset.mimeType, "image/svg+xml");
    } finally {
        cleanupTempDir(rootDir);
    }
});


test("findMatchingAsset resolves calligraphic Commons animation names", async () => {
    const rootDir = makeTempDir();

    try {
        const animationDir = path.join(rootDir, "animations");
        fs.mkdirSync(animationDir, { recursive: true });
        fs.writeFileSync(path.join(animationDir, "四-calligraphic-order.gif"), "gif", "utf-8");

        const asset = await findMatchingAsset(
            animationDir,
            "四",
            new Map([[".gif", "image/gif"]]),
            buildStrokeOrderAnimationCandidates
        );

        assert.equal(asset.fileName, "四-calligraphic-order.gif");
        assert.equal(asset.mimeType, "image/gif");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("syncKanji can promote KanjiVG SVGs into animation coverage", async () => {
    const rootDir = makeTempDir();

    try {
        const imageDir = path.join(rootDir, "source-images");
        const animationDir = path.join(rootDir, "source-animations");
        fs.mkdirSync(imageDir, { recursive: true });
        fs.mkdirSync(animationDir, { recursive: true });
        fs.writeFileSync(path.join(imageDir, "今 - U+04ECA- KanjiVG stroke order.svg"), "svg-binary", "utf-8");

        const service = createStrokeOrderService({
            mediaRootDir: path.join(rootDir, "media"),
            imageSourceDir: imageDir,
            animationSourceDir: animationDir,
        });

        const result = await service.syncKanji("今");
        const mediaId = buildKanjiMediaId("今");

        assert.equal(result.found.image, true);
        assert.equal(result.found.animation, true);
        assert.equal(result.manifest.assets.strokeOrderImage.path, `images/${mediaId}-stroke-order.svg`);
        assert.equal(result.manifest.assets.strokeOrderAnimation.path, `animations/${mediaId}-stroke-order.svg`);
        assert.equal(result.manifest.assets.strokeOrderAnimation.source, "kanjivg-svg-fallback");
        assert.equal(await service.getBestStrokeOrderPath("今"), `animations/${mediaId}-stroke-order.svg`);
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
