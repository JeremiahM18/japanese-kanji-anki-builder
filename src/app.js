const express = require("express");

const { logger } = require("./logger");
const { buildTsvForJlptLevel } = require("./exportService");

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

function createApp({ config, jlptOnlyJson, kradMap, pickMainComponent, kanjiApiClient }) {
    const app = express();
    const jlptKanjiCount = Object.keys(jlptOnlyJson).length;

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
                exportConcurrency: config.exportConcurrency,
                fetchTimeoutMs: config.fetchTimeoutMs,
            },
        });
    });

    async function handleExportRequest(req, res, next, options = {}) {
        const startedAt = Date.now();

        try {
            const lvl = parseLevel(req.params.level);
            if (!lvl) {
                return res.status(400).type("text").send("Invalid level parameter. Use N1-N5 or 1-5.");
            }

            const limit = parseLimit(req.query.limit);
            if (req.query.limit != null && limit == null) {
                return res.status(400).type("text").send("Invalid limit parameter. Must be a positive integer.");
            }

            logger.info(
                {
                    level: lvl,
                    limit: limit ?? "all",
                    concurrency: config.exportConcurrency,
                    download: Boolean(options.download),
                },
                "Generating TSV for JLPT level"
            );

            const tsv = await buildTsvForJlptLevel({
                levelNumber: lvl,
                jlptOnlyJson,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
                limit,
                concurrency: config.exportConcurrency,
            });

            logger.info(
                {
                    level: lvl,
                    limit: limit ?? "all",
                    durationMs: Date.now() - startedAt,
                    rowCount: tsv.split("\n").length - 1,
                    download: Boolean(options.download),
                },
                "Generated TSV for JLPT level"
            );

            if (options.download) {
                res.setHeader("Content-Disposition", `attachment; filename="jlpt_n${lvl}_kanji.tsv"`);
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

        const isDev = process.env.NODE_ENV !== "production";
        if (isDev) {
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
