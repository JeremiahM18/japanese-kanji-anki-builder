const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

const { resolvePythonCommand } = require("../src/services/toolchainService");

function writeFile(filePath, text) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, "utf8");
}

function sha256(filePath) {
    return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runBuildApkg(python, outDir) {
    const result = spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            path.join(process.cwd(), "scripts", "buildApkg.py"),
            "--out-dir",
            outDir,
            "--levels=5",
            "--json",
        ],
        {
            cwd: process.cwd(),
            encoding: "utf8",
        }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || "buildApkg.py failed");
    return JSON.parse(result.stdout);
}

const python = resolvePythonCommand();

test("buildApkg.py produces byte-stable APKG output for unchanged package inputs", {
    skip: python ? false : "Python is unavailable",
}, () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-apkg-determinism-"));

    try {
        const outDir = path.join(tempRoot, "out", "build");
        const packageRoot = path.join(outDir, "package");
        const fixtureTsv = fs.readFileSync(
            path.join(process.cwd(), "examples", "n5-mini", "sample-kanji-output.tsv"),
            "utf8"
        );
        writeFile(path.join(packageRoot, "exports", "jlpt-n5.tsv"), fixtureTsv);
        writeFile(path.join(packageRoot, "media", "sample.txt"), "stable media\n");

        const first = runBuildApkg(python, outDir);
        const firstHash = sha256(first.filePath);
        const second = runBuildApkg(python, outDir);
        const secondHash = sha256(second.filePath);

        assert.equal(firstHash, secondHash);
        assert.equal(first.noteCount, 1);
        assert.equal(first.mediaFileCount, 1);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
