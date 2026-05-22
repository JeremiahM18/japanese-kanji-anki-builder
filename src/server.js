const fs = require("node:fs");

const { loadConfig } = require("./config");
const { logger } = require("./logger");
const { createKanjiApiClient } = require("./clients/kanjiApiClient");
const { loadCuratedStudyData } = require("./datasets/curatedStudyData");
const { loadJlptOnlyJson } = require("./datasets/jlptOnlyJson");
const { loadGovernedComponentMap, pickMainComponent } = require("./datasets/kradfile");
const { loadSentenceCorpus } = require("./datasets/sentenceCorpus");
const { ensureMediaRoot } = require("./services/mediaStore");
const { createMediaServices } = require("./services/mediaServiceFactory");
const { createInferenceEngine } = require("./inference/inferenceEngine");
const { createExportService } = require("./services/exportService");
const { createApp } = require("./app");

function getDisplayHost(host) {
    return ["0.0.0.0", "::"].includes(host) ? "127.0.0.1" : host;
}

function logServerStarted({ logger: runtimeLogger, config, sentenceCorpus, curatedStudyData }) {
    const baseUrl = `http://${getDisplayHost(config.serverHost)}:${config.port}`;

    runtimeLogger.info(
        {
            port: config.port,
            host: config.serverHost,
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
            remoteStrokeOrderAnimCjkBaseUrl: config.remoteStrokeOrderAnimCjkBaseUrl || null,
            remoteAudioBaseUrl: config.remoteAudioBaseUrl || null,
            urls: {
                exportN5: `${baseUrl}/export/N5`,
                downloadN5: `${baseUrl}/export/N5/download`,
                health: `${baseUrl}/healthz`,
                readiness: `${baseUrl}/readyz`,
                inference: `${baseUrl}/inference/日`,
                mediaLookup: `${baseUrl}/media/日`,
                audioSync: `${baseUrl}/media/日/audio/sync`,
            },
        },
        "Server started"
    );
}

function listenAsync(app, port, host = "127.0.0.1") {
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
    loadKradMapFn = loadGovernedComponentMap,
    loadSentenceCorpusFn = loadSentenceCorpus,
    ensureMediaRootFn = ensureMediaRoot,
    createMediaServicesFn = createMediaServices,
    createInferenceEngineFn = createInferenceEngine,
    createExportServiceFn = createExportService,
    createAppFn = createApp,
} = {}) {
    const config = loadConfigFn();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!config.kanjiComponentContractPath && !config.kradfilePath) {
        throw new Error("Missing kanji component source configuration.");
    }
    if (!fs.existsSync(config.kanjiComponentContractPath || "") && !fs.existsSync(config.kradfilePath || "")) {
        throw new Error(`Missing kanji component contract at ${config.kanjiComponentContractPath} and KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const kradMap = loadKradMapFn === loadGovernedComponentMap
        ? loadKradMapFn({
            kanjiComponentContractPath: config.kanjiComponentContractPath,
            kradfilePath: config.kradfilePath,
        })
        : loadKradMapFn(config.kradfilePath);
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
    const exportService = createExportServiceFn({ inferenceEngine, sentenceCorpus, curatedStudyData });

    const app = createAppFn({
        config,
        jlptOnlyJson,
        kradMap,
        pickMainComponent,
        kanjiApiClient,
        strokeOrderService,
        audioService,
        exportService,
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
    const server = await listenFn(runtime.app, runtime.config.port, runtime.config.serverHost);

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
    getDisplayHost,
    installSignalHandlers,
    listenAsync,
    logServerStarted,
    main,
};
