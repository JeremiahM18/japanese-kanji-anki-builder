const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { runReleaseGate } = require("../src/services/releaseGateService");

test("runReleaseGate verifies deterministic artifact contracts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-release-gate-"));

    try {
        const report = await runReleaseGate({
            rootDir: tempRoot,
            keepTempDir: true,
        });

        assert.equal(report.smoke.kanjiExports, 1);
        assert.equal(report.smoke.wordRows, 1);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "build", "exports", "jlpt-n5.tsv")), true);
        assert.equal(fs.existsSync(path.join(tempRoot, "out", "word-build", "exports", "jlpt-n5-words.tsv")), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("runReleaseGate fails early when packaging tools are required but unavailable", async () => {
    await assert.rejects(
        () => runReleaseGate({
            requireApkgTools: true,
            buildToolchainStatusFn: () => ({
                runtime: [],
                packaging: [
                    { name: "Python", available: false },
                ],
            }),
        }),
        /Release gate requires packaging tools/
    );
});

test("runReleaseGate fails early when packaging tools are blocked by the current runtime", async () => {
    await assert.rejects(
        () => runReleaseGate({
            requireApkgTools: true,
            buildToolchainStatusFn: () => ({
                runtime: [],
                packaging: [
                    { name: "Python", available: false, blocked: true },
                ],
            }),
        }),
        /blocked in this runtime/
    );
});
