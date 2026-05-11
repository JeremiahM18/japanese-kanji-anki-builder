const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildOcrIntakeReport,
    collectInputFiles,
    parseArgs,
} = require("../scripts/reportJlptKanjiSourceOcrIntake");

test("reportJlptKanjiSourceOcrIntake parseArgs supports root, level dirs, json, and strict", () => {
    const result = parseArgs([
        "--root=downloads/private/source",
        "--level-dirs=n2,n3,n1",
        "--json",
        "--strict",
    ]);

    assert.equal(result.root, "downloads/private/source");
    assert.deepEqual(result.levelDirs, ["n2", "n3", "n1"]);
    assert.equal(result.json, true);
    assert.equal(result.strict, true);
});

test("collectInputFiles lists accepted private scan extensions by level directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-ocr-intake-test-"));

    try {
        fs.mkdirSync(path.join(root, "n2"), { recursive: true });
        fs.mkdirSync(path.join(root, "n3"), { recursive: true });
        fs.writeFileSync(path.join(root, "n2", "n2-booklet-p001.jpg"), "");
        fs.writeFileSync(path.join(root, "n3", "n3-booklet-p001.pdf"), "");
        fs.writeFileSync(path.join(root, "n3", "notes.txt"), "");

        const files = collectInputFiles({ rootDir: root, levelDirs: ["n2", "n3"] });

        assert.deepEqual(files.map((entry) => path.basename(entry.file)), [
            "n2-booklet-p001.jpg",
            "n3-booklet-p001.pdf",
        ]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("buildOcrIntakeReport reports ready when private input and OCR engine are available", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "source-ocr-intake-ready-test-"));

    try {
        fs.mkdirSync(path.join(root, "n2"), { recursive: true });
        fs.writeFileSync(path.join(root, "n2", "n2-booklet-p001.png"), "");

        const report = buildOcrIntakeReport({
            rootDir: root,
            levelDirs: ["n2"],
            commandRunner(command) {
                if (command === "tesseract") {
                    return { status: 0, stdout: "tesseract 5.0.0\n", stderr: "" };
                }
                return { error: new Error("missing"), status: null, stdout: "", stderr: "" };
            },
        });

        assert.equal(report.status, "ready");
        assert.equal(report.blockers.length, 0);
        assert.equal(report.inputFiles.length, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
