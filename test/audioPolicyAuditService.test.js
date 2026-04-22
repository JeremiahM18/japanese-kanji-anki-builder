const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildAudioPolicyAuditReport } = require("../src/services/audioPolicyAuditService");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "audio-policy-audit-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeManifest(rootDir, kanji, audioAssets) {
    const code = kanji.codePointAt(0).toString(16).toUpperCase();
    const mediaId = `${code}_${kanji}`;
    const manifestPath = path.join(rootDir, "kanji", code.slice(0, 2), mediaId, "manifest.json");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify({
        kanji,
        version: 1,
        updatedAt: "2026-04-22T00:00:00.000Z",
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: audioAssets,
        },
    }, null, 2), "utf-8");
}

test("buildAudioPolicyAuditReport passes cleanly for policy-compliant VOICEVOX Nemo audio", () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", [{
            kind: "audio",
            path: "audio/65E5_日-kanji-reading-日.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "日",
            reading: "にち",
            voice: "VOICEVOX Nemo / Calm",
            locale: "ja-JP",
        }]);

        const report = buildAudioPolicyAuditReport({
            mediaRootDir: rootDir,
            audioSourcePolicy: loadAudioSourcePolicy(),
            remoteAudioBaseUrl: null,
        });

        assert.equal(report.valid, true);
        assert.equal(report.totalAudioAssets, 1);
        assert.deepEqual(report.sourceCounts, { "voicevox-nemo": 1 });
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildAudioPolicyAuditReport flags disallowed sources missing voice metadata and remote audio config", () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", [{
            kind: "audio",
            path: "audio/65E5_日-kanji-reading-日.mp3",
            mimeType: "audio/mpeg",
            source: "local-filesystem",
            category: "kanji-reading",
            text: "日",
            locale: "ja-JP",
        }]);

        const report = buildAudioPolicyAuditReport({
            mediaRootDir: rootDir,
            audioSourcePolicy: loadAudioSourcePolicy(),
            remoteAudioBaseUrl: "https://media.example.com/audio/",
        });

        assert.equal(report.valid, false);
        assert.equal(report.remoteAudioViolation, true);
        assert.equal(report.violatingAssets.length, 1);
        assert.deepEqual(report.violatingAssets[0].violations, ["disallowed-source", "missing-voice"]);
    } finally {
        cleanupTempDir(rootDir);
    }
});
