const fs = require("fs");
const express = require("express");

const { loadConfig } = require('./config');
const { logger } = require('./logger');
const { createKanjiApiClient } = require('./kanjiApiClient');
const { loadKradMap, pickMainComponent } = require('./kradfile');
const { buildTsvForJlptLevel } = require('./exportService');

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

(async function main() {
    const config = loadConfig();

    // Load local datasets at startup (fail fast)
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, 'utf-8'));
    const kradMap = loadKradMap(config.kradfilePath);

    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    const app = express();

    app.get("/", (req, res) => {
        res.type("text").send("OK - Japanese Kanji TSV Exporter");
    });

    // GET /export/N5 or /export/5
    // Optional: ?limit=50 
    // Optional: ?download=1 to trigger download with Content-Disposition
    app.get("/export/:level", async (req, res, next) => {
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
                },
                "Generated TSV for JLPT level"
            );

            res.status(200)
            .type("text/tab-separated-values; charset=utf-8")
            .send(tsv);
        } catch (err) {
            next(err);
        }
    });

    app.get("/export/:level/download", async (req, res, next) => {
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
                }, 
                "Generating TSV for JLPT level with download"
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
                },
                "Generated TSV for JLPT level with download"
            );

            // Force browser download
            res.setHeader("Content-Disposition", `attachment; filename="jlpt_n${lvl}_kanji.tsv"`);

            res.status(200)
            .type("text/tab-separated-values; charset=utf-8")
            .send(tsv);
        } catch (err) {
            next(err);
        }    
    });


    // Central error handler
    app.use((err, req, res, next) => {
        logger.error({ err }, "Error handling request");

        const isDev = process.env.NODE_ENV !== 'production';
        if (isDev) {
            return res.status(500).type("text").send(`Internal Server Error:\n\n${err?.stack || err}`);
        }

        res.status(500).type("text").send("Internal Server Error");
    });

    app.listen(config.port, () => {
        logger.info(
            {
                 port: config.port,
                 exportConcurrency: config.exportConcurrency,
                 fetchTimeoutMs: config.fetchTimeoutMs,
            }, 
            "Server started"
        );

        logger.info(`Try: http://127.0.0.1:${config.port}/export/N5`);
        logger.info(`Download: http://127.0.0.1:${config.port}/export/N5/download`);
        logger.info(`Limit test: http://127.0.0.1:${config.port}/export/N5?limit=10`);
    });
})().catch(err => {
    logger.error({ err }, "Fatal error during startup");
    process.exit(1);
});