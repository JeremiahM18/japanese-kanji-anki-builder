const { z } = require('zod');

const schema = z.object({
    port: z.coerce.number().int().positive().default(3719),
    cacheDir: z.string().default('cache'),
    jlptJsonPath: z.string().default('data/kanji_jlpt_only.json'),
    kradfilePath: z.string().default('data/KRADFILE'),
    kanjiApiBaseUrl: z.string().url().default('https://kanjiapi.dev'),
});

function loadConfig() {
    // simple env support without adding dotenv
    const raw = {
        port: process.env.PORT,
        cacheDir: process.env.CACHE_DIR,
        jlptJsonPath: process.env.JLPT_JSON_PATH,
        kradfilePath: process.env.KRADFILE_PATH,
        kanjiApiBaseUrl: process.env.KANJI_API_BASE_URL,
    };
    
    return schema.parse(raw);
}

module.exports = {
    loadConfig,
};