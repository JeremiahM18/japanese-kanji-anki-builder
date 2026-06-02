const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildKanjiAudioSourceFileName,
    buildWordAudioSourceFileName,
    buildVoicevoxSpeakerLabel,
    formatVoicevoxGenerationSummary,
    generateVoicevoxAudioForWordList,
    generateVoicevoxAudioForKanjiList,
    normalizeKanaReading,
    resolveAudioSourceOutputPath,
    selectPreferredAudioReading,
    writeAudioSourceSidecar,
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

test("selectPreferredAudioReading prefers the exported primary reading", () => {
    const selected = selectPreferredAudioReading({
        inferenceResult: {
            primaryReading: "ひ",
            displayWord: { written: "日", pron: "ひ" },
            bestWord: { pron: "にほん" },
        },
        kanjiInfo: {
            kun_readings: ["ひ"],
            on_readings: ["ニチ"],
        },
    });

    assert.equal(selected.text, "ひ");
    assert.equal(selected.source, "primary-reading");
});

test("selectPreferredAudioReading does not replace primary reading with compound display pronunciation", () => {
    const selected = selectPreferredAudioReading({
        inferenceResult: {
            primaryReading: "ほとけ",
            displayWord: { written: "仏教", pron: "ぶっきょう" },
            bestWord: { written: "仏教", pron: "ぶっきょう" },
        },
        kanjiInfo: {
            kun_readings: ["ほとけ"],
            on_readings: ["ブツ"],
        },
    });

    assert.equal(selected.text, "ほとけ");
    assert.equal(selected.source, "primary-reading");
});

test("selectPreferredAudioReading uses the best word only when it matches the learner-facing display form", () => {
    const selected = selectPreferredAudioReading({
        inferenceResult: {
            displayWord: { written: "日本", pron: "" },
            bestWord: { written: "日本", pron: "にほん" },
        },
        kanjiInfo: {
            kun_readings: ["ひ"],
            on_readings: ["ニチ"],
        },
    });

    assert.equal(selected.text, "にほん");
    assert.equal(selected.source, "best-word-display-match");
});

test("selectPreferredAudioReading falls back to normalized kunyomi and onyomi when the display form is bare kanji", () => {
    const kunSelected = selectPreferredAudioReading({
        inferenceResult: {
            displayWord: { written: "上", pron: "" },
            bestWord: { written: "上手", pron: "じょうず" },
        },
        kanjiInfo: {
            kun_readings: ["-あ.がる"],
            on_readings: ["ジョウ"],
        },
    });
    assert.equal(kunSelected.text, "あがる");
    assert.equal(kunSelected.source, "kun-reading");

    const onSelected = selectPreferredAudioReading({
        inferenceResult: {
            displayWord: { written: "学", pron: "" },
            bestWord: { written: "学校", pron: "がっこう" },
        },
        kanjiInfo: {
            kun_readings: [],
            on_readings: ["ガク"],
        },
    });
    assert.equal(onSelected.text, "がく");
    assert.equal(onSelected.source, "on-reading");
});

test("buildVoicevoxSpeakerLabel resolves the configured speaker style", () => {
    const label = buildVoicevoxSpeakerLabel([
        {
            name: "女声1",
            styles: [{ id: 7, name: "ノーマル" }],
        },
    ], 7);

    assert.equal(label, "女声1 / ノーマル");
});

test("buildWordAudioSourceFileName creates a stable host-word-reading stem", () => {
    assert.equal(
        buildWordAudioSourceFileName({
            hostKanji: "時",
            written: "時間",
            reading: "じかん",
        }),
        "時-時間-じかん.wav"
    );
});

test("audio source output paths are normalized and contained", () => {
    const rootDir = makeTempDir();

    try {
        assert.equal(buildKanjiAudioSourceFileName("日"), "日.wav");
        assert.equal(buildKanjiAudioSourceFileName("../日"), ".._日.wav");
        assert.equal(
            resolveAudioSourceOutputPath(rootDir, "日.wav"),
            path.join(rootDir, "日.wav")
        );
        assert.throws(
            () => resolveAudioSourceOutputPath(rootDir, "../escape.wav"),
            /outside audio source directory/
        );
        assert.throws(
            () => buildKanjiAudioSourceFileName(" / "),
            /empty after normalization/
        );
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("writeAudioSourceSidecar stores provenance next to generated audio", () => {
    const rootDir = makeTempDir();

    try {
        const outputPath = path.join(rootDir, "日.wav");
        fs.writeFileSync(outputPath, "audio");

        writeAudioSourceSidecar({
            outputPath,
            source: "voicevox-nemo",
            voice: "女声1 / ノーマル",
            locale: "ja-JP",
            category: "kanji-reading",
            text: "日",
            reading: "にち",
            notes: "Generated by VOICEVOX",
        });

        const sidecar = JSON.parse(fs.readFileSync(path.join(rootDir, "日.json"), "utf-8"));
        assert.equal(sidecar.source, "voicevox-nemo");
        assert.equal(sidecar.voice, "女声1 / ノーマル");
        assert.equal(sidecar.reading, "にち");
    } finally {
        cleanupTempDir(rootDir);
    }
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
            speakerId: 10005,
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
                        ? {
                            primaryReading: "ひ",
                            displayWord: { written: "日", pron: "ひ" },
                            bestWord: { written: "日本", pron: "にほん" },
                        }
                        : {
                            primaryReading: "まなぶ",
                            displayWord: { written: "学", pron: "" },
                            bestWord: { written: "学校", pron: "がっこう" },
                        };
                },
            },
            voicevoxClient: {
                async listSpeakers() {
                    return [{ name: "女声1", styles: [{ id: 10005, name: "ノーマル" }] }];
                },
                async synthesize({ text, speakerId }) {
                    return Buffer.from(`${speakerId}:${text}`);
                },
            },
        });

        assert.equal(summary.generated, 2);
        assert.equal(summary.failed, 0);
        assert.equal(fs.existsSync(path.join(rootDir, "audio", "日.wav")), true);
        assert.equal(fs.readFileSync(path.join(rootDir, "audio", "日.wav"), "utf-8"), "10005:ひ");
        assert.equal(fs.readFileSync(path.join(rootDir, "audio", "学.wav"), "utf-8"), "10005:まなぶ");
        const sidecar = JSON.parse(fs.readFileSync(path.join(rootDir, "audio", "日.json"), "utf-8"));
        assert.equal(sidecar.source, "voicevox");
        assert.equal(sidecar.voice, "女声1 / ノーマル");
        assert.equal(sidecar.reading, "ひ");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("generateVoicevoxAudioForKanjiList falls back to the policy speaker name when speaker listing is unavailable", async () => {
    const rootDir = makeTempDir();

    try {
        const summary = await generateVoicevoxAudioForKanjiList({
            kanjiList: ["日"],
            config: {
                audioSourceDir: path.join(rootDir, "audio"),
                exportConcurrency: 1,
                kanjiApiBaseUrl: "https://kanjiapi.dev",
                cacheDir: path.join(rootDir, "cache"),
                fetchTimeoutMs: 1000,
                sentenceCorpusPath: path.join(rootDir, "sentence.json"),
                curatedStudyDataPath: path.join(rootDir, "curated.json"),
                voicevoxEngineUrl: "http://127.0.0.1:50021",
            },
            speakerId: 10005,
            fallbackVoiceLabel: "女声1",
            sentenceCorpus: [],
            curatedStudyData: {},
            kanjiApiClient: {
                async getKanji() {
                    return { kun_readings: ["ひ"], on_readings: ["ニチ"] };
                },
                async getWords() {
                    return [{ variants: [{ written: "日本", pronounced: "にほん" }], meanings: [{ glosses: ["Japan"] }] }];
                },
            },
            inferenceEngine: {
                inferKanjiStudyData() {
                    return {
                        displayWord: { written: "日", pron: "ひ" },
                        bestWord: { written: "日本", pron: "にほん" },
                    };
                },
            },
            voicevoxClient: {
                async listSpeakers() {
                    throw new Error("engine unavailable");
                },
                async synthesize({ text, speakerId }) {
                    return Buffer.from(`${speakerId}:${text}`);
                },
            },
        });

        assert.equal(summary.generated, 1);
        const sidecar = JSON.parse(fs.readFileSync(path.join(rootDir, "audio", "日.json"), "utf-8"));
        assert.equal(sidecar.voice, "女声1");
        assert.equal(sidecar.reading, "ひ");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("generateVoicevoxAudioForWordList writes governed word-reading audio sidecars", async () => {
    const rootDir = makeTempDir();

    try {
        const summary = await generateVoicevoxAudioForWordList({
            words: [{
                written: "時間",
                reading: "じかん",
                hostKanji: "時",
            }],
            config: {
                audioSourceDir: path.join(rootDir, "audio"),
                exportConcurrency: 1,
                voicevoxEngineUrl: "http://127.0.0.1:50021",
            },
            speakerId: 10005,
            fallbackVoiceLabel: "女声1",
            voicevoxClient: {
                async listSpeakers() {
                    return [{ name: "女声1", styles: [{ id: 10005, name: "ノーマル" }] }];
                },
                async synthesize({ text, speakerId }) {
                    return Buffer.from(`${speakerId}:${text}`);
                },
            },
        });

        assert.equal(summary.generated, 1);
        assert.equal(summary.failed, 0);
        assert.equal(fs.existsSync(path.join(rootDir, "audio", "時-時間-じかん.wav")), true);
        const sidecar = JSON.parse(fs.readFileSync(path.join(rootDir, "audio", "時-時間-じかん.json"), "utf-8"));
        assert.equal(sidecar.category, "word-reading");
        assert.equal(sidecar.text, "時間");
        assert.equal(sidecar.reading, "じかん");
        assert.equal(sidecar.voice, "女声1 / ノーマル");
    } finally {
        cleanupTempDir(rootDir);
    }
});

test("generateVoicevoxAudioForWordList preserves katakana display readings while synthesizing normalized kana", async () => {
    const rootDir = makeTempDir();
    const synthesized = [];

    try {
        const summary = await generateVoicevoxAudioForWordList({
            words: [{
                written: "北京",
                reading: "ペキン",
                hostKanji: "京",
            }],
            config: {
                audioSourceDir: path.join(rootDir, "audio"),
                exportConcurrency: 1,
                voicevoxEngineUrl: "http://127.0.0.1:50021",
            },
            speakerId: 10005,
            fallbackVoiceLabel: "女声1",
            voicevoxClient: {
                async listSpeakers() {
                    return [{ name: "女声1", styles: [{ id: 10005, name: "ノーマル" }] }];
                },
                async synthesize({ text, speakerId }) {
                    synthesized.push({ text, speakerId });
                    return Buffer.from(`${speakerId}:${text}`);
                },
            },
        });

        assert.equal(summary.generated, 1);
        assert.equal(summary.results[0].reading, "ペキン");
        assert.deepEqual(synthesized, [{ text: "ぺきん", speakerId: 10005 }]);
        assert.equal(fs.existsSync(path.join(rootDir, "audio", "京-北京-ペキン.wav")), true);
        const sidecar = JSON.parse(fs.readFileSync(path.join(rootDir, "audio", "京-北京-ペキン.json"), "utf-8"));
        assert.equal(sidecar.reading, "ペキン");
        assert.match(sidecar.notes, /synthesized reading ぺきん/);
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
            { kanji: "日", status: "generated", reading: "ひ", readingSource: "display-word" },
            { kanji: "学", status: "skipped" },
        ],
    }, {
        speakerId: 10005,
        audioSourceDir: "data/media_sources/audio",
    });

    assert.match(text, /Speaker ID: 10005/);
    assert.match(text, /Generated: 1/);
    assert.match(text, /日: ひ \(display-word\)/);
});
