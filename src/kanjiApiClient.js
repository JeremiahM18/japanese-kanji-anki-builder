const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { z } = require("zod");

const kanjiPayloadSchema = z.object({
    kanji: z.string().min(1).optional(),
    meanings: z.array(z.string()).default([]),
    on_readings: z.array(z.string()).default([]),
    kun_readings: z.array(z.string()).default([]),
}).passthrough();

const wordVariantSchema = z.object({
    written: z.string().min(1),
    pronounced: z.string().min(1),
    priorities: z.array(z.string()).default([]),
}).passthrough();

const wordMeaningSchema = z.object({
    glosses: z.array(z.string()).min(1),
}).passthrough();

const wordsPayloadSchema = z.array(z.object({
    variants: z.array(wordVariantSchema).default([]),
    meanings: z.array(wordMeaningSchema).default([]),
}).passthrough());

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function safeKey(value) {
    return encodeURIComponent(value).replace(/%/g, "_");
}

function buildCacheFilePath(cacheDir, cacheKey) {
    const shard = cacheKey.slice(0, 2) || "__";
    return path.join(cacheDir, shard, `${cacheKey}.json`);
}

function createEmptyClientMetrics() {
    return {
        cacheHits: 0,
        cacheMisses: 0,
        networkFetches: 0,
        cacheWrites: 0,
        payloadValidationFailures: 0,
    };
}

function cloneClientMetrics(metrics) {
    return { ...metrics };
}

function validateKanjiInput(value, fieldName) {
    if (typeof value !== "string") {
        throw new TypeError(`${fieldName} must be a string`);
    }

    const trimmed = value.trim();

    if (!trimmed) {
        throw new Error(`${fieldName} cannot be empty`);
    }

    return trimmed;
}

function validatePayload(schema, data, label, metrics) {
    const parsed = schema.safeParse(data);

    if (!parsed.success) {
        metrics.payloadValidationFailures += 1;
        const issue = parsed.error.issues[0];
        throw new Error(`Invalid ${label} payload: ${issue?.path?.join(".") || "root"} ${issue?.message || "failed validation"}`);
    }

    return parsed.data;
}

async function readJsonIfExists(filePath) {
    try {
        const text = await fsp.readFile(filePath, "utf-8");
        return JSON.parse(text);
    } catch (err) {
        if (err && err.code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

async function deleteFileIfExists(filePath) {
    try {
        await fsp.unlink(filePath);
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }
}

async function writeJsonAtomic(filePath, data) {
    const tempPath = `${filePath}.tmp`;
    const text = JSON.stringify(data, null, 2);

    ensureDir(path.dirname(filePath));
    await fsp.writeFile(tempPath, text, "utf-8");
    await fsp.rename(tempPath, filePath);
}

async function fetchJsonWithTimeout(url, timeoutMs) {
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
        if (err && err.name === "AbortError") {
            throw new Error(`Request timed out after ${timeoutMs} ms: ${url}`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function createKanjiApiClient({ baseUrl, cacheDir, fetchTimeoutMs = 10000 }) {
    if (typeof baseUrl !== "string" || !baseUrl.trim()) {
        throw new Error("baseUrl is required");
    }

    if (typeof cacheDir !== "string" || !cacheDir.trim()) {
        throw new Error("cacheDir is required");
    }

    const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
    const inFlight = new Map();
    const metrics = createEmptyClientMetrics();

    async function fetchCachedJson({ cacheKey, url, schema, label }) {
        ensureDir(cacheDir);

        const filePath = buildCacheFilePath(cacheDir, cacheKey);

        try {
            const cached = await readJsonIfExists(filePath);
            if (cached !== null) {
                metrics.cacheHits += 1;
                return validatePayload(schema, cached, `${label} cache`, metrics);
            }
        } catch (err) {
            if (err instanceof SyntaxError) {
                await deleteFileIfExists(filePath);
            } else {
                throw err;
            }
        }

        metrics.cacheMisses += 1;

        if (inFlight.has(cacheKey)) {
            return inFlight.get(cacheKey);
        }

        const promise = (async () => {
            metrics.networkFetches += 1;
            const rawData = await fetchJsonWithTimeout(url, fetchTimeoutMs);
            const data = validatePayload(schema, rawData, label, metrics);
            await writeJsonAtomic(filePath, data);
            metrics.cacheWrites += 1;
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
            const value = validateKanjiInput(kanji, "kanji");
            const url = `${normalizedBaseUrl}/v1/kanji/${encodeURIComponent(value)}`;

            return fetchCachedJson({
                cacheKey: `kanji_${safeKey(value)}`,
                url,
                schema: kanjiPayloadSchema,
                label: "kanji",
            });
        },

        async getWords(kanji) {
            const value = validateKanjiInput(kanji, "kanji");
            const url = `${normalizedBaseUrl}/v1/words/${encodeURIComponent(value)}`;

            return fetchCachedJson({
                cacheKey: `words_${safeKey(value)}`,
                url,
                schema: wordsPayloadSchema,
                label: "words",
            });
        },

        getMetrics() {
            return cloneClientMetrics(metrics);
        },
    };
}

module.exports = {
    buildCacheFilePath,
    createEmptyClientMetrics,
    createKanjiApiClient,
    validatePayload,
};
