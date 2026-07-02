const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { buildWordExampleAudioReviewReport } = require("../src/services/wordExampleAudioReviewService");
const { buildWordExampleAudioIdentityHash } = require("../src/services/wordAudioService");

test("buildWordExampleAudioReviewReport validates exact managed example-sentence audio", async () => {
    const identityHash = buildWordExampleAudioIdentityHash({
        written: "日本",
        reading: "にほん",
        exampleText: "日本に行きます。",
        exampleReading: "にほんにいきます。",
    });
    const report = await buildWordExampleAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tExampleAudio\tNotes",
            `日本\tにほん\t[sound:65E5_日-word-reading-日本-にほん.wav]\tJapan\tJLPT N5\tJLPT core + reading coverage\t日\t日: に\t\t日本に行きます。 ／ にほんにいきます。 ／ I go to Japan.\t[sound:65E5_日-word-example-sentence-${identityHash}.wav]\t`,
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return {
                    assets: {
                        audio: [{
                            path: `audio/65E5_日-word-example-sentence-${identityHash}.wav`,
                            source: "voicevox-nemo",
                            category: "word-example-sentence",
                            text: "日本に行きます。",
                            reading: "にほんにいきます。",
                            identityHash,
                            voice: "女声1 / ノーマル",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.totalExamples, 1);
    assert.equal(report.summary.readyToReview, 1);
    assert.equal(report.summary.missingAudio, 0);
    assert.equal(report.rows[0].status, "ready_to_review");
    assert.equal(report.rows[0].category, "word-example-sentence");
});

test("buildWordExampleAudioReviewReport rejects same-sentence audio with the wrong word identity hash", async () => {
    const report = await buildWordExampleAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tExampleAudio\tNotes",
            "日曜日\tにちようび\t[sound:65E5_日-word-reading-日曜日-にちようび.wav]\tSunday\tJLPT N5\tJLPT core + reading coverage\t日\t日: に\t\t日曜日は家で休みます。 ／ にちようびはいえでやすみます。 ／ I rest at home on Sunday.\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return {
                    assets: {
                        audio: [{
                            path: "audio/4F11_休-word-example-sentence-0ac4c6625f96bfc1.wav",
                            source: "voicevox-nemo",
                            category: "word-example-sentence",
                            text: "日曜日は家で休みます。",
                            reading: "にちようびはいえでやすみます。",
                            identityHash: "0ac4c6625f96bfc1",
                            voice: "女声1 / ノーマル",
                            locale: "ja-JP",
                        }],
                    },
                };
            },
        },
        mediaRootDir: "C:/repo/data/media",
    });

    assert.equal(report.summary.readyToReview, 0);
    assert.equal(report.summary.missingAudio, 1);
    assert.equal(report.rows[0].status, "missing_audio");
});

test("buildWordExampleAudioReviewReport does not treat word-reading audio as example-sentence audio", async () => {
    const report = await buildWordExampleAudioReviewReport({
        wordTsv: [
            "Word\tReading\tAudio\tMeaning\tJLPTLevel\tCoverageRole\tFocusKanji\tCoversReading\tKanjiBreakdown\tExampleSentence\tExampleAudio\tNotes",
            "日本\tにほん\t[sound:65E5_日-word-reading-日本-にほん.wav]\tJapan\tJLPT N5\tJLPT core + reading coverage\t日\t日: に\t\t日本に行きます。 ／ にほんにいきます。 ／ I go to Japan.\t\t",
        ].join("\n"),
        audioSourcePolicy: loadAudioSourcePolicy(),
        audioService: {
            async getManifest() {
                return {
                    assets: {
                        audio: [{
                            path: "audio/65E5_日-word-reading-日本-にほん.wav",
                            source: "voicevox-nemo",
                            category: "word-reading",
                            text: "日本",
                            reading: "にほん",
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
