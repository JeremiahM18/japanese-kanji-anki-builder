const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { buildAudioReviewReport, formatAudioReviewReport } = require("../src/services/audioReviewService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "audio-review-test-"));
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

test("buildAudioReviewReport classifies ready, missing, mismatch, and policy issue rows", async () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", [{
            kind: "audio",
            path: "audio/65E5_日-kanji-reading-日-ひ.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "日",
            reading: "ひ",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
        }]);
        writeManifest(rootDir, "月", [{
            kind: "audio",
            path: "audio/6708_月-kanji-reading-月-こんげつ.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "月",
            reading: "こんげつ",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
        }]);
        writeManifest(rootDir, "火", [{
            kind: "audio",
            path: "audio/706B_火-kanji-reading-火-ひ.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "火",
            reading: "ひ",
            voice: "男声1 / ノーマル",
            locale: "ja-JP",
        }]);

        const report = await buildAudioReviewReport({
            jlptOnlyJson: {
                日: { jlpt: 5 },
                月: { jlpt: 5 },
                火: { jlpt: 5 },
                水: { jlpt: 5 },
            },
            curatedStudyData: {
                日: { displayWord: { written: "日", pron: "ひ" } },
                月: { displayWord: { written: "月", pron: "つき" } },
                火: { displayWord: { written: "火", pron: "ひ" } },
                水: { displayWord: { written: "水", pron: "みず" } },
            },
            mediaRootDir: rootDir,
            audioSourcePolicy: loadAudioSourcePolicy(),
            levels: [5],
        });

        assert.equal(report.summary.totalKanji, 4);
        assert.equal(report.summary.readyToReview, 1);
        assert.equal(report.summary.readingMismatch, 1);
        assert.equal(report.summary.policyMismatch, 1);
        assert.equal(report.summary.missingAudio, 1);
        assert.equal(report.rows[0].kanji, "火");
        assert.equal(report.rows[0].status, "policy_mismatch");
        assert.equal(report.rows[1].kanji, "月");
        assert.equal(report.rows[1].status, "reading_mismatch");
        assert.equal(report.rows[2].kanji, "水");
        assert.equal(report.rows[2].status, "missing_audio");
        assert.equal(report.rows[3].kanji, "日");
        assert.equal(report.rows[3].status, "ready_to_review");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildAudioReviewReport marks audio without curated reading intent as missing expected reading", async () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "学", [{
            kind: "audio",
            path: "audio/5B66_学-kanji-reading-学-がく.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "学",
            reading: "がく",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
        }]);

        const report = await buildAudioReviewReport({
            jlptOnlyJson: {
                学: { jlpt: 4 },
            },
            curatedStudyData: {
                学: { displayWord: { written: "学" } },
            },
            mediaRootDir: rootDir,
            audioSourcePolicy: loadAudioSourcePolicy(),
            levels: [4],
        });

        assert.equal(report.summary.missingExpectedReading, 1);
        assert.equal(report.rows[0].status, "missing_expected_reading");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("buildAudioReviewReport falls back to the built kanji export reading when curated display pronunciation is absent", async () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "休", [{
            kind: "audio",
            path: "audio/4F11_休-kanji-reading-休-やすみ.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "休",
            reading: "やすみ",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
        }]);

        const kanjiTsv = [
            "Kanji\tDisplayWord\tMeaningJP\tPrimaryReading",
            "休\t休\t休 （やすみ） ／ rest / holiday\tやすみ",
        ].join("\n");

        const report = await buildAudioReviewReport({
            jlptOnlyJson: {
                休: { jlpt: 5 },
            },
            curatedStudyData: {
                休: { displayWord: { written: "休" } },
            },
            kanjiTsv,
            mediaRootDir: rootDir,
            audioSourcePolicy: loadAudioSourcePolicy(),
            levels: [5],
        });

        assert.equal(report.summary.readyToReview, 1);
        assert.equal(report.summary.missingExpectedReading, 0);
        assert.equal(report.rows[0].status, "ready_to_review");
        assert.equal(report.rows[0].expectedReading, "やすみ");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatAudioReviewReport renders a useful listening checklist", async () => {
    const rootDir = makeTempDir();

    try {
        writeManifest(rootDir, "日", [{
            kind: "audio",
            path: "audio/65E5_日-kanji-reading-日-ひ.wav",
            mimeType: "audio/wav",
            source: "voicevox-nemo",
            category: "kanji-reading",
            text: "日",
            reading: "ひ",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
        }]);

        const policy = loadAudioSourcePolicy();
        const report = await buildAudioReviewReport({
            jlptOnlyJson: {
                日: { jlpt: 5 },
            },
            curatedStudyData: {
                日: { displayWord: { written: "日", pron: "ひ" } },
            },
            mediaRootDir: rootDir,
            audioSourcePolicy: policy,
            levels: [5],
        });

        const text = formatAudioReviewReport(report, policy);
        assert.match(text, /Ready to review: 1/);
        assert.match(text, /日 \(N5\): ready_to_review/);
        assert.match(text, /Expected reading: ひ/);
        assert.match(text, /Voice: 女声1 \/ ノーマル/);
    } finally {
        cleanupTempDir(rootDir);
    }
});
