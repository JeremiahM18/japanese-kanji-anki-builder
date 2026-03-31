const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { createSmokeWorkspace, runCiSmoke } = require("../src/services/ciSmokeService");

test("createSmokeWorkspace seeds a deterministic CI fixture workspace", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-ci-smoke-fixture-"));

    try {
        const workspace = createSmokeWorkspace(tempRoot);

        assert.equal(workspace.config.exportConcurrency, 2);
        assert.equal(fs.existsSync(workspace.config.jlptJsonPath), true);
        assert.equal(fs.existsSync(workspace.config.kradfilePath), true);
        assert.equal(fs.existsSync(path.join(workspace.kanjiBuildOutDir)), false);

        const manifestPath = path.join(
            workspace.config.mediaRootDir,
            "kanji",
            "65",
            "65E5_日",
            "manifest.json"
        );
        assert.equal(fs.existsSync(manifestPath), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("runCiSmoke produces kanji and word deck smoke artifacts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-ci-smoke-run-"));

    try {
        const summary = await runCiSmoke({
            rootDir: tempRoot,
            keepTempDir: true,
        });

        assert.equal(summary.rootDir, tempRoot);
        assert.equal(summary.kanjiBuild.exports.length, 1);
        assert.equal(summary.wordBuild.rows, 1);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv")), true);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "word-build", "exports", "jlpt-n5-words.tsv")), true);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "build", "package", "IMPORT.txt")), true);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "word-build", "package", "IMPORT.txt")), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
