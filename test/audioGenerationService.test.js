const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    formatVoicevoxGenerationSummary,
    generateVoicevoxAudioForKanjiList,
    normalizeKanaReading,
    selectPreferredAudioReading,
} = require("../src/services/audioGenerationService");

function makeTempDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "voicevox-audio-generation-test-"));
}

function cleanupTempDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

test("normalizeKanaReading converts katakana and strips dictionary punctuation", () => {
    assert.equal(normalizeKanaReading("ニチ"), "にち");
    assert.equal(normalizeKanaReading("-あ.がる"), "あがる");
    assert.equal(normalizeKanaReading("ひと.つ"), "ひとつ");
});

test("selectPreferredAudioReading prefers the inferred best-word pronunciation", () => {
    const selected = selectPreferredAudioReading({
        inferenceResult: {
            bestWord: { pron: "にほん" },
        },
        kanjiInfo: {
            kun_readings: ["ひ"],
            on_readings: ["ニチ"],
        },
    });

    assert.equal(selected.text, "にほん");
    assert.equal(selected.source, "best-word");
});

test("selectPreferredAudioReading falls back to normalized kunyomi and onyomi", () => {
    const kunSelected = selectPreferredAudioReading({
        inferenceResult: { bestWord: null },
        kanjiInfo: {
            kun_readings: ["-あ.がる"],
            on_readings: ["ジョウ"],
        },
    });
    assert.equal(kunSelected.text, "あがる");
    assert.equal(kunSelected.source, "kun-reading");

    const onSelected = selectPreferredAudioReading({
        inferenceResult: { bestWord: null },
        kanjiInfo: {
            kun_readings: [],
            on_readings: ["ガク"],
        },
    });
    assert.equal(onSelected.text, "がく");
    assert.equal(onSelected.source, "on-reading");
});

test("generateVoicevoxAudioForKanjiList writes wav files with bounded concurrency", async () => {
    const rootDir = makeTempDir();

    try {
        const summary = await generateVoicevoxAudioForKanjiList({
            kanjiList: ["日", "学"],
            config: {
                audioSourceDir: path.join(rootDir, "audio"),
                exportConcurrency: 2,
                kanjiApiBaseUrl: "https://kanjiapi.dev",
                cacheDir: path.join(rootDir, "cache"),
                fetchTimeoutMs: 1000,
                sentenceCorpusPath: path.join(rootDir, "sentence.json"),
                curatedStudyDataPath: path.join(rootDir, "curated.json"),
                voicevoxEngineUrl: "http://127.0.0.1:50021",
            },
            speakerId: 1,
            concurrency: 2,
            sentenceCorpus: [],
            curatedStudyData: {},
            kanjiApiClient: {
                async getKanji(kanji) {
                    return kanji === "日"
                        ? { kun_readings: ["ひ"], on_readings: ["ニチ"] }
                        : { kun_readings: ["まな.ぶ"], on_readings: ["ガク"] };
                },
                async getWords(kanji) {
                    return kanji === "日"
                        ? [{ variants: [{ written: "日本", pronounced: "にほん" }], meanings: [{ glosses: ["Japan"] }] }]
                        : [{ variants: [{ written: "学校", pronounced: "がっこう" }], meanings: [{ glosses: ["school"] }] }];
                },
            },
            inferenceEngine: {
                inferKanjiStudyData({ kanji }) {
                    return kanji === "日"
                        ? { bestWord: { written: "日本", pron: "にほん" } }
                        : { bestWord: { written: "学校", pron: "がっこう" } };
                },
            },
            voicevoxClient: {
                async synthesize({ text, speakerId }) {
                    return Buffer.from(`${speakerId}:${text}`);
                },
            },
        });

        assert.equal(summary.generated, 2);
        assert.equal(summary.failed, 0);
        assert.equal(fs.existsSync(path.join(rootDir, "audio", "日.wav")), true);
        assert.equal(fs.readFileSync(path.join(rootDir, "audio", "日.wav"), "utf-8"), "1:にほん");
        assert.equal(fs.readFileSync(path.join(rootDir, "audio", "学.wav"), "utf-8"), "1:がっこう");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("formatVoicevoxGenerationSummary renders a readable generation report", () => {
    const text = formatVoicevoxGenerationSummary({
        totalKanji: 2,
        generated: 1,
        skippedExisting: 1,
        failed: 0,
        results: [
            { kanji: "日", status: "generated", reading: "にほん", readingSource: "best-word" },
            { kanji: "学", status: "skipped" },
        ],
    }, {
        speakerId: 1,
        audioSourceDir: "data/media_sources/audio",
    });

    assert.match(text, /Speaker ID: 1/);
    assert.match(text, /Generated: 1/);
    assert.match(text, /日: にほん \(best-word\)/);
});
