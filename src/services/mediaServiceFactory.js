const { createRemoteHttpProvider } = require("./mediaProviders");
const { AUDIO_EXTENSIONS, buildAudioFileCandidates, createAudioService } = require("./audioService");
const { ANIMATION_EXTENSIONS, IMAGE_EXTENSIONS, buildKanjiFileCandidates, createStrokeOrderService } = require("./strokeOrderService");

function createMediaServices(config) {
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

    return {
        strokeOrderService: createStrokeOrderService({
            mediaRootDir: config.mediaRootDir,
            imageSourceDir: config.strokeOrderImageSourceDir,
            animationSourceDir: config.strokeOrderAnimationSourceDir,
            imageProviders,
            animationProviders,
        }),
        audioService: createAudioService({
            mediaRootDir: config.mediaRootDir,
            audioSourceDir: config.audioSourceDir,
            providers: audioProviders,
        }),
    };
}

module.exports = {
    createMediaServices,
};
