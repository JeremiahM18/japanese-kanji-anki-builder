const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { buildMediaBasePath } = require("../src/services/mediaStore");
const { buildScopedCoverageRatio, buildTemporaryWritePath, parseLevelsArgument, runBuildPipeline, summarizeExportIssues } = require("../src/services/buildPipeline");
const { resolvePythonCommand } = require("../src/services/toolchainService");

function buildKanjiTsv(rows = []) {
    const fieldNames = loadAnkiNoteSchema("kanji").fieldNames;
    return [
        fieldNames.join("\t"),
        ...rows.map((row) => fieldNames.map((fieldName) => row[fieldName] || "").join("\t")),
    ].join("\n");
}

test("parseLevelsArgument supports all and normalized JLPT levels", () => {
    assert.deepEqual(parseLevelsArgument(), [5, 4, 3, 2, 1]);
    assert.deepEqual(parseLevelsArgument("all"), [5, 4, 3, 2, 1]);
    assert.deepEqual(parseLevelsArgument("N5,3,1"), [5, 3, 1]);
    assert.deepEqual(parseLevelsArgument("bad"), [5, 4, 3, 2, 1]);
});

test("buildScopedCoverageRatio aggregates only the selected levels", () => {
    const ratio = buildScopedCoverageRatio([
        { level: 5, totalKanji: 79, strokeOrderCovered: 79 },
        { level: 4, totalKanji: 166, strokeOrderCovered: 166 },
        { level: 3, totalKanji: 123, strokeOrderCovered: 0 },
    ], [5], "strokeOrderCovered");

    assert.equal(ratio, 1);
});

test("summarizeExportIssues tracks fallback ratios and threshold breaches", () => {
    const summary = summarizeExportIssues([
        { severity: "warning", resolution: "offline-local-fallback" },
        { severity: "warning", resolution: "offline-local-fallback" },
        { severity: "error", resolution: "export-failed" },
    ], 10, 0.1);

    assert.equal(summary.count, 3);
    assert.equal(summary.warnings, 2);
    assert.equal(summary.errors, 1);
    assert.equal(summary.fallbackCount, 2);
    assert.equal(summary.fallbackRatio, 0.2);
    assert.equal(summary.maxAllowedFallbackRatio, 0.1);
    assert.equal(summary.thresholdExceeded, true);
});

test("runBuildPipeline counts actual TSV data rows for export fallback ratios", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-row-count-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, `${JSON.stringify({ 日: { jlpt: 5 }, 月: { jlpt: 5 } }, null, 2)}\n`, "utf-8");
    fs.writeFileSync(kradfilePath, "日 : 日\n月 : 月\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, "[]\n", "utf-8");
    fs.writeFileSync(curatedStudyDataPath, "{}\n", "utf-8");

    let packagedExports = null;
    const summary = await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 1,
            buildOutDir: outDir,
        },
        outDir,
        levels: [5],
        skipMediaSync: true,
        maxFallbackRatio: 0.75,
        selectKanjiForSyncFn: () => ["日", "月"],
        createMediaServicesFn: () => ({
            strokeOrderService: {},
            audioService: {},
        }),
        createExportServiceFn: () => ({
            async buildTsvForJlptLevel({ exportIssues }) {
                exportIssues.push({
                    severity: "warning",
                    resolution: "offline-local-fallback",
                    kanji: "日",
                });
                return buildKanjiTsv([{
                    Kanji: "日",
                    DisplayWord: "日",
                    PrimaryReading: "ひ",
                }]);
            },
        }),
        buildDeckPackageFn: async ({ exports }) => {
            packagedExports = exports;
            return {
                rootDir: path.join(outDir, "package"),
                exportsDir: path.join(outDir, "package", "exports"),
                mediaDir: path.join(outDir, "package", "media"),
                readmePath: path.join(outDir, "package", "IMPORT.txt"),
                exportCount: exports.length,
                mediaAssetCount: 0,
                mediaCounts: {},
                ankiPackage: { skipped: true, skipReason: "test" },
            };
        },
    });

    assert.equal(summary.exports[0].rows, 1);
    assert.equal(packagedExports[0].rows, 1);
    assert.equal(summary.exportIssues.fallbackCount, 1);
    assert.equal(summary.exportIssues.fallbackRatio, 1);
    assert.equal(summary.exportIssues.thresholdExceeded, true);
});

test("buildTemporaryWritePath stays unique within the same millisecond", () => {
    const originalNow = Date.now;

    try {
        Date.now = () => 1234567890;
        const first = buildTemporaryWritePath(path.join("out", "build-summary.json"));
        const second = buildTemporaryWritePath(path.join("out", "build-summary.json"));

        assert.notEqual(first, second);
        assert.match(first, /\.tmp-\d+-1234567890-\d+$/);
        assert.match(second, /\.tmp-\d+-1234567890-\d+$/);
    } finally {
        Date.now = originalNow;
    }
});

test("runBuildPipeline reuses the shared manifest lookup during packaging", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-manifest-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, JSON.stringify({ 日: { jlpt: 5 } }, null, 2) + "\n", "utf-8");
    fs.writeFileSync(kradfilePath, "日 : 日\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, JSON.stringify([], null, 2) + "\n", "utf-8");
    fs.writeFileSync(curatedStudyDataPath, JSON.stringify({}, null, 2) + "\n", "utf-8");

    const mediaBasePath = buildMediaBasePath(mediaRootDir, "日");
    fs.mkdirSync(path.join(mediaBasePath, "images"), { recursive: true });
    fs.mkdirSync(path.join(mediaBasePath, "animations"), { recursive: true });
    fs.writeFileSync(path.join(mediaBasePath, "images", "65E5_日-stroke-order.svg"), "<svg />", "utf-8");
    fs.writeFileSync(path.join(mediaBasePath, "animations", "65E5_日-stroke-order.gif"), "gif", "utf-8");

    let manifestCalls = 0;
    await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 1,
            buildOutDir: outDir,
        },
        outDir,
        levels: [5],
        limit: 1,
        skipMediaSync: true,
        createKanjiApiClientFn: () => ({
            async getKanji() {
                return { meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] };
            },
            async getWords() {
                return [];
            },
        }),
        createMediaServicesFn: () => ({
            strokeOrderService: {
                async getManifest() {
                    manifestCalls += 1;
                    return {
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
                            audio: [],
                        },
                    };
                },
                async getBestStrokeOrderPath() {
                    throw new Error("should not use stroke-order fallback getters when manifest is available");
                },
                async getStrokeOrderImagePath() {
                    throw new Error("should not use stroke-order image fallback getter when manifest is available");
                },
                async getStrokeOrderAnimationPath() {
                    throw new Error("should not use stroke-order animation fallback getter when manifest is available");
                },
            },
            audioService: {
                async getBestAudioPath() {
                    throw new Error("should not use audio fallback getter when manifest is available");
                },
            },
        }),
    });

    assert.equal(manifestCalls, 2);
});

test("runBuildPipeline exports audio from the audio manifest when the stroke-order manifest cache is stale", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-stale-audio-cache-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, JSON.stringify({ 日: { jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"] } }, null, 2) + "\n", "utf-8");
    fs.writeFileSync(kradfilePath, "日 : 日\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, JSON.stringify([], null, 2) + "\n", "utf-8");
    fs.writeFileSync(curatedStudyDataPath, JSON.stringify({}, null, 2) + "\n", "utf-8");

    const staleStrokeOrderManifest = {
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
            audio: [],
        },
    };
    const freshAudioManifest = {
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: [{
                kind: "audio",
                path: "audio/65E5_日-kanji-reading-日-ひ.wav",
                mimeType: "audio/wav",
                source: "voicevox-nemo",
                category: "kanji-reading",
                text: "日",
                reading: "ひ",
                voice: "女声1 / ノーマル",
                locale: "ja-JP",
            }],
        },
    };

    await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 1,
            buildOutDir: outDir,
        },
        outDir,
        levels: [5],
        limit: 1,
        createKanjiApiClientFn: () => ({
            async getKanji() {
                throw new Error("should use the local JLPT entry");
            },
            async getWords() {
                throw new Error("should skip word fetch for fully curated fixture");
            },
        }),
        createInferenceEngineFn: () => ({
            hasFullyCuratedKanjiEntry() {
                return true;
            },
            inferKanjiStudyData() {
                return {
                    displayWord: { written: "日", pron: "ひ" },
                    bestWord: { written: "日", pron: "ひ" },
                    englishMeaning: "day",
                    meaningJP: "日 （ひ） ／ day",
                    notes: "日 （ひ） - day",
                    sentenceCandidates: [{
                        japanese: "今日は晴れです。",
                        reading: "きょうははれです。",
                        english: "It is sunny today.",
                    }],
                };
            },
        }),
        createMediaServicesFn: () => ({
            strokeOrderService: {
                async getManifest() {
                    return staleStrokeOrderManifest;
                },
            },
            audioService: {
                async getManifest() {
                    return freshAudioManifest;
                },
            },
        }),
        syncMediaForKanjiListFn: async () => ({
            results: [{
                kanji: "日",
                strokeOrder: { manifest: staleStrokeOrderManifest },
                audio: { manifest: freshAudioManifest },
            }],
            summary: {
                totalKanji: 1,
                strokeOrder: { imageHits: 1, animationHits: 1, sourceCounts: { "local-filesystem": 2 } },
                audio: { hits: 1, sourceCounts: { "voicevox-nemo": 1 } },
                errors: [],
            },
        }),
        buildMediaCoverageSummaryFn: async () => ({
            levels: [{ level: 5, totalKanji: 1, strokeOrderCovered: 1, trueAnimationCovered: 1, audioCovered: 1, fullMediaCovered: 1 }],
        }),
        buildDeckPackageFn: async () => ({
            rootDir: path.join(outDir, "package"),
            exportsDir: path.join(outDir, "package", "exports"),
            mediaDir: path.join(outDir, "package", "media"),
            readmePath: path.join(outDir, "package", "IMPORT.txt"),
            exportCount: 1,
            mediaAssetCount: 2,
            mediaCounts: {
                strokeOrder: 1,
                strokeOrderImage: 0,
                strokeOrderAnimation: 0,
                trueStrokeOrderAnimation: 0,
                svgStrokeOrderAnimationFallback: 0,
                audio: 1,
            },
            ankiPackage: { skipped: true, skipReason: "stubbed packaging" },
        }),
    });

    const tsv = fs.readFileSync(path.join(outDir, "exports", "jlpt-n5.tsv"), "utf-8");
    assert.match(tsv, /<img src="65E5_日-stroke-order\.gif" \/>/);
    assert.match(tsv, /\[sound:65E5_日-kanji-reading-日-ひ\.wav\]/);
});

test("runBuildPipeline writes exports reports summary and an import-ready package", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, `${JSON.stringify({
        日: { jlpt: 5 },
        本: { jlpt: 5 },
        学: { jlpt: 4 },
    }, null, 2)}\n`, "utf-8");
    fs.writeFileSync(kradfilePath, "日 : 日\n本 : 木\n学 : 子\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, `${JSON.stringify([
        {
            kanji: "日",
            written: "日本",
            japanese: "日本が好きです。",
            reading: "にほんがすきです。",
            english: "I like Japan.",
        },
    ], null, 2)}\n`, "utf-8");
    fs.writeFileSync(curatedStudyDataPath, `${JSON.stringify({
        日: {
            englishMeaning: "day",
            notes: "Curated note",
        },
    }, null, 2)}\n`, "utf-8");

    const mediaBasePath = buildMediaBasePath(mediaRootDir, "日");
    fs.mkdirSync(path.join(mediaBasePath, "images"), { recursive: true });
    fs.mkdirSync(path.join(mediaBasePath, "animations"), { recursive: true });
    fs.mkdirSync(path.join(mediaBasePath, "audio"), { recursive: true });
    fs.writeFileSync(path.join(mediaBasePath, "images", "65E5_日-stroke-order.svg"), "<svg />", "utf-8");
    fs.writeFileSync(path.join(mediaBasePath, "animations", "65E5_日-stroke-order.gif"), "gif", "utf-8");
    fs.writeFileSync(path.join(mediaBasePath, "audio", "65E5_日-kanji-reading-日.mp3"), "mp3", "utf-8");
    fs.writeFileSync(path.join(mediaBasePath, "manifest.json"), `${JSON.stringify({
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
            audio: [{
                kind: "audio",
                path: "audio/65E5_日-kanji-reading-日.mp3",
                mimeType: "audio/mpeg",
                source: "local-filesystem",
                category: "kanji-reading",
                text: "日",
                locale: "ja-JP",
            }],
        },
    }, null, 2)}\n`, "utf-8");

    const summary = await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 2,
            buildOutDir: outDir,
        },
        outDir,
        levels: [5],
        limit: 1,
        skipMediaSync: true,
        createKanjiApiClientFn: () => ({
            async getKanji() {
                return {
                    meanings: ["day"],
                    on_readings: ["ニチ"],
                    kun_readings: ["ひ"],
                };
            },
            async getWords() {
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
            },
        }),
        createMediaServicesFn: () => ({
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
            },
            audioService: {
                async getBestAudioPath() {
                    return "audio/65E5_日-kanji-reading-日.mp3";
                },
            },
        }),
    });

    assert.deepEqual(summary.levels, [5]);
    assert.equal(summary.mediaSync.skipped, true);
    assert.equal(summary.package.mediaAssetCount, 2);
    assert.equal(summary.package.timingsMs.copyMedia >= 0, true);
    assert.equal(summary.package.timingsMs.writeMediaIntegrity >= 0, true);
    assert.equal(summary.package.timingsMs.buildAnkiPackage >= 0, true);
    assert.equal(
        summary.package.ankiPackage.cacheHit
            ? summary.package.ankiPackage.timingsMs.cacheLookup >= 0
            : summary.package.ankiPackage.timingsMs.runPythonApkgBuilder >= 0,
        true
    );
    assert.deepEqual(summary.package.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        trueStrokeOrderAnimation: 0,
        svgStrokeOrderAnimationFallback: 0,
        audio: 1,
    });
    assert.equal(fs.existsSync(path.join(outDir, "exports", "jlpt-n5.tsv")), true);
    assert.equal(fs.existsSync(path.join(outDir, "reports", "media-sync.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "build-summary.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "exports", "jlpt-n5.tsv")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-stroke-order.svg")), false);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-stroke-order.gif")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-kanji-reading-日.mp3")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media-integrity.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "IMPORT.txt")), true);

    const tsv = fs.readFileSync(path.join(outDir, "exports", "jlpt-n5.tsv"), "utf-8");
    assert.match(tsv, /^Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tKanjiMeanings\tStudyWordKanji\tOnReading\tKunReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence/m);
    assert.match(tsv, /^日\t/m);

    const storedSummary = JSON.parse(fs.readFileSync(path.join(outDir, "build-summary.json"), "utf-8"));
    assert.equal(storedSummary.exports.length, 1);
    assert.equal(storedSummary.package.mediaAssetCount, 2);
    assert.equal(storedSummary.package.timingsMs.copyMedia >= 0, true);
    assert.equal(storedSummary.package.timingsMs.writeMediaIntegrity >= 0, true);
    assert.equal(storedSummary.package.timingsMs.buildAnkiPackage >= 0, true);
    assert.equal(
        storedSummary.package.ankiPackage.cacheHit
            ? storedSummary.package.ankiPackage.timingsMs.cacheLookup >= 0
            : storedSummary.package.ankiPackage.timingsMs.runPythonApkgBuilder >= 0,
        true
    );
    assert.deepEqual(storedSummary.package.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        trueStrokeOrderAnimation: 0,
        svgStrokeOrderAnimationFallback: 0,
        audio: 1,
    });
    assert.equal(storedSummary.coverage.sentenceCorpus, 1);
    assert.equal(storedSummary.coverage.curatedStudyData, 1);
    assert.equal(storedSummary.coverage.strokeOrder, 0.5);
    assert.equal(storedSummary.coverage.trueAnimation, 0.5);
    assert.equal(storedSummary.coverage.audio, 0.5);
    assert.equal(storedSummary.coverage.fullMedia, 0.5);

    const apkgPath = storedSummary.package.ankiPackage?.filePath;
    const python = resolvePythonCommand();
    if (apkgPath && python) {
        assert.equal(fs.existsSync(apkgPath), true);
        const inspectScript = [
            "import sqlite3, sys, tempfile, zipfile",
            "apkg_path = sys.argv[1]",
            "with tempfile.TemporaryDirectory() as temp_dir:",
            "    with zipfile.ZipFile(apkg_path, 'r') as archive:",
            "        names = set(archive.namelist())",
            "        assert 'collection.anki2' in names",
            "        assert 'media' in names",
            "        archive.extract('collection.anki2', temp_dir)",
            "    conn = sqlite3.connect(f'{temp_dir}/collection.anki2')",
            "    try:",
            "        note_count = conn.execute('SELECT count(*) FROM notes;').fetchone()[0]",
            "    finally:",
            "        conn.close()",
            "    assert note_count == 1, f'note count mismatch: {note_count}'",
        ].join("\n");
        const inspectResult = spawnSync(
            python.command,
            [...python.argsPrefix, "-c", inspectScript, apkgPath],
            { encoding: "utf8" }
        );
        assert.equal(inspectResult.status, 0, inspectResult.stderr || inspectResult.stdout || "Python .apkg inspection failed");
    } else {
        assert.equal(storedSummary.package.ankiPackage.skipped, true);
        assert.match(storedSummary.package.ankiPackage.skipReason, /python|apkg/i);
    }
});

test("runBuildPipeline reports export fallback issues instead of writing raw error rows", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-export-issues-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, `${JSON.stringify({
        龘: {
            jlpt: 4,
            meanings: ["master", "main", "lord"],
            on_readings: ["シュ"],
            kun_readings: ["ぬし", "おも"],
        },
    }, null, 2)}\n`, "utf-8");
    fs.writeFileSync(kradfilePath, "龘 : 丶\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, `${JSON.stringify([], null, 2)}\n`, "utf-8");
    fs.writeFileSync(curatedStudyDataPath, `${JSON.stringify({
        龘: {
            englishMeaning: "test meaning",
            breakdownDisplayWord: {
                written: "龘",
                pron: "おも",
            },
            preferredWords: ["龘"],
            notes: "龘 （おも） - test meaning",
            exampleSentence: {
                japanese: "龘な理由を説明してください。",
                reading: "てすとかんじをせつめいしてください。",
                english: "Please explain this test kanji.",
            },
        },
    }, null, 2)}\n`, "utf-8");

    const summary = await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 1,
            buildOutDir: outDir,
        },
        outDir,
        levels: [4],
        limit: 1,
        skipMediaSync: true,
        createKanjiApiClientFn: () => ({
            async getKanji() {
                return {
                    meanings: ["master", "main", "lord"],
                    on_readings: ["シュ"],
                    kun_readings: ["ぬし", "おも"],
                };
            },
            async getWords() {
                throw new Error("Request timed out after 10000 ms: https://kanjiapi.dev/v1/words/%E9%BE%98");
            },
        }),
        createMediaServicesFn: () => ({
            strokeOrderService: {
                async getBestStrokeOrderPath() {
                    return "";
                },
                async getStrokeOrderImagePath() {
                    return "";
                },
                async getStrokeOrderAnimationPath() {
                    return "";
                },
            },
            audioService: {
                async getBestAudioPath() {
                    return "";
                },
            },
        }),
    });

    const tsv = fs.readFileSync(path.join(outDir, "exports", "jlpt-n4.tsv"), "utf-8");
    const exportIssues = JSON.parse(fs.readFileSync(path.join(outDir, "reports", "export-issues.json"), "utf-8"));

    assert.equal(tsv.includes("ERROR:"), false);
    assert.equal(summary.exportIssues.count, 1);
    assert.equal(summary.exportIssues.warnings, 1);
    assert.equal(summary.exportIssues.errors, 0);
    assert.equal(summary.exportIssues.fallbackCount, 1);
    assert.equal(summary.exportIssues.fallbackRatio, 1);
    assert.equal(summary.exportIssues.maxAllowedFallbackRatio, null);
    assert.equal(summary.exportIssues.thresholdExceeded, false);
    assert.equal(exportIssues.length, 1);
    assert.equal(exportIssues[0].kanji, "龘");
    assert.equal(exportIssues[0].resolution, "offline-local-fallback");
});

test("runBuildPipeline records when export fallback ratio exceeds a configured threshold", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-fallback-threshold-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");
    const mediaRootDir = path.join(dataDir, "media");

    fs.mkdirSync(dataDir, { recursive: true });

    const jlptJsonPath = path.join(dataDir, "kanji_jlpt_only.json");
    const kradfilePath = path.join(dataDir, "KRADFILE");
    const sentenceCorpusPath = path.join(dataDir, "sentence_corpus.json");
    const curatedStudyDataPath = path.join(dataDir, "curated_study_data.json");

    fs.writeFileSync(jlptJsonPath, `${JSON.stringify({
        龘: {
            jlpt: 4,
            meanings: ["master", "main", "lord"],
            on_readings: ["シュ"],
            kun_readings: ["ぬし", "おも"],
        },
    }, null, 2)}\n`, "utf-8");
    fs.writeFileSync(kradfilePath, "龘 : 丶\n", "utf-8");
    fs.writeFileSync(sentenceCorpusPath, `${JSON.stringify([], null, 2)}\n`, "utf-8");
    fs.writeFileSync(curatedStudyDataPath, `${JSON.stringify({
        龘: {
            englishMeaning: "test meaning",
            breakdownDisplayWord: {
                written: "龘",
                pron: "おも",
            },
            preferredWords: ["龘"],
            notes: "龘 （おも） - test meaning",
            exampleSentence: {
                japanese: "龘な理由を説明してください。",
                reading: "てすとかんじをせつめいしてください。",
                english: "Please explain this test kanji.",
            },
        },
    }, null, 2)}\n`, "utf-8");

    const summary = await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir,
            cacheDir: path.join(tempRoot, "cache"),
            kanjiApiBaseUrl: "https://kanjiapi.dev",
            fetchTimeoutMs: 10000,
            exportConcurrency: 1,
            buildOutDir: outDir,
        },
        outDir,
        levels: [4],
        limit: 1,
        maxFallbackRatio: 0.05,
        skipMediaSync: true,
        createKanjiApiClientFn: () => ({
            async getKanji() {
                return {
                    meanings: ["master", "main", "lord"],
                    on_readings: ["シュ"],
                    kun_readings: ["ぬし", "おも"],
                };
            },
            async getWords() {
                throw new Error("Request timed out after 10000 ms: https://kanjiapi.dev/v1/words/%E9%BE%98");
            },
        }),
        createMediaServicesFn: () => ({
            strokeOrderService: {
                async getBestStrokeOrderPath() {
                    return "";
                },
                async getStrokeOrderImagePath() {
                    return "";
                },
                async getStrokeOrderAnimationPath() {
                    return "";
                },
            },
            audioService: {
                async getBestAudioPath() {
                    return "";
                },
            },
        }),
    });

    assert.equal(summary.exportIssues.fallbackCount, 1);
    assert.equal(summary.exportIssues.fallbackRatio, 1);
    assert.equal(summary.exportIssues.maxAllowedFallbackRatio, 0.05);
    assert.equal(summary.exportIssues.thresholdExceeded, true);
});

