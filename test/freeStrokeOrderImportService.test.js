const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    classifyStrokeOrderFile,
    importFreeStrokeOrderDirectory,
} = require("../src/services/freeStrokeOrderImportService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "free-stroke-import-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("classifyStrokeOrderFile recognizes Wikimedia-style image and animation names", () => {
    const imageLookup = new Map([["日-bw", "日"]]);
    const animationLookup = new Map([["日-order", "日"]]);

    assert.deepEqual(
        classifyStrokeOrderFile("C:/tmp/日-bw.png", { imageLookup, animationLookup }),
        { kind: "image", kanji: "日" }
    );
    assert.deepEqual(
        classifyStrokeOrderFile("C:/tmp/日-order.gif", { imageLookup, animationLookup }),
        { kind: "animation", kanji: "日" }
    );
    assert.equal(classifyStrokeOrderFile("C:/tmp/ignored.txt", { imageLookup, animationLookup }), null);
});

test("importFreeStrokeOrderDirectory imports recognized files and skips unsupported ones", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const imageDestinationDir = path.join(rootDir, "images");
        const animationDestinationDir = path.join(rootDir, "animations");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "日-bw.png"), "png", "utf-8");
        fs.writeFileSync(path.join(inputDir, "日-order.gif"), "gif", "utf-8");
        fs.writeFileSync(path.join(inputDir, "notes.txt"), "ignored", "utf-8");

        const summary = await importFreeStrokeOrderDirectory({
            inputDir,
            kanjiList: ["日", "本"],
            imageDestinationDir,
            animationDestinationDir,
        });

        assert.equal(summary.scannedFiles, 3);
        assert.equal(summary.importedImages, 1);
        assert.equal(summary.importedAnimations, 1);
        assert.equal(summary.skippedFiles, 1);
        assert.equal(fs.existsSync(path.join(imageDestinationDir, "日-bw.png")), true);
        assert.equal(fs.existsSync(path.join(animationDestinationDir, "日-order.gif")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("importFreeStrokeOrderDirectory reports unchanged files when rerun", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const imageDestinationDir = path.join(rootDir, "images");
        const animationDestinationDir = path.join(rootDir, "animations");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "日-bw.png"), "png", "utf-8");

        await importFreeStrokeOrderDirectory({
            inputDir,
            kanjiList: ["日"],
            imageDestinationDir,
            animationDestinationDir,
        });

        const secondRun = await importFreeStrokeOrderDirectory({
            inputDir,
            kanjiList: ["日"],
            imageDestinationDir,
            animationDestinationDir,
        });

        assert.equal(secondRun.unchangedFiles, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});
