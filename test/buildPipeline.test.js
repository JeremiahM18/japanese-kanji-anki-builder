const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseLevelsArgument, runBuildPipeline } = require("../src/services/buildPipeline");

test("parseLevelsArgument supports all and normalized JLPT levels", () => {
    assert.deepEqual(parseLevelsArgument(), [5, 4, 3, 2, 1]);
    assert.deepEqual(parseLevelsArgument("all"), [5, 4, 3, 2, 1]);
    assert.deepEqual(parseLevelsArgument("N5,3,1"), [5, 3, 1]);
    assert.deepEqual(parseLevelsArgument("bad"), [5, 4, 3, 2, 1]);
});

test("runBuildPipeline writes exports, reports, and summary artifacts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-build-pipeline-"));
    const dataDir = path.join(tempRoot, "data");
    const outDir = path.join(tempRoot, "out", "build");

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

    const summary = await runBuildPipeline({
        config: {
            jlptJsonPath,
            kradfilePath,
            sentenceCorpusPath,
            curatedStudyDataPath,
            mediaRootDir: path.join(dataDir, "media"),
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

    assert.deepEqual(summary.levels, [5]);
    assert.equal(summary.mediaSync.skipped, true);
    assert.equal(fs.existsSync(path.join(outDir, "exports", "jlpt-n5.tsv")), true);
    assert.equal(fs.existsSync(path.join(outDir, "reports", "media-sync.json")), true);
    assert.equal(fs.existsSync(path.join(outDir, "build-summary.json")), true);

    const tsv = fs.readFileSync(path.join(outDir, "exports", "jlpt-n5.tsv"), "utf-8");
    assert.match(tsv, /^Kanji\tMeaningJP\tReading\tStrokeOrder\tAudio\tRadical\tNotes\tExampleSentence/m);
    assert.match(tsv, /^日\t/m);

    const storedSummary = JSON.parse(fs.readFileSync(path.join(outDir, "build-summary.json"), "utf-8"));
    assert.equal(storedSummary.exports.length, 1);
});
