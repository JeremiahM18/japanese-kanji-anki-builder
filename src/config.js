const path = require("node:path");
const { z } = require("zod");

const schema = z.object({
    port: z.coerce.number().int().positive().default(3719),
    cacheDir: z.string().default("cache"),
    jlptJsonPath: z.string().default("data/kanji_jlpt_only.json"),
    kradfilePath: z.string().default("data/KRADFILE"),
    sentenceCorpusPath: z.string().default("data/sentence_corpus.json"),
    curatedStudyDataPath: z.string().default("data/curated_study_data.json"),
    kanjiApiBaseUrl: z.string().url().default("https://kanjiapi.dev"),
    mediaRootDir: z.string().default("data/media"),
    strokeOrderImageSourceDir: z.string().default("data/media_sources/stroke-order/images"),
    strokeOrderAnimationSourceDir: z.string().default("data/media_sources/stroke-order/animations"),
    audioSourceDir: z.string().default("data/media_sources/audio"),
    remoteStrokeOrderImageBaseUrl: z.string().url().optional(),
    remoteStrokeOrderAnimationBaseUrl: z.string().url().optional(),
    remoteAudioBaseUrl: z.string().url().optional(),
    buildOutDir: z.string().default("out/build"),
    exportConcurrency: z.coerce.number().int().positive().default(8),
    fetchTimeoutMs: z.coerce.number().int().positive().default(10000),
});

function resolveFromCwd(value) {
    return path.resolve(process.cwd(), value);
}

function loadConfig() {
    const raw = {
        port: process.env.PORT,
        cacheDir: process.env.CACHE_DIR,
        jlptJsonPath: process.env.JLPT_JSON_PATH,
        kradfilePath: process.env.KRADFILE_PATH,
        sentenceCorpusPath: process.env.SENTENCE_CORPUS_PATH,
        curatedStudyDataPath: process.env.CURATED_STUDY_DATA_PATH,
        kanjiApiBaseUrl: process.env.KANJI_API_BASE_URL,
        mediaRootDir: process.env.MEDIA_ROOT_DIR,
        strokeOrderImageSourceDir: process.env.STROKE_ORDER_IMAGE_SOURCE_DIR,
        strokeOrderAnimationSourceDir: process.env.STROKE_ORDER_ANIMATION_SOURCE_DIR,
        audioSourceDir: process.env.AUDIO_SOURCE_DIR,
        remoteStrokeOrderImageBaseUrl: process.env.REMOTE_STROKE_ORDER_IMAGE_BASE_URL,
        remoteStrokeOrderAnimationBaseUrl: process.env.REMOTE_STROKE_ORDER_ANIMATION_BASE_URL,
        remoteAudioBaseUrl: process.env.REMOTE_AUDIO_BASE_URL,
        buildOutDir: process.env.BUILD_OUT_DIR,
        exportConcurrency: process.env.EXPORT_CONCURRENCY,
        fetchTimeoutMs: process.env.API_REQUEST_TIMEOUT,
    };

    const parsed = schema.parse(raw);

    return {
        ...parsed,
        cacheDir: resolveFromCwd(parsed.cacheDir),
        jlptJsonPath: resolveFromCwd(parsed.jlptJsonPath),
        kradfilePath: resolveFromCwd(parsed.kradfilePath),
        sentenceCorpusPath: resolveFromCwd(parsed.sentenceCorpusPath),
        curatedStudyDataPath: resolveFromCwd(parsed.curatedStudyDataPath),
        mediaRootDir: resolveFromCwd(parsed.mediaRootDir),
        strokeOrderImageSourceDir: resolveFromCwd(parsed.strokeOrderImageSourceDir),
        strokeOrderAnimationSourceDir: resolveFromCwd(parsed.strokeOrderAnimationSourceDir),
        audioSourceDir: resolveFromCwd(parsed.audioSourceDir),
        buildOutDir: resolveFromCwd(parsed.buildOutDir),
    };
}

module.exports = {
    loadConfig,
};
