const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildCommonsFileName,
    buildCommonsFilePageUrl,
    buildCommonsRedirectUrl,
    buildWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderSheet,
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
        assert.equal(plan.rows[0].gapType, "animation_only");
        assert.equal(plan.rows[0].image, null);
        assert.equal(plan.rows[0].animation.fileName, "日-order.gif");
        assert.equal(plan.rows[0].animation.status, "guessed_name");
        assert.equal(plan.rows[1].gapType, "missing_stroke_order");
        assert.equal(plan.rows[1].image.fileName, "本-bw.png");
        assert.equal(plan.rows[1].animation.fileName, "本-order.gif");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildWikimediaStrokeOrderPlan can mark discovered Commons availability", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });

        const responses = {
            "intitle:今 order": { query: { search: [{ title: "File:今-bw.png" }] } },
            "intitle:今 stroke order": { query: { search: [] } },
            "intitle:今 bw": { query: { search: [{ title: "File:今-bw.png" }] } },
        };

        const plan = await buildWikimediaStrokeOrderPlan({
            jlptOnlyJson: { 今: { jlpt: 5 } },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            levels: [5],
            limit: 10,
            discover: true,
            fetchJson: async (url) => responses[new URL(url).searchParams.get("srsearch")] || { query: { search: [] } },
        });

        assert.equal(plan.discover, true);
        assert.equal(plan.discoveryAvailable, true);
        assert.equal(plan.statusSummary.confirmed_on_commons, 1);
        assert.equal(plan.statusSummary.not_found_on_commons, 1);
        assert.equal(plan.rows[0].image.status, "confirmed_on_commons");
        assert.equal(plan.rows[0].animation.status, "not_found_on_commons");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildWikimediaStrokeOrderPlan falls back cleanly when discovery is unavailable", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });

        const plan = await buildWikimediaStrokeOrderPlan({
            jlptOnlyJson: { 今: { jlpt: 5 } },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            levels: [5],
            limit: 10,
            discover: true,
            fetchJson: async () => {
                throw new Error("fetch failed");
            },
        });

        assert.equal(plan.discoveryAvailable, false);
        assert.match(plan.discoveryErrorMessage, /fetch failed/);
        assert.equal(plan.statusSummary.discovery_unavailable, 2);
        assert.equal(plan.rows[0].image.status, "discovery_unavailable");
        assert.equal(plan.rows[0].animation.status, "discovery_unavailable");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildWikimediaStrokeOrderPlan reuses cached discovery entries", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        const cachePath = path.join(rootDir, "cache", "wikimedia-stroke-order-discovery.json");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify({
            今: {
                kanji: "今",
                image: {
                    fileName: "今-bw.png",
                    filePageUrl: "https://commons.wikimedia.org/wiki/File:%E4%BB%8A-bw.png",
                    downloadUrl: "https://commons.wikimedia.org/wiki/Special:Redirect/file/%E4%BB%8A-bw.png",
                },
                animation: null,
                diagram: null,
                titles: ["今-bw.png"],
            },
        }, null, 2));

        const plan = await buildWikimediaStrokeOrderPlan({
            jlptOnlyJson: { 今: { jlpt: 5 } },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            levels: [5],
            limit: 10,
            discover: true,
            discoveryCachePath: cachePath,
            fetchJson: async () => {
                throw new Error("fetch should not be called when cache is present");
            },
        });

        assert.equal(plan.rows[0].image.fileName, "今-bw.png");
        assert.equal(plan.rows[0].image.status, "confirmed_on_commons");
        assert.equal(plan.rows[0].animation.status, "not_found_on_commons");
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
        discover: true,
        discoveryAvailable: false,
        discoveryErrorMessage: "fetch failed",
        statusSummary: {
            confirmed_on_commons: 10,
            not_found_on_commons: 20,
            guessed_name: 0,
            discovery_unavailable: 49,
        },
        rows: [{
            kanji: "日",
            level: 5,
            gapType: "animation_only",
            image: {
                fileName: "日-bw.png",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-bw.png",
                status: "confirmed_on_commons",
            },
            animation: {
                fileName: "日-order.gif",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-order.gif",
                status: "discovery_unavailable",
            },
        }],
        truncated: false,
        totalMissingRows: 1,
        imageSourceDir: "C:/repo/data/media_sources/stroke-order/images",
        animationSourceDir: "C:/repo/data/media_sources/stroke-order/animations",
        projectNote: "Wikimedia Commons CJK Stroke Order Project",
        discoveryCachePath: "C:/repo/cache/wikimedia-stroke-order-discovery.json",
    });

    assert.match(text, /Wikimedia Stroke-Order Plan/);
    assert.match(text, /Missing Commons-style static images: 79/);
    assert.match(text, /Discovery mode: enabled/);
    assert.match(text, /Confirmed on Commons: 10/);
    assert.match(text, /Discovery unavailable fallback: 49/);
    assert.match(text, /Discovery note: fetch failed/);
    assert.match(text, /- 日 \(N5, animation only\)/);
    assert.match(text, /Image status: confirmed on Commons/);
    assert.match(text, /Animation status: discovery unavailable; guessed Commons filename shown/);
    assert.match(text, /animation-only rows first/);
});

test("formatWikimediaStrokeOrderSheet renders a compact copyable checklist", () => {
    const text = formatWikimediaStrokeOrderSheet({
        discover: true,
        rows: [{
            kanji: "日",
            level: 5,
            gapType: "animation_only",
            image: {
                fileName: "日-bw.png",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-bw.png",
                status: "confirmed_on_commons",
            },
            animation: {
                fileName: "日-order.gif",
                filePageUrl: "https://commons.wikimedia.org/wiki/File:%E6%97%A5-order.gif",
                status: "not_found_on_commons",
            },
        }],
    });

    assert.match(text, /Wikimedia Stroke-Order Sheet/);
    assert.match(text, /日 \| N5 \| animation_only \| 日-bw\.png \| https:\/\/commons\.wikimedia\.org\/wiki\/File:%E6%97%A5-bw\.png \| confirmed_on_commons \| 日-order\.gif/);
});
