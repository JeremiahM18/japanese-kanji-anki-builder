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

async function fetchCachedJson({ cacheDir, cacheKey, url }) {
    ensureDir(cacheDir);
    const fp = path.join(cacheDir, `${cacheKey}.json`);

    if (fs.existsSync(fp)) {
        return JSON.parse(fs.readFileSync(fp, 'utf-8'));
    }

    const res = await fetch(url);
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Failed to fetch ${res.status} ${url} ${body}`);
    }

    const data = await res.json();
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
    return data;
}

function createKanjiApiClient({ baseUrl, cacheDir }) {
    return {
        async getKanji(kanji) {
            const url = `${baseUrl}/v1/kanji/${encodeURIComponent(kanji)}`;
            return fetchCachedJson({
                cacheDir,
                cacheKey: `kanji_${safeKey(kanji)}`,
                url,
            });
        },

        async getWords(kanji) {
            const url = `${baseUrl}/v1/words/${encodeURIComponent(kanji)}`;
            return fetchCachedJson({
                cacheDir,
                cacheKey: `words_${safeKey(kanji)}`,
                url,
            });
        },
    };
}

module.exports = {
    createKanjiApiClient,
};