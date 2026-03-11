const fs = require("node:fs");

const { loadConfig } = require("./config");
const { logger } = require("./logger");
const { createKanjiApiClient } = require("./clients/kanjiApiClient");
const { loadCuratedStudyData } = require("./datasets/curatedStudyData");
const { loadKradMap, pickMainComponent } = require("./datasets/kradfile");
const { loadSentenceCorpus } = require("./datasets/sentenceCorpus");
const { ensureMediaRoot } = require("./services/mediaStore");
const { createRemoteHttpProvider } = require("./services/mediaProviders");
const { AUDIO_EXTENSIONS, buildAudioFileCandidates, createAudioService } = require("./services/audioService");
const { IMAGE_EXTENSIONS, ANIMATION_EXTENSIONS, buildKanjiFileCandidates, createStrokeOrderService } = require("./services/strokeOrderService");
const { createInferenceEngine } = require("./inference/inferenceEngine");
const { createApp } = require("./app");

async function main() {
    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(config.kradfilePath)) {
        throw new Error(`Missing KRADFILE at ${config.kradfilePath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kradMap = loadKradMap(config.kradfilePath);
    const sentenceCorpus = loadSentenceCorpus(config.sentenceCorpusPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);

    const kanjiApiClient = createKanjiApiClient({
        baseUrl: config.kanjiApiBaseUrl,
        cacheDir: config.cacheDir,
        fetchTimeoutMs: config.fetchTimeoutMs,
    });

    ensureMediaRoot(config.mediaRootDir);

    const imageProviders = [
        ...(config.remoteStrokeOrderImageBaseUrl ? [createRemoteHttpProvider({
            name: "remote-stroke-order-image",
            baseUrl: config.remoteStrokeOrderImageBaseUrl,
            extensionMap: IMAGE_EXTENSIONS,
            buildCandidates: (input) => buildKanjiFileCandidates(input),
            fetchTimeoutMs: config.fetchTimeoutMs,
        })] : []),
    ];
    const animationProviders = [
        ...(config.remoteStrokeOrderAnimationBaseUrl ? [createRemoteHttpProvider({
            name: "remote-stroke-order-animation",
            baseUrl: config.remoteStrokeOrderAnimationBaseUrl,
            extensionMap: ANIMATION_EXTENSIONS,
            buildCandidates: (input) => buildKanjiFileCandidates(input),
            fetchTimeoutMs: config.fetchTimeoutMs,
        })] : []),
    ];
    const audioProviders = [
        ...(config.remoteAudioBaseUrl ? [createRemoteHttpProvider({
            name: "remote-audio",
            baseUrl: config.remoteAudioBaseUrl,
            extensionMap: AUDIO_EXTENSIONS,
            buildCandidates: buildAudioFileCandidates,
            fetchTimeoutMs: config.fetchTimeoutMs,
        })] : []),
    ];

    const strokeOrderService = createStrokeOrderService({
        mediaRootDir: config.mediaRootDir,
        imageSourceDir: config.strokeOrderImageSourceDir,
        animationSourceDir: config.strokeOrderAnimationSourceDir,
        imageProviders,
        animationProviders,
    });
    const audioService = createAudioService({
        mediaRootDir: config.mediaRootDir,
        audioSourceDir: config.audioSourceDir,
        providers: audioProviders,
    });

    const inferenceEngine = createInferenceEngine({ sentenceCorpus, curatedStudyData });

    const app = createApp({
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

    app.listen(config.port, () => {
        logger.info(
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

        logger.info(`Try: http://127.0.0.1:${config.port}/export/N5`);
        logger.info(`Download: http://127.0.0.1:${config.port}/export/N5/download`);
        logger.info(`Health: http://127.0.0.1:${config.port}/healthz`);
        logger.info(`Readiness: http://127.0.0.1:${config.port}/readyz`);
        logger.info(`Inference: http://127.0.0.1:${config.port}/inference/日`);
        logger.info(`Media lookup: http://127.0.0.1:${config.port}/media/日`);
        logger.info(`Audio sync: http://127.0.0.1:${config.port}/media/日/audio/sync`);
    });
}

main().catch((err) => {
    logger.error({ err }, "Fatal error during startup");
    process.exit(1);
});
