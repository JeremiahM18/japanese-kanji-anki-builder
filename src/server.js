const fs = require("node:fs");

const { loadConfig } = require("./config");
const { logger } = require("./logger");
const { createKanjiApiClient } = require("./kanjiApiClient");
const { loadKradMap, pickMainComponent } = require("./kradfile");
const { ensureMediaRoot } = require("./mediaStore");
const { createStrokeOrderService } = require("./strokeOrderService");
const { createApp } = require("./app");

async function main() {
    const config = loadConfig();

    // Load local datasets at startup so the process fails fast when data is missing.
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kradMap = loadKradMap(config.kradfilePath);

    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    // Create the media root eagerly so future stroke-order and audio assets have a stable home.
    ensureMediaRoot(config.mediaRootDir);

    const strokeOrderService = createStrokeOrderService({
        mediaRootDir: config.mediaRootDir,
        imageSourceDir: config.strokeOrderImageSourceDir,
        animationSourceDir: config.strokeOrderAnimationSourceDir,
    });

    const app = createApp({
        config,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
    });

    app.listen(config.port, () => {
        logger.info(
            {
                port: config.port,
                exportConcurrency: config.exportConcurrency,
                fetchTimeoutMs: config.fetchTimeoutMs,
                cacheDir: config.cacheDir,
                mediaRootDir: config.mediaRootDir,
                strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
                strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
            },
            "Server started"
        );

        logger.info(`Try: http://127.0.0.1:${config.port}/export/N5`);
        logger.info(`Download: http://127.0.0.1:${config.port}/export/N5/download`);
        logger.info(`Health: http://127.0.0.1:${config.port}/healthz`);
        logger.info(`Readiness: http://127.0.0.1:${config.port}/readyz`);
        logger.info(`Media lookup: http://127.0.0.1:${config.port}/media/日`);
    });
}

main().catch((err) => {
    logger.error({ err }, "Fatal error during startup");
    process.exit(1);
});
