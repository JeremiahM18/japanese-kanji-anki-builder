const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildCommonsFileName,
    buildCommonsFilePageUrl,
    buildCommonsRedirectUrl,
    buildWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderPlan,
} = require("../src/services/wikimediaStrokeOrderPlanService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "wikimedia-stroke-plan-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("Commons helpers generate expected filenames and URLs", () => {
    assert.equal(buildCommonsFileName("日", "image"), "日-bw.png");
    assert.equal(buildCommonsFileName("日", "animation"), "日-order.gif");
    assert.equal(buildCommonsFilePageUrl("日-bw.png"), "https://commons.wikimedia.org/wiki/File:%E6%97%A5-bw.png");
    assert.equal(buildCommonsRedirectUrl("日-order.gif"), "https://commons.wikimedia.org/wiki/Special:Redirect/file/%E6%97%A5-order.gif");
});

test("buildWikimediaStrokeOrderPlan lists only missing stroke-order assets", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.writeFileSync(path.join(imageSourceDir, "日-bw.png"), "image", "utf-8");

        const plan = await buildWikimediaStrokeOrderPlan({
            jlptOnlyJson: {
                日: { jlpt: 5 },
                本: { jlpt: 5 },
            },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            levels: [5],
            limit: 10,
        });

        assert.equal(plan.totalKanji, 2);
        assert.equal(plan.imageMissingCount, 1);
        assert.equal(plan.animationMissingCount, 2);
        assert.equal(plan.rows[0].kanji, "日");
        assert.equal(plan.rows[0].image, null);
        assert.equal(plan.rows[0].animation.fileName, "日-order.gif");
        assert.equal(plan.rows[1].image.fileName, "本-bw.png");
        assert.equal(plan.rows[1].animation.fileName, "本-order.gif");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatWikimediaStrokeOrderPlan renders a clear Commons checklist", () => {
    const text = formatWikimediaStrokeOrderPlan({
        levels: [5],
        totalKanji: 79,
        imageMissingCount: 79,
        animationMissingCount: 79,
        rows: [{
            kanji: "日",
            level: 5,
            image: {
                fileName: "日-bw.png",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-bw.png",
            },
            animation: {
                fileName: "日-order.gif",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-order.gif",
            },
        }],
        truncated: false,
        totalMissingRows: 1,
        imageSourceDir: "C:/repo/data/media_sources/stroke-order/images",
        animationSourceDir: "C:/repo/data/media_sources/stroke-order/animations",
        projectNote: "Wikimedia Commons CJK Stroke Order Project",
    });

    assert.match(text, /Wikimedia Stroke-Order Plan/);
    assert.match(text, /Missing Commons-style static images: 79/);
    assert.match(text, /日-bw\.png/);
    assert.match(text, /日-order\.gif/);
    assert.match(text, /commons\.wikimedia\.org\/wiki\/File:%E6%97%A5-bw\.png/);
    assert.match(text, /media:import:stroke-order/);
});
