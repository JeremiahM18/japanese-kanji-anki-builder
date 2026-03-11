const express = require("express");

const { logger } = require("./logger");
const { createInferenceEngine } = require("./inference/inferenceEngine");
const { createExportService } = require("./services/exportService");

function parseLevel(param) {
    const s = String(param).toUpperCase().replace("N", "").trim();
    const n = Number(s);

    if (![1, 2, 3, 4, 5].includes(n)) {
        return null;
    }

    return n;
}

function parseLimit(value) {
    if (value == null) {
        return null;
    }

    const n = Number(value);

    if (!Number.isFinite(n) || n <= 0) {
        return null;
    }

    return Math.floor(n);
}

function createApp({
    config,
    jlptOnlyJson,
    kradMap,
    pickMainComponent,
    kanjiApiClient,
    strokeOrderService,
    audioService,
    sentenceCorpus = [],
    curatedStudyData = {},
    inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData }),
    exportService = createExportService({ inferenceEngine }),
}) {
    const app = express();
    const jlptKanjiCount = Object.keys(jlptOnlyJson).length;

    app.use(express.json());

    app.get("/", (_req, res) => {
        res.type("text").send("OK - Japanese Kanji TSV Exporter");
    });

    app.get("/healthz", (_req, res) => {
        res.status(200).json({
            status: "ok",
            service: "japanese-kanji-builder",
            timestamp: new Date().toISOString(),
        });
    });

    app.get("/readyz", (_req, res) => {
        const metrics = typeof kanjiApiClient.getMetrics === "function"
            ? kanjiApiClient.getMetrics()
            : null;
        const strokeOrderProviderMetrics = typeof strokeOrderService?.getProviderMetrics === "function"
            ? strokeOrderService.getProviderMetrics()
            : null;
        const audioProviderMetrics = typeof audioService?.getProviderMetrics === "function"
            ? audioService.getProviderMetrics()
            : null;

        res.status(200).json({
            status: "ready",
            datasets: {
                jlptKanjiCount,
                kradEntries: kradMap.size,
                sentenceCorpusEntries: sentenceCorpus.length,
                curatedStudyEntries: Object.keys(curatedStudyData).length,
            },
            config: {
                cacheDir: config.cacheDir,
                jlptJsonPath: config.jlptJsonPath,
                kradfilePath: config.kradfilePath,
                sentenceCorpusPath: config.sentenceCorpusPath,
                curatedStudyDataPath: config.curatedStudyDataPath,
                mediaRootDir: config.mediaRootDir,
                strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
                strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
                audioSourceDir: config.audioSourceDir,
                remoteStrokeOrderImageBaseUrl: config.remoteStrokeOrderImageBaseUrl || null,
                remoteStrokeOrderAnimationBaseUrl: config.remoteStrokeOrderAnimationBaseUrl || null,
                remoteAudioBaseUrl: config.remoteAudioBaseUrl || null,
                exportConcurrency: config.exportConcurrency,
                fetchTimeoutMs: config.fetchTimeoutMs,
            },
            cache: metrics,
            mediaProviders: {
                strokeOrder: strokeOrderProviderMetrics,
                audio: audioProviderMetrics,
            },
        });
    });

    app.get("/inference/:kanji", async (req, res, next) => {
        try {
            const inference = await exportService.buildInferenceForKanji({
                kanji: req.params.kanji,
                kanjiApiClient,
                strokeOrderService,
                audioService,
            });

            return res.status(200).json({
                status: "ok",
                inference,
            });
        } catch (err) {
            return next(err);
        }
    });

    app.get("/media/:kanji", async (req, res, next) => {
        try {
            const manifest = await strokeOrderService.getManifest(req.params.kanji);

            if (!manifest) {
                return res.status(404).json({
                    status: "missing",
                    kanji: req.params.kanji,
                });
            }

            return res.status(200).json({
                status: "ok",
                manifest,
                bestStrokeOrderPath: await strokeOrderService.getBestStrokeOrderPath(req.params.kanji),
                strokeOrderImagePath: typeof strokeOrderService?.getStrokeOrderImagePath === "function"
                    ? await strokeOrderService.getStrokeOrderImagePath(req.params.kanji)
                    : "",
                strokeOrderAnimationPath: typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
                    ? await strokeOrderService.getStrokeOrderAnimationPath(req.params.kanji)
                    : "",
                bestAudioPath: typeof audioService?.getBestAudioPath === "function"
                    ? await audioService.getBestAudioPath(req.params.kanji, { category: "kanji-reading", text: req.params.kanji })
                    : "",
            });
        } catch (err) {
            return next(err);
        }
    });

    app.post("/media/:kanji/sync", async (req, res, next) => {
        try {
            const result = await strokeOrderService.syncKanji(req.params.kanji);
            return res.status(200).json({
                status: "ok",
                ...result,
                bestStrokeOrderPath: await strokeOrderService.getBestStrokeOrderPath(req.params.kanji),
                strokeOrderImagePath: typeof strokeOrderService?.getStrokeOrderImagePath === "function"
                    ? await strokeOrderService.getStrokeOrderImagePath(req.params.kanji)
                    : "",
                strokeOrderAnimationPath: typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
                    ? await strokeOrderService.getStrokeOrderAnimationPath(req.params.kanji)
                    : "",
            });
        } catch (err) {
            return next(err);
        }
    });

    app.post("/media/:kanji/audio/sync", async (req, res, next) => {
        try {
            const result = await audioService.syncKanji(req.params.kanji, req.body || {});
            return res.status(200).json({
                status: "ok",
                ...result,
                bestAudioPath: await audioService.getBestAudioPath(req.params.kanji, {
                    category: req.body?.category || "kanji-reading",
                    text: req.body?.text || req.params.kanji,
                    reading: req.body?.reading,
                }),
            });
        } catch (err) {
            return next(err);
        }
    });

    async function handleExportRequest(req, res, next, options = {}) {
        const startedAt = Date.now();

        try {
            const level = parseLevel(req.params.level);
            if (!level) {
                return res.status(400).type("text").send("Invalid level parameter. Use N1-N5 or 1-5.");
            }

            const limit = parseLimit(req.query.limit);
            if (req.query.limit != null && limit == null) {
                return res.status(400).type("text").send("Invalid limit parameter. Must be a positive integer.");
            }

            logger.info(
                {
                    level,
                    limit: limit ?? "all",
                    concurrency: config.exportConcurrency,
                    download: Boolean(options.download),
                },
                "Generating TSV for JLPT level"
            );

            const tsv = await exportService.buildTsvForJlptLevel({
                levelNumber: level,
                jlptOnlyJson,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
                audioService,
                limit,
                concurrency: config.exportConcurrency,
            });

            logger.info(
                {
                    level,
                    limit: limit ?? "all",
                    durationMs: Date.now() - startedAt,
                    rowCount: tsv.split("\n").length - 1,
                    download: Boolean(options.download),
                    cache: typeof kanjiApiClient.getMetrics === "function" ? kanjiApiClient.getMetrics() : undefined,
                },
                "Generated TSV for JLPT level"
            );

            if (options.download) {
                res.setHeader("Content-Disposition", `attachment; filename="jlpt_n${level}_kanji.tsv"`);
            }

            return res
                .status(200)
                .type("text/tab-separated-values; charset=utf-8")
                .send(tsv);
        } catch (err) {
            return next(err);
        }
    }

    app.get("/export/:level", (req, res, next) => handleExportRequest(req, res, next));
    app.get("/export/:level/download", (req, res, next) => handleExportRequest(req, res, next, { download: true }));

    app.use((err, _req, res, _next) => {
        logger.error({ err }, "Error handling request");

        if (process.env.NODE_ENV !== "production") {
            return res.status(500).type("text").send(`Internal Server Error:\n\n${err?.stack || err}`);
        }

        return res.status(500).type("text").send("Internal Server Error");
    });

    return app;
}

module.exports = {
    createApp,
    parseLevel,
    parseLimit,
};
