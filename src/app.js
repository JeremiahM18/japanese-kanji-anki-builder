const express = require("express");

const { logger } = require("./logger");
const { buildTsvForJlptLevel } = require("./services/exportService");

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

function createApp({ config, jlptOnlyJson, kradMap, pickMainComponent, kanjiApiClient, strokeOrderService }) {
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

        res.status(200).json({
            status: "ready",
            datasets: {
                jlptKanjiCount,
                kradEntries: kradMap.size,
            },
            config: {
                cacheDir: config.cacheDir,
                jlptJsonPath: config.jlptJsonPath,
                kradfilePath: config.kradfilePath,
                mediaRootDir: config.mediaRootDir,
                strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
                strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
                exportConcurrency: config.exportConcurrency,
                fetchTimeoutMs: config.fetchTimeoutMs,
            },
            cache: metrics,
        });
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

            const tsv = await buildTsvForJlptLevel({
                levelNumber: level,
                jlptOnlyJson,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                strokeOrderService,
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
