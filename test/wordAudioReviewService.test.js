const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildWordAudioReviewReport } = require("../src/services/wordAudioReviewService");
const { findManagedWordAudioAsset } = require("../src/services/wordAudioService");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");

function writeManifest(rootDir, kanji, manifest) {
    const mediaId = `${kanji.codePointAt(0).toString(16).toUpperCase()}_${kanji}`;
    const dir = path.join(rootDir, "kanji", mediaId.slice(0, 2), mediaId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
        kanji,
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: [],
        },
        ...manifest,
    }));
}

test("buildWordAudioReviewReport validates managed word-reading audio against built word rows", async () => {
    const report = await buildWordAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "時間\tじかん\t[sound:6642_時-word-reading-時間-じかん.wav]\ttime\tJLPT N5\tJLPT core + reading coverage\t時\t時: じ\t\t\t",
            "子猫\tこねこ\t[sound:5B50_子-word-reading-子猫-こねこ.wav]\tkitten\tJLPT N5\tReading coverage support\t子\t子: こ\t\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest(kanji) {
                if (kanji === "時") {
                    return {
                        assets: {
                            audio: [{
                                path: "audio/6642_時-word-reading-時間-じかん.wav",
                                source: "voicevox-nemo",
                                category: "word-reading",
                                text: "時間",
                                reading: "じかん",
                                voice: "女声1 / ノーマル",
                                locale: "ja-JP",
                            }],
                        },
                    };
                }
                if (kanji === "子") {
                    return {
                        assets: {
                            audio: [{
                                path: "audio/5B50_子-word-reading-子猫-こねこ.wav",
                                source: "voicevox-nemo",
                                category: "word-reading",
                                text: "子猫",
                                reading: "こねこ",
                                voice: "女声1 / ノーマル",
                                locale: "ja-JP",
                            }],
                        },
                    };
                }
                return null;
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.totalWords, 2);
    assert.equal(report.summary.readyToReview, 2);
    assert.equal(report.summary.missingAudio, 0);
    assert.equal(report.summary.readingMismatch, 0);
    assert.equal(report.rows[0].status, "ready_to_review");
});

test("buildWordAudioReviewReport flags missing managed word-reading audio", async () => {
    const report = await buildWordAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "時間\tじかん\t\ttime\tJLPT N5\tJLPT core + reading coverage\t時\t時: じ\t\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return { assets: { audio: [] } };
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.totalWords, 1);
    assert.equal(report.summary.missingAudio, 1);
    assert.equal(report.rows[0].status, "missing_audio");
});

test("buildWordAudioReviewReport does not treat kanji-reading audio as word audio", async () => {
    const report = await buildWordAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "日\tひ\t\tday\tJLPT N5\tJLPT core + reading coverage\t日\t日: ひ\t\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return {
                    assets: {
                        audio: [{
                            path: "audio/65E5_日-kanji-reading-日-ひ.wav",
                            source: "voicevox-nemo",
                            category: "kanji-reading",
                            text: "日",
                            reading: "ひ",
                            voice: "女声1 / ノーマル",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.missingAudio, 1);
    assert.equal(report.rows[0].status, "missing_audio");
});

test("buildWordAudioReviewReport requires exact word-reading asset identity", async () => {
    const report = await buildWordAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tNotes",
            "下手\tへた\t\tunskillful\tJLPT N5\tReading coverage support\t手\t手: て\t\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return {
                    assets: {
                        audio: [{
                            path: "audio/624B_手-word-reading-手-て.wav",
                            source: "voicevox-nemo",
                            category: "word-reading",
                            text: "手",
                            reading: "て",
                            voice: "女声1 / ノーマル",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.missingAudio, 1);
    assert.equal(report.summary.readingMismatch, 0);
    assert.equal(report.rows[0].status, "missing_audio");
});

test("findManagedWordAudioAsset can recover exact word audio from a non-focus manifest", async () => {
    const mediaRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-audio-"));
    writeManifest(mediaRootDir, "金", {
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: [{
                path: "audio/91D1_金-word-reading-眼鏡-めがね.wav",
                source: "voicevox-nemo",
                category: "word-reading",
                text: "眼鏡",
                reading: "めがね",
                voice: "女声1 / ノーマル",
                locale: "ja-JP",
            }],
        },
    });

    const result = await findManagedWordAudioAsset({
        written: "眼鏡",
        reading: "めがね",
        focusKanji: ["鏡"],
        mediaRootDir,
    });

    assert.equal(result.kanji, "金");
    assert.equal(result.asset.path, "audio/91D1_金-word-reading-眼鏡-めがね.wav");
});
