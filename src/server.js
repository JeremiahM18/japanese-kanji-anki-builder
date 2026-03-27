const fs = require("node:fs");

const { loadConfig } = require("./config");
const { logger } = require("./logger");
const { createKanjiApiClient } = require("./clients/kanjiApiClient");
const { loadCuratedStudyData } = require("./datasets/curatedStudyData");
const { loadKradMap, pickMainComponent } = require("./datasets/kradfile");
const { loadSentenceCorpus } = require("./datasets/sentenceCorpus");
const { ensureMediaRoot } = require("./services/mediaStore");
const { createMediaServices } = require("./services/mediaServiceFactory");
const { createInferenceEngine } = require("./inference/inferenceEngine");
const { createApp } = require("./app");

function logServerStarted({ logger: runtimeLogger, config, sentenceCorpus, curatedStudyData }) {
    runtimeLogger.info(
        {
            port: config.port,
            exportConcurrency: config.exportConcurrency,
            fetchTimeoutMs: config.fetchTimeoutMs,
            cacheDir: config.cacheDir,
            sentenceCorpusPath: config.sentenceCorpusPath,
            sentenceCorpusEntries: sentenceCorpus.length,
            curatedStudyDataPath: config.curatedStudyDataPath,
            curatedStudyDataEntries: Object.keys(curatedStudyData).length,
            mediaRootDir: config.mediaRootDir,
            strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
            strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
            audioSourceDir: config.audioSourceDir,
            remoteStrokeOrderImageBaseUrl: config.remoteStrokeOrderImageBaseUrl || null,
            remoteStrokeOrderAnimationBaseUrl: config.remoteStrokeOrderAnimationBaseUrl || null,
            remoteAudioBaseUrl: config.remoteAudioBaseUrl || null,
        },
        "Server started"
    );

    runtimeLogger.info(`Try: http://127.0.0.1:${config.port}/export/N5`);
    runtimeLogger.info(`Download: http://127.0.0.1:${config.port}/export/N5/download`);
    runtimeLogger.info(`Health: http://127.0.0.1:${config.port}/healthz`);
    runtimeLogger.info(`Readiness: http://127.0.0.1:${config.port}/readyz`);
    runtimeLogger.info(`Inference: http://127.0.0.1:${config.port}/inference/日`);
    runtimeLogger.info(`Media lookup: http://127.0.0.1:${config.port}/media/日`);
    runtimeLogger.info(`Audio sync: http://127.0.0.1:${config.port}/media/日/audio/sync`);
}

function listenAsync(app, port, host = "0.0.0.0") {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, host);

        function handleListening() {
            server.off("error", handleError);
            resolve(server);
        }

        function handleError(error) {
            server.off("listening", handleListening);
            reject(error);
        }

        server.once("listening", handleListening);
        server.once("error", handleError);
    });
}

function closeServerAsync(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function installSignalHandlers({ signals = ["SIGINT", "SIGTERM"], onSignal, on = process.on.bind(process), off = process.off.bind(process) }) {
    const installed = [];

    for (const signal of signals) {
        const handler = () => onSignal(signal);
        on(signal, handler);
        installed.push({ signal, handler });
    }

    return () => {
        for (const entry of installed) {
            off(entry.signal, entry.handler);
        }
    };
}

function createShutdownController({
    server,
    logger: runtimeLogger,
    closeServer = closeServerAsync,
    cleanupSignalHandlers = () => {},
    exitFn = null,
    shutdownTimeoutMs = 10000,
}) {
    let shutdownPromise = null;

    return {
        async shutdown({ signal = null, exitCode = 0 } = {}) {
            if (shutdownPromise) {
                return shutdownPromise;
            }

            shutdownPromise = (async () => {
                cleanupSignalHandlers();

                if (signal) {
                    runtimeLogger.info({ signal, timeoutMs: shutdownTimeoutMs }, "Shutdown signal received");
                } else {
                    runtimeLogger.info({ timeoutMs: shutdownTimeoutMs }, "Shutdown requested");
                }

                let timeout = null;
                try {
                    await Promise.race([
                        closeServer(server),
                        new Promise((_, reject) => {
                            timeout = setTimeout(() => {
                                reject(new Error(`Server shutdown timed out after ${shutdownTimeoutMs} ms`));
                            }, shutdownTimeoutMs);
                        }),
                    ]);
                    runtimeLogger.info("Server stopped cleanly");
                } catch (error) {
                    runtimeLogger.error({ err: error }, "Graceful shutdown failed");
                    if (exitFn) {
                        exitFn(1);
                    }
                    throw error;
                } finally {
                    if (timeout) {
                        clearTimeout(timeout);
                    }
                }

                if (signal && exitFn) {
                    exitFn(exitCode);
                }
            })();

            return shutdownPromise;
        },
    };
}

async function buildRuntime({
    loadConfigFn = loadConfig,
    createKanjiApiClientFn = createKanjiApiClient,
    loadCuratedStudyDataFn = loadCuratedStudyData,
    loadKradMapFn = loadKradMap,
    loadSentenceCorpusFn = loadSentenceCorpus,
    ensureMediaRootFn = ensureMediaRoot,
    createMediaServicesFn = createMediaServices,
    createInferenceEngineFn = createInferenceEngine,
    createAppFn = createApp,
} = {}) {
    const config = loadConfigFn();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kradMap = loadKradMapFn(config.kradfilePath);
    const sentenceCorpus = loadSentenceCorpusFn(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyDataFn(config.curatedStudyDataPath);

    const kanjiApiClient = createKanjiApiClientFn({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    ensureMediaRootFn(config.mediaRootDir);

    const { strokeOrderService, audioService } = createMediaServicesFn(config);
    const inferenceEngine = createInferenceEngineFn({ sentenceCorpus, curatedStudyData });

    const app = createAppFn({
        config,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        inferenceEngine,
        sentenceCorpus,
        curatedStudyData,
    });

    return {
        app,
        config,
        sentenceCorpus,
        curatedStudyData,
    };
}

async function main({
    logger: runtimeLogger = logger,
    listenFn = listenAsync,
    installSignalHandlersFn = installSignalHandlers,
    createShutdownControllerFn = createShutdownController,
    exitFn = process.exit.bind(process),
} = {}) {
    const runtime = await buildRuntime();
    const server = await listenFn(runtime.app, runtime.config.port);

    let shutdownController = null;
    const cleanupSignalHandlers = installSignalHandlersFn({
        onSignal: (signal) => {
            if (shutdownController) {
                shutdownController.shutdown({ signal, exitCode: 0 }).catch(() => {});
            }
        },
    });

    shutdownController = createShutdownControllerFn({
        server,
        logger: runtimeLogger,
        cleanupSignalHandlers,
        exitFn,
    });

    logServerStarted({
        logger: runtimeLogger,
        config: runtime.config,
        sentenceCorpus: runtime.sentenceCorpus,
        curatedStudyData: runtime.curatedStudyData,
    });

    return {
        ...runtime,
        server,
        shutdown: shutdownController.shutdown,
        cleanupSignalHandlers,
    };
}

if (require.main === module) {
    main().catch((err) => {
        logger.error({ err }, "Fatal error during startup");
        process.exit(1);
    });
}

module.exports = {
    buildRuntime,
    closeServerAsync,
    createShutdownController,
    installSignalHandlers,
    listenAsync,
    logServerStarted,
    main,
};
