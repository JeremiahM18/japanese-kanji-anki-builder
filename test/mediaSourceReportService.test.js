const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildMediaSourceReport,
    formatMediaSourceReport,
    hasAnyCandidate,
    parseLevelsArgument,
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
        assert.equal(report.audioAvailableCount, 1);
        assert.deepEqual(report.rows.map((row) => row.kanji), ["日", "本", "学"]);
        assert.equal(report.rows[0].hasImage, true);
        assert.equal(report.rows[0].hasAnimation, true);
        assert.equal(report.rows[0].hasAudio, false);
        assert.equal(report.rows[1].hasAudio, true);
        assert.equal(report.rows[1].hasImage, false);
        assert.equal(report.rows[2].hasImage, false);
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
        audioAvailableCount: 5,
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
            hasImage: true,
            hasAnimation: false,
            hasAudio: false,
            preferredFileNames: {
                image: [],
                animation: ["日-order.gif", "日-order.webp"],
                audio: ["日.mp3", "日.wav"],
            },
        }],
        truncated: false,
        totalMissingRows: 1,
    });

    assert.match(text, /Local Media Source Report/);
    assert.match(text, /Source image coverage: 20\/79/);
    assert.match(text, /Audio: C:\/repo\/data\/media_sources\/audio \(missing directory\)/);
    assert.match(text, /- 日 \(N5\)/);
    assert.match(text, /Animation: 日-order\.gif, 日-order\.webp/);
    assert.match(text, /Audio: 日\.mp3, 日\.wav/);
    assert.match(text, /rerun this report before `npm run media:sync`/);
});
