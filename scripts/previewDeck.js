const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { createKanjiApiClient } = require("../src/clients/kanjiApiClient");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { loadKradMap, pickMainComponent } = require("../src/datasets/kradfile");
const { loadSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { buildJlptBuckets } = require("../src/datasets/sentenceCorpusCoverage");
const { createInferenceEngine } = require("../src/inference/inferenceEngine");
const { createExportService, formatExampleSentence } = require("../src/services/exportService");
const { createMediaServices } = require("../src/services/mediaServiceFactory");
const { formatPreviewReport } = require("../src/services/previewService");

function parseLevel(value) {
    if (value == null) {
        return null;
    }

    const normalized = String(value).trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv) {
    const options = {
        level: null,
        limit: 5,
        kanji: [],
        json: argv.includes("--json"),
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = parseLevel(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = arg.split("=")[1].split(",").map((entry) => entry.trim()).filter(Boolean);
        }
    }

    return options;
}

function formatPreviewError(err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "fetch failed") {
        return "Preview data is unavailable because the kanji API could not be reached and no cached entry was available.";
    }

    return message;
}
function selectPreviewKanji({ jlptOnlyJson, level, limit, kanji }) {
    if (Array.isArray(kanji) && kanji.length > 0) {
        return [...new Set(kanji)];
    }

    const buckets = buildJlptBuckets(jlptOnlyJson);
    const levels = level == null ? [5] : [level];
    const selected = levels.flatMap((entryLevel) => buckets.get(entryLevel) || []);

    if (Number.isFinite(limit) && limit > 0) {
        return selected.slice(0, limit);
    }

    return selected;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const kradMap = loadKradMap(config.kradfilePath);
    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });
    const { strokeOrderService, audioService } = createMediaServices(config);
    const inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData });
    const exportService = createExportService({ inferenceEngine });
    const kanjiList = selectPreviewKanji({
        jlptOnlyJson,
        level: options.level,
        limit: options.limit,
        kanji: options.kanji,
    });

    const cards = [];
    for (const kanji of kanjiList) {
        try {
            const inference = await exportService.buildInferenceForKanji({
                kanji,
                kanjiApiClient,
                strokeOrderService,
                audioService,
            });
            const radical = pickMainComponent(kradMap.get(kanji) || []);
            cards.push({
                kanji,
                levelLabel: `N${jlptOnlyJson[kanji]?.jlpt || "?"}`,
                meaningJP: inference.meaningJP,
                reading: inference.reading,
                radical,
                notes: inference.notes,
                exampleSentence: formatExampleSentence(inference.sentenceCandidates?.[0]),
                media: {
                    strokeOrderPath: inference.strokeOrderPath,
                    strokeOrderImagePath: inference.strokeOrderImagePath,
                    strokeOrderAnimationPath: inference.strokeOrderAnimationPath,
                    audioPath: inference.audioPath,
                },
                fields: {
                    strokeOrderField: inference.strokeOrderField,
                    strokeOrderImageField: inference.strokeOrderImageField,
                    strokeOrderAnimationField: inference.strokeOrderAnimationField,
                    audioField: inference.audioField,
                },
            });
        } catch (err) {
            cards.push({
                kanji,
                levelLabel: `N${jlptOnlyJson[kanji]?.jlpt || "?"}`,
                error: formatPreviewError(err),
            });
        }
    }

    const scope = options.kanji.length > 0
        ? `kanji=${options.kanji.join(",")}`
        : `level=${options.level == null ? "N5" : `N${options.level}`}, limit=${options.limit}`;

    if (options.json) {
        console.log(JSON.stringify({ scope, cards }, null, 2));
        return;
    }

    process.stdout.write(formatPreviewReport({ cards, scope }));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});

