const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { RELEASE_GATE_SCOPE, runReleaseGate } = require("../src/services/releaseGateService");
const { runCiSmoke } = require("../src/services/ciSmokeService");

test("runReleaseGate verifies deterministic artifact contracts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-release-gate-"));

    try {
        const report = await runReleaseGate({
            rootDir: tempRoot,
            keepTempDir: true,
            runCiSmokeFn: (options) => runCiSmoke({
                ...options,
                buildDoctorReportOptions: {
                    buildToolchainStatusFn: () => ({ runtime: [], packaging: [] }),
                },
            }),
        });

        assert.equal(report.smoke.kanjiExports, 1);
        assert.equal(report.smoke.wordRows, 1);
        assert.equal(report.validationScope.type, "smoke-fixture");
        assert.deepEqual(report.validationScope, RELEASE_GATE_SCOPE);
        assert.equal(report.validationScope.doesNotValidate.includes("public product deck readiness"), true);
        assert.equal(report.validationScope.doesNotValidate.includes("level golden review benchmarks"), true);
        assert.equal(report.validationScope.doesNotValidate.includes("level platinum review benchmarks"), true);
        assert.equal(report.validationScope.doesNotValidate.includes("substantive platinum rereview provenance"), true);
        assert.equal(report.validationScope.doesNotValidate.includes("word source-family independence posture"), true);
        assert.equal(report.audioPolicy.valid, true);
        assert.deepEqual(report.audioPolicy.uniqueSources, ["voicevox-nemo"]);
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

test("runReleaseGate fails when the audio policy audit reports violations", async () => {
    await assert.rejects(
        () => runReleaseGate({
            runCiSmokeFn: async () => ({
                rootDir: "C:/temp",
                config: {
                    mediaRootDir: "C:/temp/data/media",
                    remoteAudioBaseUrl: null,
                },
                kanjiBuild: {
                    outDir: "C:/temp/out/build",
                    exports: [{ level: 5 }],
                    package: {
                        rootDir: "C:/temp/out/build/package",
                        exportsDir: "C:/temp/out/build/exports",
                        mediaDir: "C:/temp/out/build/package/media",
                        readmePath: "C:/temp/out/build/package/IMPORT.txt",
                        exportCount: 1,
                        mediaAssetCount: 1,
                        ankiPackage: { skipped: true, skipReason: "test" },
                    },
                },
                wordBuild: {
                    outDir: "C:/temp/out/word-build",
                    rows: 1,
                    package: {
                        rootDir: "C:/temp/out/word-build/package",
                        exportsDir: "C:/temp/out/word-build/exports",
                        mediaDir: "C:/temp/out/word-build/package/media",
                        readmePath: "C:/temp/out/word-build/package/IMPORT.txt",
                        exportCount: 1,
                        mediaAssetCount: 1,
                        ankiPackage: { skipped: true, skipReason: "test" },
                    },
                },
                packageVerification: {},
            }),
            buildAudioPolicyAuditReportFn: () => ({
                valid: false,
                manifestCount: 1,
                totalAudioAssets: 1,
                uniqueSources: ["local-filesystem"],
                mixedReleaseSources: false,
                remoteAudioConfigured: false,
                remoteAudioViolation: false,
                violatingAssets: [{ kanji: "日" }],
            }),
        }),
        /audio policy audit failed/
    );
});

test("runReleaseGate matches blocked packaging tools by name instead of object identity", async () => {
    await assert.rejects(
        () => runReleaseGate({
            requireApkgTools: true,
            buildToolchainStatusFn: () => ({
                runtime: [
                    { name: "Python", available: false, blocked: true },
                ],
                packaging: [
                    { name: "Python", available: false, blocked: true },
                ],
            }),
        }),
        /blocked in this runtime/
    );
});
