const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildMediaSourceReport,
    buildPreferredFileNames,
    classifyGapType,
    formatGapLabel,
    formatMediaSourceReport,
    hasAnyCandidate,
    parseLevelsArgument,
    summarizeGapTypes,
} = require("../src/services/mediaSourceReportService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-source-report-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("parseLevelsArgument normalizes comma-separated levels", () => {
    assert.deepEqual(parseLevelsArgument("5,4,5"), [5, 4]);
});

test("hasAnyCandidate detects candidate hits in an index", () => {
    const index = new Map([["日", [{ fileName: "日.png" }]]]);
    assert.equal(hasAnyCandidate(index, ["本", "日"]), true);
    assert.equal(hasAnyCandidate(index, ["本", "学"]), false);
});

test("buildMediaSourceReport separates animation-slot and true-animation coverage", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.writeFileSync(path.join(imageSourceDir, "今 - U+04ECA- KanjiVG stroke order.svg"), "svg", "utf-8");

        const report = await buildMediaSourceReport({
            jlptOnlyJson: {
                今: { jlpt: 5 },
            },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            audioSourceDir: path.join(rootDir, "audio"),
            audioEnabled: false,
            levels: [5],
            limit: 10,
        });

        assert.equal(report.imageAvailableCount, 1);
        assert.equal(report.animationAvailableCount, 1);
        assert.equal(report.trueAnimationAvailableCount, 0);
        assert.equal(report.rows.length, 1);
        assert.equal(report.rows[0].kanji, "今");
        assert.equal(report.rows[0].gapType, "animation_only");
        assert.equal(report.rows[0].hasAnimation, true);
        assert.equal(report.rows[0].hasTrueAnimation, false);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildPreferredFileNames surfaces accepted Commons filename variants", () => {
    assert.deepEqual(
        buildPreferredFileNames(["円", "円-bw", "円-jbw"], [".png", ".webp"], 6),
        ["円.png", "円.webp", "円-bw.png", "円-bw.webp", "円-jbw.png", "円-jbw.webp"],
    );
});

test("classifyGapType and formatGapLabel describe stroke-order gaps clearly", () => {
    assert.equal(classifyGapType({ hasImage: true, hasAnimation: false, hasAudio: false, audioEnabled: false }), "animation_only");
    assert.equal(classifyGapType({ hasImage: false, hasAnimation: true, hasAudio: false, audioEnabled: false }), "image_only");
    assert.equal(classifyGapType({ hasImage: false, hasAnimation: false, hasAudio: false, audioEnabled: false }), "missing_stroke_order");
    assert.equal(formatGapLabel("animation_only", false), "animation only");
    assert.equal(formatGapLabel("missing_stroke_order", false), "missing both stroke-order files");
});

test("summarizeGapTypes counts useful gap buckets", () => {
    assert.deepEqual(
        summarizeGapTypes([
            { gapType: "image_only" },
            { gapType: "animation_only" },
            { gapType: "animation_only" },
            { gapType: "missing_stroke_order" },
        ]),
        {
            missing_stroke_order: 1,
            image_only: 1,
            animation_only: 2,
            audio_only: 0,
            image_and_audio: 0,
            animation_and_audio: 0,
            missing_all: 0,
            mixed: 0,
        },
    );
});

test("buildMediaSourceReport summarizes source-folder coverage and missing assets", async () => {
    const rootDir = makeTempDir();

    try {
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        const audioSourceDir = path.join(rootDir, "audio");
        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.mkdirSync(audioSourceDir, { recursive: true });
        fs.writeFileSync(path.join(imageSourceDir, "日.png"), "image", "utf-8");
        fs.writeFileSync(path.join(animationSourceDir, "日-order.gif"), "animation", "utf-8");
        fs.writeFileSync(path.join(audioSourceDir, "本.mp3"), "audio", "utf-8");

        const report = await buildMediaSourceReport({
            jlptOnlyJson: {
                日: { jlpt: 5 },
                本: { jlpt: 5 },
                学: { jlpt: 4 },
            },
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            audioSourceDir,
            levels: [5, 4],
            limit: 10,
        });

        assert.equal(report.totalKanji, 3);
        assert.equal(report.imageAvailableCount, 1);
        assert.equal(report.animationAvailableCount, 1);
        assert.equal(report.trueAnimationAvailableCount, 1);
        assert.equal(report.audioAvailableCount, 1);
        assert.deepEqual(report.rows.map((row) => row.kanji), ["日", "本", "学"]);
        assert.equal(report.rows[0].hasImage, true);
        assert.equal(report.rows[0].hasAnimation, true);
        assert.equal(report.rows[0].hasAudio, false);
        assert.equal(report.rows[0].gapType, "audio_only");
        assert.equal(report.rows[1].hasAudio, true);
        assert.equal(report.rows[1].hasImage, false);
        assert.equal(report.rows[1].gapType, "missing_stroke_order");
        assert.equal(report.rows[1].preferredFileNames.image[2], "本-bw.png");
        assert.equal(report.rows[2].hasImage, false);
        assert.equal(report.rows[2].gapType, "missing_all");
        assert.equal(report.gapSummary.audio_only, 1);
        assert.equal(report.gapSummary.image_only, 0);
        assert.equal(report.gapSummary.missing_stroke_order, 1);
        assert.equal(report.gapSummary.missing_all, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatMediaSourceReport produces a clear local-source summary", () => {
    const text = formatMediaSourceReport({
        levels: [5],
        totalKanji: 79,
        imageAvailableCount: 20,
        animationAvailableCount: 10,
        trueAnimationAvailableCount: 6,
        audioAvailableCount: 5,
        audioEnabled: true,
        gapSummary: {
            missing_stroke_order: 3,
            image_only: 4,
            animation_only: 5,
            audio_only: 2,
            image_and_audio: 1,
            animation_and_audio: 6,
            missing_all: 7,
            mixed: 0,
        },
        imageSourceDir: "C:/repo/data/media_sources/stroke-order/images",
        animationSourceDir: "C:/repo/data/media_sources/stroke-order/animations",
        audioSourceDir: "C:/repo/data/media_sources/audio",
        sourceDirectoriesExist: {
            image: true,
            animation: true,
            audio: false,
        },
        rows: [{
            kanji: "日",
            level: 5,
            gapType: "missing_all",
            hasImage: false,
            hasAnimation: false,
            hasAudio: false,
            preferredFileNames: {
                image: ["日.png", "日.webp", "日-bw.png", "日-bw.webp"],
                animation: ["日-order.gif", "日-order.webp"],
                audio: ["日.mp3", "日.wav"],
            },
        }],
        truncated: false,
        totalMissingRows: 1,
    });

    assert.match(text, /Local Media Source Report/);
    assert.match(text, /Source image coverage: 20\/79/);
    assert.match(text, /Gap summary:/);
    assert.match(text, /Missing animation only: 5/);
    assert.match(text, /Missing all media: 7/);
    assert.match(text, /Audio: C:\/repo\/data\/media_sources\/audio \(missing directory\)/);
    assert.match(text, /- 日 \(N5, all media\)/);
    assert.match(text, /Image: 日\.png, 日\.webp, 日-bw\.png, 日-bw\.webp/);
    assert.match(text, /Animation: 日-order\.gif, 日-order\.webp/);
    assert.match(text, /Audio: 日\.mp3, 日\.wav/);
    assert.match(text, /rerun this report before `npm run media:sync`/);
});

test("formatMediaSourceReport hides audio details when audio is disabled", () => {
    const text = formatMediaSourceReport({
        levels: [5],
        totalKanji: 79,
        imageAvailableCount: 20,
        animationAvailableCount: 10,
        trueAnimationAvailableCount: 7,
        audioAvailableCount: 0,
        audioEnabled: false,
        gapSummary: {
            missing_stroke_order: 4,
            image_only: 2,
            animation_only: 3,
            audio_only: 0,
            image_and_audio: 0,
            animation_and_audio: 0,
            missing_all: 0,
            mixed: 0,
        },
        imageSourceDir: "C:/repo/data/media_sources/stroke-order/images",
        animationSourceDir: "C:/repo/data/media_sources/stroke-order/animations",
        audioSourceDir: "C:/repo/data/media_sources/audio",
        sourceDirectoriesExist: { image: true, animation: true, audio: false },
        rows: [{
            kanji: "日",
            level: 5,
            gapType: "animation_only",
            hasImage: true,
            hasAnimation: false,
            hasAudio: false,
            preferredFileNames: { image: [], animation: ["日-order.gif"], audio: ["日.mp3"] },
        }],
        truncated: false,
        totalMissingRows: 1,
    });

    assert.doesNotMatch(text, /Source audio coverage/);
    assert.match(text, /Gap summary:/);
    assert.match(text, /Missing both stroke-order files: 4/);
    assert.doesNotMatch(text, /Audio: C:\/repo\/data\/media_sources\/audio/);
    assert.doesNotMatch(text, /Audio: 日\.mp3/);
    assert.match(text, /- 日 \(N5, animation only\)/);
});

