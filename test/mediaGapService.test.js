const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildAudioFilePlan,
    buildAnimationFilePlan,
    buildImageFilePlan,
    buildMediaGapReport,
    formatMediaGapReport,
    parseLevelsArgument,
} = require("../src/services/mediaGapService");
const { createEmptyMediaManifest, writeManifest } = require("../src/services/mediaStore");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "media-gap-service-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("parseLevelsArgument normalizes comma-separated levels", () => {
    assert.deepEqual(parseLevelsArgument("5,4,5,2"), [5, 4, 2]);
});

test("file plans expose practical preferred filenames", () => {
    assert.deepEqual(buildImageFilePlan("日").preferredFileNames, ["日.png", "日.webp", "日.jpg", "日.jpeg"]);
    assert.deepEqual(buildAnimationFilePlan("日").preferredFileNames, ["日-order.gif", "日-order.webp", "日-order.apng", "日-order.svg"]);
    assert.deepEqual(buildAudioFilePlan("日").preferredFileNames, ["日.mp3", "日.wav", "日.m4a"]);
});

test("buildMediaGapReport reports missing image animation and audio separately", async () => {
    const rootDir = makeTempDir();

    try {
        const mediaRootDir = path.join(rootDir, "media");
        const imageSourceDir = path.join(rootDir, "images");
        const animationSourceDir = path.join(rootDir, "animations");
        const audioSourceDir = path.join(rootDir, "audio");

        fs.mkdirSync(imageSourceDir, { recursive: true });
        fs.mkdirSync(animationSourceDir, { recursive: true });
        fs.mkdirSync(audioSourceDir, { recursive: true });

        const completeManifest = createEmptyMediaManifest("日");
        completeManifest.assets.strokeOrderImage = {
            kind: "image",
            path: "images/65E5_日-stroke-order.png",
            mimeType: "image/png",
            source: "fixture",
            checksum: "image-checksum",
        };
        completeManifest.assets.strokeOrderAnimation = {
            kind: "animation",
            path: "animations/65E5_日-stroke-order.gif",
            mimeType: "image/gif",
            source: "fixture",
            checksum: "animation-checksum",
        };
        completeManifest.assets.audio = [{
            kind: "audio",
            path: "audio/65E5_日-kanji-reading.mp3",
            mimeType: "audio/mpeg",
            source: "fixture",
            checksum: "audio-checksum",
            category: "kanji-reading",
            text: "日",
            locale: "ja-JP",
        }];
        await writeManifest(mediaRootDir, completeManifest);

        const partialManifest = createEmptyMediaManifest("本");
        partialManifest.assets.strokeOrderImage = {
            kind: "image",
            path: "images/672C_本-stroke-order.png",
            mimeType: "image/png",
            source: "fixture",
            checksum: "image-checksum",
        };
        await writeManifest(mediaRootDir, partialManifest);

        const report = await buildMediaGapReport({
            jlptOnlyJson: {
                日: { jlpt: 5 },
                本: { jlpt: 5 },
                学: { jlpt: 4 },
            },
            mediaRootDir,
            strokeOrderImageSourceDir: imageSourceDir,
            strokeOrderAnimationSourceDir: animationSourceDir,
            audioSourceDir,
            levels: [5, 4],
            limit: 10,
        });

        assert.equal(report.totalKanji, 3);
        assert.equal(report.missingImageCount, 1);
        assert.equal(report.missingAnimationCount, 2);
        assert.equal(report.missingAudioCount, 2);
        assert.equal(report.rows.length, 2);
        assert.deepEqual(report.rows.map((row) => row.kanji), ["本", "学"]);
        assert.equal(report.rows[0].missingImage, false);
        assert.equal(report.rows[0].missingAnimation, true);
        assert.equal(report.rows[0].missingAudio, true);
        assert.equal(report.rows[1].missingImage, true);
        assert.equal(report.rows[1].missingAnimation, true);
        assert.equal(report.rows[1].missingAudio, true);
        assert.deepEqual(report.rows[1].plans.audio.preferredFileNames, ["学.mp3", "学.wav", "学.m4a"]);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatMediaGapReport produces a clear acquisition summary", () => {
    const text = formatMediaGapReport({
        levels: [5],
        totalKanji: 80,
        missingImageCount: 80,
        missingAnimationCount: 80,
        missingAudioCount: 80,
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
            missingImage: true,
            missingAnimation: true,
            missingAudio: true,
            plans: {
                image: { preferredFileNames: ["日.png", "日.webp"] },
                animation: { preferredFileNames: ["日-order.gif"] },
                audio: { preferredFileNames: ["日.mp3"] },
            },
        }],
        truncated: false,
        totalMissingRows: 1,
    });

    assert.match(text, /Media Acquisition Plan/);
    assert.match(text, /Target levels: N5/);
    assert.match(text, /Missing stroke-order images: 80/);
    assert.match(text, /Audio: C:\/repo\/data\/media_sources\/audio \(missing directory\)/);
    assert.match(text, /- 日 \(N5\)/);
    assert.match(text, /Image: 日\.png, 日\.webp/);
    assert.match(text, /Animation: 日-order\.gif/);
    assert.match(text, /Audio: 日\.mp3/);
    assert.match(text, /npm run media:sync -- --level=5 --limit=25/);
});
