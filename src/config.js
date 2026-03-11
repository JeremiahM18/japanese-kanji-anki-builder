const path = require("node:path");
const { z } = require("zod");

const schema = z.object({
    port: z.coerce.number().int().positive().default(3719),
    cacheDir: z.string().default("cache"),
    jlptJsonPath: z.string().default("data/kanji_jlpt_only.json"),
    kradfilePath: z.string().default("data/KRADFILE"),
    kanjiApiBaseUrl: z.string().url().default("https://kanjiapi.dev"),
    mediaRootDir: z.string().default("data/media"),
    strokeOrderImageSourceDir: z.string().default("data/media_sources/stroke-order/images"),
    strokeOrderAnimationSourceDir: z.string().default("data/media_sources/stroke-order/animations"),

    // How many kanji to process at once during export generation
    exportConcurrency: z.coerce.number().int().positive().default(8),

    // Timeout for outbound API requests in milliseconds
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
        kanjiApiBaseUrl: process.env.KANJI_API_BASE_URL,
        mediaRootDir: process.env.MEDIA_ROOT_DIR,
        strokeOrderImageSourceDir: process.env.STROKE_ORDER_IMAGE_SOURCE_DIR,
        strokeOrderAnimationSourceDir: process.env.STROKE_ORDER_ANIMATION_SOURCE_DIR,
        exportConcurrency: process.env.EXPORT_CONCURRENCY,
        fetchTimeoutMs: process.env.API_REQUEST_TIMEOUT,
    };

    const parsed = schema.parse(raw);

    return {
        ...parsed,
        cacheDir: resolveFromCwd(parsed.cacheDir),
        jlptJsonPath: resolveFromCwd(parsed.jlptJsonPath),
        kradfilePath: resolveFromCwd(parsed.kradfilePath),
        mediaRootDir: resolveFromCwd(parsed.mediaRootDir),
        strokeOrderImageSourceDir: resolveFromCwd(parsed.strokeOrderImageSourceDir),
        strokeOrderAnimationSourceDir: resolveFromCwd(parsed.strokeOrderAnimationSourceDir),
    };
}

module.exports = {
    loadConfig,
};
