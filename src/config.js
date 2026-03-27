const fs = require("node:fs");
const path = require("node:path");
const { z } = require("zod");

const booleanLike = z.preprocess((value) => {
    if (typeof value === "boolean") {
        return value;
    }

    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }

    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }

    return value;
}, z.boolean());

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
    enableAudio: booleanLike.default(true),
    remoteStrokeOrderImageBaseUrl: z.string().url().optional(),
    remoteStrokeOrderAnimationBaseUrl: z.string().url().optional(),
    remoteAudioBaseUrl: z.string().url().optional(),
    buildOutDir: z.string().default("out/build"),
    exportConcurrency: z.coerce.number().int().positive().default(8),
    fetchTimeoutMs: z.coerce.number().int().positive().default(10000),
});

function resolveFromCwd(cwd, value) {
    return path.resolve(cwd, value);
}

function parseDotEnvValue(rawValue) {
    const trimmed = String(rawValue ?? "").trim();

    if (!trimmed) {
        return "";
    }

    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }

    return trimmed;
}

function parseDotEnvText(text) {
    const env = {};
    const lines = String(text ?? "").split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const equalsIndex = trimmed.indexOf("=");
        if (equalsIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, equalsIndex).trim();
        const value = trimmed.slice(equalsIndex + 1);
        if (!key) {
            continue;
        }

        env[key] = parseDotEnvValue(value);
    }

    return env;
}

function loadDotEnvFile({ cwd = process.cwd(), fileName = ".env" } = {}) {
    const envPath = path.join(cwd, fileName);
    if (!fs.existsSync(envPath)) {
        return {};
    }

    return parseDotEnvText(fs.readFileSync(envPath, "utf-8"));
}

function buildRawConfig(env) {
    return {
        port: env.PORT,
        cacheDir: env.CACHE_DIR,
        jlptJsonPath: env.JLPT_JSON_PATH,
        kradfilePath: env.KRADFILE_PATH,
        sentenceCorpusPath: env.SENTENCE_CORPUS_PATH,
        curatedStudyDataPath: env.CURATED_STUDY_DATA_PATH,
        kanjiApiBaseUrl: env.KANJI_API_BASE_URL,
        mediaRootDir: env.MEDIA_ROOT_DIR,
        strokeOrderImageSourceDir: env.STROKE_ORDER_IMAGE_SOURCE_DIR,
        strokeOrderAnimationSourceDir: env.STROKE_ORDER_ANIMATION_SOURCE_DIR,
        audioSourceDir: env.AUDIO_SOURCE_DIR,
        enableAudio: env.ENABLE_AUDIO,
        remoteStrokeOrderImageBaseUrl: env.REMOTE_STROKE_ORDER_IMAGE_BASE_URL,
        remoteStrokeOrderAnimationBaseUrl: env.REMOTE_STROKE_ORDER_ANIMATION_BASE_URL,
        remoteAudioBaseUrl: env.REMOTE_AUDIO_BASE_URL,
        buildOutDir: env.BUILD_OUT_DIR,
        exportConcurrency: env.EXPORT_CONCURRENCY,
        fetchTimeoutMs: env.API_REQUEST_TIMEOUT,
    };
}

function loadConfig({ cwd = process.cwd(), env = process.env, dotEnvFileName = ".env" } = {}) {
    const dotEnvValues = loadDotEnvFile({ cwd, fileName: dotEnvFileName });
    const mergedEnv = {
        ...dotEnvValues,
        ...env,
    };
    const parsed = schema.parse(buildRawConfig(mergedEnv));

    return {
        ...parsed,
        cacheDir: resolveFromCwd(cwd, parsed.cacheDir),
        jlptJsonPath: resolveFromCwd(cwd, parsed.jlptJsonPath),
        kradfilePath: resolveFromCwd(cwd, parsed.kradfilePath),
        sentenceCorpusPath: resolveFromCwd(cwd, parsed.sentenceCorpusPath),
        curatedStudyDataPath: resolveFromCwd(cwd, parsed.curatedStudyDataPath),
        mediaRootDir: resolveFromCwd(cwd, parsed.mediaRootDir),
        strokeOrderImageSourceDir: resolveFromCwd(cwd, parsed.strokeOrderImageSourceDir),
        strokeOrderAnimationSourceDir: resolveFromCwd(cwd, parsed.strokeOrderAnimationSourceDir),
        audioSourceDir: resolveFromCwd(cwd, parsed.audioSourceDir),
        buildOutDir: resolveFromCwd(cwd, parsed.buildOutDir),
    };
}

module.exports = {
    buildRawConfig,
    loadConfig,
    loadDotEnvFile,
    parseDotEnvText,
    parseDotEnvValue,
};
