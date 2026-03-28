const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const { buildSelectedKanjiByLevel, parseLevelsArgument } = require("../src/services/buildPipeline");
const { buildDeckPackage } = require("../src/services/deckPackageService");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { selectKanjiForSync, syncMediaForKanjiList } = require("../src/services/mediaSync");
const { createWordExportService } = require("../src/services/wordExportService");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");

function buildOutputPaths(outDir) {
    const root = path.resolve(outDir);
    return {
        root,
        exportsDir: path.join(root, "exports"),
        reportsDir: path.join(root, "reports"),
    };
}

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

function parseArgs(argv) {
    const options = {
        levels: null,
        limit: null,
        concurrency: null,
        outDir: null,
        maxWordsPerKanji: null,
        minimumCandidateScore: null,
        includeInferred: false,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-inferred") {
            options.includeInferred = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = parseNumericOption(arg, "concurrency");
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--max-words-per-kanji=")) {
            options.maxWordsPerKanji = parseNumericOption(arg, "max-words-per-kanji");
        } else if (arg.startsWith("--minimum-candidate-score=")) {
            options.minimumCandidateScore = parseNumericOption(arg, "minimum-candidate-score");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatWordDeckReadyReport(summary, doctorReport) {
    return [
        "Japanese Kanji Builder Word Deck Ready",
        "",
        `Output directory: ${summary.outDir}`,
        `Package directory: ${summary.package.rootDir}`,
        ...(summary.package.ankiPackage?.filePath ? [`Anki package: ${summary.package.ankiPackage.filePath}`] : []),
        `Levels: ${summary.levels.map((level) => `N${level}`).join(", ")}`,
        `Word mode: ${summary.settings.includeInferred ? "curated + inferred" : "curated only"}`,
        `Exports generated: ${summary.exports.length}`,
        `Word notes generated: ${summary.exports.reduce((total, item) => total + item.rows, 0)}`,
        `Unique referenced kanji: ${summary.referencedKanjiCount}`,
        `Unique packaged media files: ${summary.package.mediaAssetCount}`,
        "",
        "Packaged media by field:",
        `- Stroke-order field references: ${summary.package.mediaCounts.strokeOrder}`,
        `- Stroke-order images: ${summary.package.mediaCounts.strokeOrderImage}`,
        `- Stroke-order animation fields: ${summary.package.mediaCounts.strokeOrderAnimation}`,
        ...(doctorReport.enableAudio ? [`- Audio fields: ${summary.package.mediaCounts.audio}`] : []),
        "",
        "Next step: import the generated .apkg into Anki and review the new word cards alongside the kanji deck.",
        "",
    ].join("\n");
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("prepareWordDeck", options.unknownArgs);

    const doctorReport = await buildDoctorReport({ config });
    if (!doctorReport.ready) {
        process.stdout.write(formatDoctorReport(doctorReport));
        process.exitCode = 1;
        return;
    }

    const outDir = options.outDir || path.join(path.dirname(config.buildOutDir), "word-build");
    const buildPaths = buildOutputPaths(outDir);
    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const wordStudyData = loadWordStudyData({
        localPath: config.wordStudyDataPath,
    });
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const wordExportService = createWordExportService({ sentenceCorpus, curatedStudyData, wordStudyData });
    const levels = options.levels || [5];
    const concurrency = Number.isFinite(options.concurrency) ? options.concurrency : config.exportConcurrency;
    const selectedKanjiByLevel = buildSelectedKanjiByLevel({
        jlptOnlyJson,
        levels,
        limit: Number.isFinite(options.limit) ? options.limit : null,
        selectKanjiForSyncFn: selectKanjiForSync,
    });
    const syncKanjiList = [...new Set(Object.values(selectedKanjiByLevel).flatMap((list) => list))];

    await syncMediaForKanjiList({
        kanjiList: syncKanjiList,
        strokeOrderService,
        audioService,
        concurrency,
        audioMetadata: {},
    });

    const exports = [];
    for (const level of levels) {
        const result = await wordExportService.buildWordTsvForJlptLevel({
            levelNumber: level,
            jlptOnlyJson,
            kanjiApiClient,
            strokeOrderService,
            audioService,
            limit: Number.isFinite(options.limit) ? options.limit : null,
            concurrency,
            maxWordsPerKanji: Number.isFinite(options.maxWordsPerKanji) ? options.maxWordsPerKanji : null,
            minimumCandidateScore: Number.isFinite(options.minimumCandidateScore) ? options.minimumCandidateScore : 20,
            includeInferred: options.includeInferred,
        });
        const filePath = path.join(buildPaths.exportsDir, `jlpt-n${level}-words.tsv`);
        writeText(filePath, `${result.tsv}\n`);
        exports.push({
            level,
            filePath,
            rows: result.rowCount,
            mediaKanji: result.mediaKanji,
        });
    }

    const deckPackage = await buildDeckPackage({
        outDir: buildPaths.root,
        exports,
        kanjiByLevel: selectedKanjiByLevel,
        mediaRootDir: config.mediaRootDir,
        packageConcurrency: concurrency,
        deckKind: "word",
    });

    const summary = {
        generatedAt: new Date().toISOString(),
        outDir: buildPaths.root,
        levels,
        exports,
        referencedKanjiCount: [...new Set(exports.flatMap((artifact) => artifact.mediaKanji || []))].length,
        package: deckPackage,
        settings: {
            limit: Number.isFinite(options.limit) ? options.limit : null,
            concurrency,
            maxWordsPerKanji: Number.isFinite(options.maxWordsPerKanji) ? options.maxWordsPerKanji : null,
            minimumCandidateScore: Number.isFinite(options.minimumCandidateScore) ? options.minimumCandidateScore : 20,
            includeInferred: options.includeInferred,
        },
    };

    writeJson(path.join(buildPaths.root, "build-summary.json"), summary);
    writeJson(path.join(buildPaths.reportsDir, "word-deck-summary.json"), summary);

    if (options.json) {
        console.log(JSON.stringify({ doctor: doctorReport, build: summary }, null, 2));
        return;
    }

    process.stdout.write(formatWordDeckReadyReport(summary, doctorReport));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    formatWordDeckReadyReport,
    main,
    parseArgs,
};
