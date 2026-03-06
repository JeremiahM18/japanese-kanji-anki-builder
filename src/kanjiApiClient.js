const fs = require('fs');
const path = require('path');
const { encode } = require('punycode');

function ensureDir(p) {
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
    }
}

function safeKey(s) {
    return encodeURIComponent(s).replace(/%/g, '_');
}

async function readJsonIfExists(filePath) {
    try {
        const text = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(text);
    } catch (err) {
        if (err && err.code === 'ENOENT') {
            return null;
        }
        throw err;
    }
}

async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

async function fetchJsonWithTimeout(url, timeout) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Failed to fetch ${res.status} ${url} ${body}`);
        }

        return await res.json();
    } catch (err) {
        if (err && err.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeout} ms: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function createKanjiApiClient({ baseUrl, cacheDir, timeoutMs = 10000 }) {
    const inFlight = new Map();

    async function fetchCachedJson({ cacheKey, url }) {
        await ensureDir(cacheDir);
        const filePath = path.join(cacheDir, `${cacheKey}.json`);

        const cached = await readJsonIfExists(filePath);
        if (cached !== null) {
            return cached;
        }

        if (inFlight.has(cacheKey)) {
            return inFlight.get(cacheKey);
        }

        const promise = (async () => {
            const data = await fetchJsonWithTimeout(url, fetchTimeoutMs);
            await writeJson(filePath, data);
            return data;
        })();

        inFlight.set(cacheKey, promise);

        try {
            return await promise;
        } finally {
            inFlight.delete(cacheKey);
        }
    }

    return {
        async getKanji(kanji) {
            const url = `${baseUrl}/v1/kanji/${encodeURIComponent(kanji)}`;
            return fetchCachedJson({
                cacheKey: `kanji_${safeKey(kanji)}`,
                url,
            });
        },

        async getWords(kanji) {
            const url = `${baseUrl}/v1/words/${encodeURIComponent(kanji)}`;
            return fetchCachedJson({
                cacheKey: `words_${safeKey(kanji)}`,
                url,
            });
        },
    };
}

module.exports = {
    createKanjiApiClient,
};