const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiLookup,
    buildKanjiVgDestinationFileName,
    classifyKanjiVgFile,
    importKanjiVgDirectory,
} = require("../src/services/kanjiVgImportService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "kanjivg-import-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("classifyKanjiVgFile recognizes official codepoint SVG filenames", () => {
    const kanjiLookup = buildKanjiLookup(["今", "日"]);

    assert.deepEqual(
        classifyKanjiVgFile("C:/tmp/04eca.svg", { kanjiLookup }),
        {
            kanji: "今",
            destinationFileName: "今 - U+04ECA- KanjiVG stroke order.svg",
        }
    );
    assert.deepEqual(
        classifyKanjiVgFile("C:/tmp/65e5.svg", { kanjiLookup }),
        {
            kanji: "日",
            destinationFileName: "日 - U+065E5- KanjiVG stroke order.svg",
        }
    );
    assert.equal(classifyKanjiVgFile("C:/tmp/readme.txt", { kanjiLookup }), null);
    assert.equal(classifyKanjiVgFile("C:/tmp/0fffff.svg", { kanjiLookup }), null);
    assert.equal(buildKanjiVgDestinationFileName("今"), "今 - U+04ECA- KanjiVG stroke order.svg");
});

test("importKanjiVgDirectory imports recognized SVGs into canonical filenames", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const imageDestinationDir = path.join(rootDir, "images");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "04eca.svg"), "svg", "utf-8");
        fs.writeFileSync(path.join(inputDir, "ignore.txt"), "ignored", "utf-8");

        const summary = await importKanjiVgDirectory({
            inputDir,
            kanjiList: ["今", "日"],
            imageDestinationDir,
        });

        assert.equal(summary.scannedFiles, 2);
        assert.equal(summary.importedImages, 1);
        assert.equal(summary.skippedFiles, 1);
        assert.equal(
            fs.existsSync(path.join(imageDestinationDir, "今 - U+04ECA- KanjiVG stroke order.svg")),
            true
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("importKanjiVgDirectory reports unchanged files when rerun", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const imageDestinationDir = path.join(rootDir, "images");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "04eca.svg"), "svg", "utf-8");

        await importKanjiVgDirectory({
            inputDir,
            kanjiList: ["今"],
            imageDestinationDir,
        });

        const secondRun = await importKanjiVgDirectory({
            inputDir,
            kanjiList: ["今"],
            imageDestinationDir,
        });

        assert.equal(secondRun.unchangedFiles, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});
