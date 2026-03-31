const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { buildDoctorReport } = require("./doctorService");
const { buildDeckPackage } = require("./deckPackageService");
const { buildMediaBasePath } = require("./mediaStore");
const { createWordExportService } = require("./wordExportService");
const { runBuildPipeline } = require("./buildPipeline");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeText(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, value, "utf-8");
}

function commandAvailable(command, versionArg = "--version") {
    const result = spawnSync(command, [versionArg], { stdio: "ignore" });
    return !result.error;
}

function buildFixtureDataset() {
    return {
        jlptOnlyJson: {
            日: { jlpt: 5 },
            本: { jlpt: 5 },
            学: { jlpt: 4 },
        },
        sentenceCorpus: [
            {
                kanji: "日",
                written: "日本",
                japanese: "日本が好きです。",
                reading: "にほんがすきです。",
                english: "I like Japan.",
            },
            {
                kanji: "本",
                written: "本",
                japanese: "本を読みます。",
                reading: "ほんをよみます。",
                english: "I read a book.",
            },
        ],
        curatedStudyData: {
            日: {
                englishMeaning: "day / sun",
                notes: "Curated smoke-test note",
                displayWord: {
                    written: "日本",
                    pron: "にほん",
                },
                exampleSentence: {
                    japanese: "日本が好きです。",
                    reading: "にほんがすきです。",
                    english: "I like Japan.",
                },
            },
        },
        wordStudyData: {
            "日本|にほん": {
                written: "日本",
                reading: "にほん",
                meaning: "Japan",
                jlpt: 5,
                tags: ["smoke", "n5"],
                exampleSentence: {
                    japanese: "日本が好きです。",
                    reading: "にほんがすきです。",
                    english: "I like Japan.",
                },
            },
        },
    };
}

function createMockKanjiApiClient() {
    return {
        async getKanji(kanji) {
            if (kanji === "日") {
                return {
                    meanings: ["day", "sun"],
                    on_readings: ["ニチ", "ジツ"],
                    kun_readings: ["ひ", "か"],
                };
            }

            if (kanji === "本") {
                return {
                    meanings: ["book", "origin"],
                    on_readings: ["ホン"],
                    kun_readings: ["もと"],
                };
            }

            return {
                meanings: ["study"],
                on_readings: ["ガク"],
                kun_readings: ["まな.ぶ"],
            };
        },

        async getWords(kanji) {
            if (kanji === "日") {
                return [
                    {
                        variants: [
                            {
                                written: "日本",
                                pronounced: "にほん",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["Japan"],
                            },
                        ],
                    },
                ];
            }

            if (kanji === "本") {
                return [
                    {
                        variants: [
                            {
                                written: "本",
                                pronounced: "ほん",
                                priorities: ["ichi1"],
                            },
                        ],
                        meanings: [
                            {
                                glosses: ["book"],
                            },
                        ],
                    },
                ];
            }

            return [
                {
                    variants: [
                        {
                            written: "学ぶ",
                            pronounced: "まなぶ",
                            priorities: ["news1"],
                        },
                    ],
                    meanings: [
                        {
                            glosses: ["to learn"],
                        },
                    ],
                },
            ];
        },

        getMetrics() {
            return {
                cacheHits: 0,
                cacheMisses: 0,
                networkFetches: 0,
                cacheWrites: 0,
                payloadValidationFailures: 0,
            };
        },
    };
}

function createStubMediaServices() {
    return {
        strokeOrderService: {
            async getBestStrokeOrderPath() {
                return "animations/65E5_日-stroke-order.gif";
            },
            async getStrokeOrderImagePath() {
                return "images/65E5_日-stroke-order.svg";
            },
            async getStrokeOrderAnimationPath() {
                return "animations/65E5_日-stroke-order.gif";
            },
            async getManifest() {
                return null;
            },
            getProviderMetrics() {
                return {
                    providers: [],
                    hits: 0,
                    misses: 0,
                };
            },
        },
        audioService: {
            async getBestAudioPath() {
                return "audio/65E5_日-kanji-reading-日.mp3";
            },
            getProviderMetrics() {
                return {
                    providers: [],
                    hits: 0,
                    misses: 0,
                };
            },
        },
    };
}

function createSmokeWorkspace(rootDir) {
    const workspaceRoot = rootDir
        ? path.resolve(rootDir)
        : fs.mkdtempSync(path.join(os.tmpdir(), "kanji-ci-smoke-"));
    const dataDir = path.join(workspaceRoot, "data");
    const outDir = path.join(workspaceRoot, "out");
    const kanjiBuildOutDir = path.join(outDir, "build");
    const wordBuildOutDir = path.join(outDir, "word-build");
    const mediaRootDir = path.join(dataDir, "media");
    const fixture = buildFixtureDataset();

    ensureDir(dataDir);
    writeJson(path.join(dataDir, "kanji_jlpt_only.json"), fixture.jlptOnlyJson);
    writeText(path.join(dataDir, "KRADFILE"), "日 : 日\n本 : 木\n学 : 子\n");
    writeJson(path.join(dataDir, "sentence_corpus.json"), fixture.sentenceCorpus);
    writeJson(path.join(dataDir, "curated_study_data.json"), fixture.curatedStudyData);
    writeJson(path.join(dataDir, "word_study_data.json"), fixture.wordStudyData);

    const mediaBasePath = buildMediaBasePath(mediaRootDir, "日");
    ensureDir(path.join(mediaBasePath, "images"));
    ensureDir(path.join(mediaBasePath, "animations"));
    ensureDir(path.join(mediaBasePath, "audio"));
    writeText(path.join(mediaBasePath, "images", "65E5_日-stroke-order.svg"), "<svg />");
    writeText(path.join(mediaBasePath, "animations", "65E5_日-stroke-order.gif"), "gif");
    writeText(path.join(mediaBasePath, "audio", "65E5_日-kanji-reading-日.mp3"), "mp3");
    writeJson(path.join(mediaBasePath, "manifest.json"), {
        kanji: "日",
        version: 1,
        updatedAt: "2026-01-01T00:00:00.000Z",
        assets: {
            strokeOrderImage: {
                kind: "image",
                path: "images/65E5_日-stroke-order.svg",
                mimeType: "image/svg+xml",
                source: "local-filesystem",
            },
            strokeOrderAnimation: {
                kind: "animation",
                path: "animations/65E5_日-stroke-order.gif",
                mimeType: "image/gif",
                source: "local-filesystem",
            },
            audio: [
                {
                    kind: "audio",
                    path: "audio/65E5_日-kanji-reading-日.mp3",
                    mimeType: "audio/mpeg",
                    source: "local-filesystem",
                    category: "kanji-reading",
                    text: "日",
                    locale: "ja-JP",
                },
            ],
        },
    });

    return {
        rootDir: workspaceRoot,
        dataDir,
        kanjiBuildOutDir,
        wordBuildOutDir,
        config: {
            port: 3719,
            cacheDir: path.join(workspaceRoot, "cache"),
            jlptJsonPath: path.join(dataDir, "kanji_jlpt_only.json"),
            kradfilePath: path.join(dataDir, "KRADFILE"),
            sentenceCorpusPath: path.join(dataDir, "sentence_corpus.json"),
            curatedStudyDataPath: path.join(dataDir, "curated_study_data.json"),
            wordStudyDataPath: path.join(dataDir, "word_study_data.json"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            mediaRootDir,
            strokeOrderImageSourceDir: path.join(dataDir, "media_sources", "stroke-order", "images"),
            strokeOrderAnimationSourceDir: path.join(dataDir, "media_sources", "stroke-order", "animations"),
            audioSourceDir: path.join(dataDir, "media_sources", "audio"),
            enableAudio: true,
            voicevoxEngineUrl: "http://127.0.0.1:50021",
            buildOutDir: kanjiBuildOutDir,
            exportConcurrency: 2,
            fetchTimeoutMs: 10000,
        },
        fixture,
    };
}

function assertPathExists(filePath) {
    assert.equal(fs.existsSync(filePath), true, `Expected path to exist: ${filePath}`);
}

function verifyAnkiPackage(summary) {
    const apkgPath = summary?.package?.ankiPackage?.filePath;
    if (!apkgPath) {
        assert.equal(summary?.package?.ankiPackage?.skipped, true);
        return {
            verified: false,
            skipped: true,
            reason: summary?.package?.ankiPackage?.skipReason || "missing-apkg-path",
        };
    }

    if (!commandAvailable("sqlite3", "-version") || !commandAvailable("tar")) {
        assert.equal(summary?.package?.ankiPackage?.skipped, true);
        return {
            verified: false,
            skipped: true,
            reason: "Missing required system tools: sqlite3 and/or tar.",
        };
    }

    assertPathExists(apkgPath);
    return {
        verified: true,
        skipped: false,
        reason: "",
    };
}

async function runCiSmoke({ rootDir = null, keepTempDir = false } = {}) {
    const workspace = createSmokeWorkspace(rootDir);
    const mockKanjiApiClient = createMockKanjiApiClient();
    const mediaServices = createStubMediaServices();

    try {
        const doctorReport = await buildDoctorReport({ config: workspace.config });
        assert.equal(doctorReport.ready, true);

        const kanjiSummary = await runBuildPipeline({
            config: workspace.config,
            outDir: workspace.kanjiBuildOutDir,
            levels: [5],
            limit: 1,
            skipMediaSync: true,
            createKanjiApiClientFn: () => mockKanjiApiClient,
            createMediaServicesFn: () => mediaServices,
        });

        assertPathExists(path.join(workspace.kanjiBuildOutDir, "exports", "jlpt-n5.tsv"));
        assertPathExists(path.join(workspace.kanjiBuildOutDir, "build-summary.json"));
        assertPathExists(path.join(workspace.kanjiBuildOutDir, "package", "IMPORT.txt"));

        const wordExportService = createWordExportService({
            sentenceCorpus: workspace.fixture.sentenceCorpus,
            curatedStudyData: workspace.fixture.curatedStudyData,
            wordStudyData: workspace.fixture.wordStudyData,
        });
        const wordResult = await wordExportService.buildWordTsvForJlptLevel({
            levelNumber: 5,
            jlptOnlyJson: workspace.fixture.jlptOnlyJson,
            kanjiApiClient: mockKanjiApiClient,
            strokeOrderService: mediaServices.strokeOrderService,
            audioService: mediaServices.audioService,
            limit: 1,
            concurrency: 2,
        });

        ensureDir(path.join(workspace.wordBuildOutDir, "exports"));
        const wordExportPath = path.join(workspace.wordBuildOutDir, "exports", "jlpt-n5-words.tsv");
        writeText(wordExportPath, `${wordResult.tsv}\n`);

        const wordPackage = await buildDeckPackage({
            outDir: workspace.wordBuildOutDir,
            exports: [
                {
                    level: 5,
                    filePath: wordExportPath,
                    rows: wordResult.rowCount,
                    mediaKanji: wordResult.mediaKanji,
                },
            ],
            kanjiByLevel: { 5: ["日"] },
            mediaRootDir: workspace.config.mediaRootDir,
            packageConcurrency: 2,
            deckKind: "word",
        });

        assertPathExists(wordExportPath);
        assertPathExists(path.join(workspace.wordBuildOutDir, "package", "IMPORT.txt"));

        return {
            rootDir: workspace.rootDir,
            kanjiBuild: {
                outDir: workspace.kanjiBuildOutDir,
                exports: kanjiSummary.exports,
                package: kanjiSummary.package,
            },
            wordBuild: {
                outDir: workspace.wordBuildOutDir,
                rows: wordResult.rowCount,
                mediaKanji: wordResult.mediaKanji,
                package: wordPackage,
            },
            doctor: {
                nextSteps: doctorReport.nextSteps,
            },
            packageVerification: {
                kanji: verifyAnkiPackage(kanjiSummary),
                word: verifyAnkiPackage({ package: wordPackage }),
            },
        };
    } finally {
        if (!keepTempDir && !rootDir) {
            fs.rmSync(workspace.rootDir, { recursive: true, force: true });
        }
    }
}

module.exports = {
    buildFixtureDataset,
    commandAvailable,
    createMockKanjiApiClient,
    createSmokeWorkspace,
    createStubMediaServices,
    runCiSmoke,
    verifyAnkiPackage,
};
