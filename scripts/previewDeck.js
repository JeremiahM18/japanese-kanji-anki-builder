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
const { labelReading } = require("../src/utils/text");

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
        return "Preview used local fallback data because the kanji API could not be reached and no cached entry was available.";
    }

    return message;
}

function buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus) {
    if (curatedEntry?.exampleSentence) {
        return {
            type: "curated",
            japanese: curatedEntry.exampleSentence.japanese,
            reading: curatedEntry.exampleSentence.reading || "",
            english: curatedEntry.exampleSentence.english,
            written: curatedEntry.preferredWords?.[0] || kanji,
            source: curatedEntry.exampleSentence.source || "curated-study-data",
        };
    }

    const matches = sentenceCorpus
        .filter((entry) => entry.kanji === kanji)
        .sort((a, b) => {
            const aReading = a.reading ? 1 : 0;
            const bReading = b.reading ? 1 : 0;
            const readingDiff = bReading - aReading;
            if (readingDiff !== 0) {
                return readingDiff;
            }

            const aFreq = Number.isInteger(a.frequencyRank) ? a.frequencyRank : Number.MAX_SAFE_INTEGER;
            const bFreq = Number.isInteger(b.frequencyRank) ? b.frequencyRank : Number.MAX_SAFE_INTEGER;
            if (aFreq !== bFreq) {
                return aFreq - bFreq;
            }

            return a.japanese.length - b.japanese.length;
        });

    if (matches.length === 0) {
        return null;
    }

    const best = matches[0];
    return {
        type: "corpus",
        japanese: best.japanese,
        reading: best.reading || "",
        english: best.english,
        written: best.written || kanji,
        source: best.source || "local-corpus",
    };
}

function buildOfflineMeaning({ kanji, curatedEntry, sentenceCandidate }) {
    const written = curatedEntry?.preferredWords?.[0] || sentenceCandidate?.written || kanji;
    const englishMeaning = curatedEntry?.englishMeaning || "";

    if (written && englishMeaning) {
        return `${written} ／ ${englishMeaning}`;
    }

    if (englishMeaning) {
        return englishMeaning;
    }

    return written || "";
}

function buildOfflineNotes({ curatedEntry, sentenceCandidate }) {
    if (curatedEntry?.notes) {
        return curatedEntry.notes;
    }

    if (Array.isArray(curatedEntry?.alternativeNotes) && curatedEntry.alternativeNotes.length > 0) {
        return curatedEntry.alternativeNotes.join(" ／ ");
    }

    if (sentenceCandidate?.written && sentenceCandidate?.english) {
        return `Local example uses ${sentenceCandidate.written} to illustrate this kanji.`;
    }

    return "Offline preview built from local data only. Add curated meanings or cached API data for richer output.";
}

function buildOfflineReading(jlptEntry) {
    if (!jlptEntry || typeof jlptEntry !== "object") {
        return "";
    }

    return labelReading(jlptEntry.on_readings, jlptEntry.kun_readings);
}

async function buildOfflineFallbackCard({
    kanji,
    levelLabel,
    jlptEntry,
    curatedStudyData,
    sentenceCorpus,
    kradMap,
    strokeOrderService,
    audioService,
}) {
    const curatedEntry = curatedStudyData[kanji] || null;
    const sentenceCandidate = buildOfflineSentenceCandidate(kanji, curatedEntry, sentenceCorpus);
    const [strokeOrderImagePath, strokeOrderAnimationPath, strokeOrderPath, audioPath] = await Promise.all([
        typeof strokeOrderService?.getStrokeOrderImagePath === "function"
            ? strokeOrderService.getStrokeOrderImagePath(kanji)
            : Promise.resolve(""),
        typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
            ? strokeOrderService.getStrokeOrderAnimationPath(kanji)
            : Promise.resolve(""),
        typeof strokeOrderService?.getBestStrokeOrderPath === "function"
            ? strokeOrderService.getBestStrokeOrderPath(kanji)
            : Promise.resolve(""),
        typeof audioService?.getBestAudioPath === "function"
            ? audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
            : Promise.resolve(""),
    ]);

    return {
        kanji,
        levelLabel,
        previewMode: "offline-local-fallback",
        warning: "Preview rendered from local data because online kanji enrichment was unavailable.",
        meaningJP: buildOfflineMeaning({ kanji, curatedEntry, sentenceCandidate }),
        reading: buildOfflineReading(jlptEntry),
        radical: pickMainComponent(kradMap.get(kanji) || []),
        notes: buildOfflineNotes({ curatedEntry, sentenceCandidate }),
        exampleSentence: formatExampleSentence(sentenceCandidate),
        media: {
            strokeOrderPath,
            strokeOrderImagePath,
            strokeOrderAnimationPath,
            audioPath,
        },
        fields: {
            strokeOrderField: "",
            strokeOrderImageField: "",
            strokeOrderAnimationField: "",
            audioField: "",
        },
    };
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
        const jlptEntry = jlptOnlyJson[kanji] || null;
        const levelLabel = `N${jlptEntry?.jlpt || "?"}`;

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
                levelLabel,
                previewMode: "full-inference",
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
            const fallbackCard = await buildOfflineFallbackCard({
                kanji,
                levelLabel,
                jlptEntry,
                curatedStudyData,
                sentenceCorpus,
                kradMap,
                strokeOrderService,
                audioService,
            });

            fallbackCard.warning = formatPreviewError(err);
            cards.push(fallbackCard);
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
