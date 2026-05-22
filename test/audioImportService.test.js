const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    classifyAudioFile,
    importAudioDirectory,
    listFilesRecursiveWithSkipped,
} = require("../src/services/audioImportService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "audio-import-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("classifyAudioFile recognizes accepted kanji audio names", () => {
    const audioLookup = new Map([["日", "日"], ["本", "本"]]);

    assert.deepEqual(
        classifyAudioFile("C:/tmp/日.mp3", { audioLookup }),
        { kind: "audio", kanji: "日" }
    );
    assert.equal(classifyAudioFile("C:/tmp/ignored.txt", { audioLookup }), null);
    assert.equal(classifyAudioFile("C:/tmp/unknown.mp3", { audioLookup }), null);
});

test("importAudioDirectory imports recognized audio files and skips unsupported ones", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const audioDestinationDir = path.join(rootDir, "audio");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "日.mp3"), "mp3", "utf-8");
        fs.writeFileSync(path.join(inputDir, "本.wav"), "wav", "utf-8");
        fs.writeFileSync(path.join(inputDir, "notes.txt"), "ignored", "utf-8");

        const summary = await importAudioDirectory({
            inputDir,
            kanjiList: ["日", "本", "学"],
            audioDestinationDir,
        });

        assert.equal(summary.scannedFiles, 3);
        assert.equal(summary.importedAudio, 2);
        assert.equal(summary.skippedFiles, 1);
        assert.equal(fs.existsSync(path.join(audioDestinationDir, "日.mp3")), true);
        assert.equal(fs.existsSync(path.join(audioDestinationDir, "本.wav")), true);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("listFilesRecursiveWithSkipped records symlinks without following them", () => {
    const originalExistsSync = fs.existsSync;
    const originalReaddirSync = fs.readdirSync;

    try {
        fs.existsSync = () => true;
        fs.readdirSync = () => [
            {
                name: "日.mp3",
                isDirectory: () => false,
                isFile: () => false,
                isSymbolicLink: () => true,
            },
            {
                name: "本.mp3",
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
            },
        ];

        const scan = listFilesRecursiveWithSkipped("input");

        assert.deepEqual(scan.files, [path.join("input", "本.mp3")]);
        assert.deepEqual(scan.skipped, [{ filePath: path.join("input", "日.mp3"), reason: "symbolic-link" }]);
    } finally {
        fs.existsSync = originalExistsSync;
        fs.readdirSync = originalReaddirSync;
    }
});

test("importAudioDirectory reports unchanged files when rerun", async () => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const audioDestinationDir = path.join(rootDir, "audio");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(path.join(inputDir, "日.mp3"), "mp3", "utf-8");

        await importAudioDirectory({
            inputDir,
            kanjiList: ["日"],
            audioDestinationDir,
        });

        const secondRun = await importAudioDirectory({
            inputDir,
            kanjiList: ["日"],
            audioDestinationDir,
        });

        assert.equal(secondRun.unchangedFiles, 1);
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("importAudioDirectory reports symbolic links as unsafe skipped entries", async (t) => {
    const rootDir = makeTempDir();

    try {
        const inputDir = path.join(rootDir, "input");
        const audioDestinationDir = path.join(rootDir, "audio");
        const sourcePath = path.join(rootDir, "source.mp3");
        const linkPath = path.join(inputDir, "日.mp3");
        fs.mkdirSync(inputDir, { recursive: true });
        fs.writeFileSync(sourcePath, "mp3", "utf-8");
        try {
            fs.symlinkSync(sourcePath, linkPath);
        } catch (error) {
            if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) {
                t.skip(`filesystem does not allow file symlink creation: ${error.code}`);
                return;
            }
            throw error;
        }

        const summary = await importAudioDirectory({
            inputDir,
            kanjiList: ["日"],
            audioDestinationDir,
        });

        assert.equal(summary.scannedFiles, 0);
        assert.equal(summary.importedAudio, 0);
        assert.equal(summary.skippedFiles, 1);
        assert.equal(summary.skippedUnsafeFiles, 1);
        assert.deepEqual(summary.skipped.map((entry) => entry.reason), ["symbolic-link"]);
        assert.equal(fs.existsSync(path.join(audioDestinationDir, "日.mp3")), false);
    } finally {
        cleanupTempDir(rootDir);
    }
});
