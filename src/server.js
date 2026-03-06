const fs = require('fs');
const express = require('express');

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
    });

    const app = express();

    app.get("/", (req, res) => {
        res.type("text").send("OK - Japanese Kanji TSV Exporter");
    });

    // GET /export/N5 or /export/5
    app.get("/export/:level", async (req, res, next) => {
        try {
            const lvl = parseLevel(req.params.level);
            if (!lvl) {
                return res.status(400).type("text").send("Invalid level parameter. Use N1-N5 or 1-5.");
            }

            logger.info({ level: lvl }, "Generating TSV for JLPT level");

            const tsv = await buildTsvForJlptLevel({
                levelNumber: lvl,
                jlptOnlyJson,
                kradMap,
                pickMainComponent,
                kanjiApiClient,
            });

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
        res.status(500).type("text").send("Internal Server Error");
    });

    app.listen(config.port, () => {
        logger.info({ port: config.port }, "Server started");
        logger.info(`Try: http://localhost:${config.port}/export/N5`);
    });
})().catch(err => {
    logger.error({ err }, "Fatal error during startup");
    process.exit(1);
});