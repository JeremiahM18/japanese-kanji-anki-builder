const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const { buildMediaBasePath } = require("../src/services/mediaStore");
const { buildScopedCoverageRatio, parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");

function commandAvailable(command, versionArg = "--version") {
    const result = spawnSync(command, [versionArg], { stdio: "ignore" });
    return !result.error;
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
    assert.equal(summary.package.mediaAssetCount, 3);
    assert.deepEqual(summary.package.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 1,
        strokeOrderAnimation: 1,
        trueStrokeOrderAnimation: 1,
        svgStrokeOrderAnimationFallback: 0,
        audio: 1,
    });
    assert.equal(fs.existsSync(path.join(outDir, "exports", "jlpt-n5.tsv")), true);
    assert.equal(fs.existsSync(path.join(outDir, "reports", "media-sync.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "build-summary.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "exports", "jlpt-n5.tsv")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-stroke-order.svg")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-stroke-order.gif")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "media", "65E5_日-kanji-reading-日.mp3")), true);
    assert.equal(fs.existsSync(path.join(outDir, "package", "IMPORT.txt")), true);

    const tsv = fs.readFileSync(path.join(outDir, "exports", "jlpt-n5.tsv"), "utf-8");
    assert.match(tsv, /^Kanji\tDisplayWord\tMeaningJP\tPrimaryReading\tOnReading\tKunReading\tStrokeOrder\tStrokeOrderImage\tStrokeOrderAnimation\tAudio\tRadical\tNotes\tExampleSentence/m);
    assert.match(tsv, /^日\t/m);

    const storedSummary = JSON.parse(fs.readFileSync(path.join(outDir, "build-summary.json"), "utf-8"));
    assert.equal(storedSummary.exports.length, 1);
    assert.equal(storedSummary.package.mediaAssetCount, 3);
    assert.deepEqual(storedSummary.package.mediaCounts, {
        strokeOrder: 1,
        strokeOrderImage: 1,
        strokeOrderAnimation: 1,
        trueStrokeOrderAnimation: 1,
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
    if (apkgPath && commandAvailable("sqlite3", "-version") && commandAvailable("tar")) {
        assert.equal(fs.existsSync(apkgPath), true);

        const listResult = spawnSync("tar", ["-tf", apkgPath], { encoding: "utf8" });
        assert.equal(listResult.status, 0);
        assert.match(listResult.stdout, /collection\.anki2/);
        assert.match(listResult.stdout, /^media$/m);

        const inspectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-apkg-inspect-"));
        try {
            const extractResult = spawnSync("tar", ["-xf", apkgPath], { cwd: inspectDir, encoding: "utf8" });
            assert.equal(extractResult.status, 0);

            const sqliteResult = spawnSync(
                "sqlite3",
                [path.join(inspectDir, "collection.anki2"), "SELECT count(*) FROM notes;"],
                { encoding: "utf8" }
            );
            assert.equal(sqliteResult.status, 0);
            assert.equal(sqliteResult.stdout.trim(), "1");
        } finally {
            fs.rmSync(inspectDir, { recursive: true, force: true });
        }
    } else {
        assert.equal(storedSummary.package.ankiPackage.skipped, true);
        assert.match(storedSummary.package.ankiPackage.skipReason, /sqlite3|tar|apkg/i);
    }
});
