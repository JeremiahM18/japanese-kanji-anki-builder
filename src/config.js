const { z } = require('zod');

const schema = z.object({
    port: z.coerce.number().int().positive().default(3719),
    cacheDir: z.string().default('cache'),
    jlptJsonPath: z.string().default('data/kanji_jlpt_only.json'),
    kradfilePath: z.string().default('data/KRADFILE'),
    kanjiApiBaseUrl: z.string().url().default('https://kanjiapi.dev'),

    // How many kanji to process at once during export generation
    exportConcurrency: z.coerce.number().int().positive().default(8),

    // Timout for outbound API requests in milliseconds
    apiRequestTimeout: z.coerce.number().int().positive().default(10000),
});

function loadConfig() {
    const raw = {
        port: process.env.PORT,
        cacheDir: process.env.CACHE_DIR,
        jlptJsonPath: process.env.JLPT_JSON_PATH,
        kradfilePath: process.env.KRADFILE_PATH,
        kanjiApiBaseUrl: process.env.KANJI_API_BASE_URL,
        exportConcurrency: process.env.EXPORT_CONCURRENCY,
        apiRequestTimeout: process.env.API_REQUEST_TIMEOUT,
    };
    
    return schema.parse(raw);
}

module.exports = {
    loadConfig,
};