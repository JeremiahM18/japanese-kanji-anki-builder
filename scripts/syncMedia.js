const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { createRemoteHttpProvider } = require("../src/services/mediaProviders");
const { AUDIO_EXTENSIONS, buildAudioFileCandidates, createAudioService } = require("../src/services/audioService");
const { ANIMATION_EXTENSIONS, IMAGE_EXTENSIONS, buildKanjiFileCandidates, createStrokeOrderService } = require("../src/services/strokeOrderService");
const { ensureMediaRoot } = require("../src/services/mediaStore");
const { parseLevelArgument, selectKanjiForSync, syncMediaForKanjiList } = require("../src/services/mediaSync");

function parseArgs(argv) {
    const options = {
        level: null,
        limit: null,
        concurrency: null,
        kanji: [],
        audioReading: null,
        audioVoice: null,
        audioLocale: null,
    };

    for (const arg of argv) {
        if (arg.startsWith("--level=")) {
            options.level = parseLevelArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--concurrency=")) {
            options.concurrency = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = arg.split("=")[1].split(",").map((item) => item.trim()).filter(Boolean);
        } else if (arg.startsWith("--audio-reading=")) {
            options.audioReading = arg.split("=")[1];
        } else if (arg.startsWith("--audio-voice=")) {
            options.audioVoice = arg.split("=")[1];
        } else if (arg.startsWith("--audio-locale=")) {
            options.audioLocale = arg.split("=")[1];
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kanjiList = selectKanjiForSync({
        jlptOnlyJson,
        level: options.level,
        limit: options.limit,
        kanji: options.kanji,
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

    const concurrency = options.concurrency || config.exportConcurrency;
    const { results, summary } = await syncMediaForKanjiList({
        kanjiList,
        strokeOrderService,
        audioService,
        concurrency,
        audioMetadata: {
            reading: options.audioReading || undefined,
            voice: options.audioVoice || undefined,
            locale: options.audioLocale || undefined,
        },
    });

    console.log(JSON.stringify({
        scope: {
            level: options.level,
            limit: options.limit,
            kanji: options.kanji,
            concurrency,
            count: kanjiList.length,
        },
        summary,
        sample: results.slice(0, 10),
    }, null, 2));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
