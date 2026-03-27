const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

/** @typedef {import("../types/contracts").ProviderAsset} ProviderAsset */
/** @typedef {import("../types/contracts").ProviderAttempt} ProviderAttempt */
/** @typedef {import("../types/contracts").ProviderLookupResult} ProviderLookupResult */
/** @typedef {import("../types/contracts").ProviderMetric} ProviderMetric */

function computeChecksum(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readDirectoryEntries(sourceDir) {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        return [];
    }

    return fsp.readdir(sourceDir, { withFileTypes: true });
}

async function buildDirectoryFingerprint(sourceDir, statDirectoryFn = fsp.stat) {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        return `${path.resolve(sourceDir || "")}|missing`;
    }

    const stats = await statDirectoryFn(sourceDir);
    const inode = Number.isFinite(stats.ino) && stats.ino > 0 ? stats.ino : "no-inode";

    return [
        path.resolve(sourceDir),
        stats.dev,
        inode,
        stats.size,
        Math.trunc(stats.mtimeMs),
        Math.trunc(stats.ctimeMs),
    ].join("|");
}

async function buildLocalDirectoryIndex(sourceDir, extensionMap, readDirectoryEntriesFn = readDirectoryEntries) {
    const entries = await readDirectoryEntriesFn(sourceDir);
    const index = new Map();

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const extension = path.extname(entry.name).toLowerCase();
        if (!extensionMap.has(extension)) {
            continue;
        }

        const baseName = path.basename(entry.name, extension);
        const matches = index.get(baseName) || [];
        matches.push({
            extension,
            fileName: entry.name,
        });
        matches.sort((a, b) => a.fileName.localeCompare(b.fileName));
        index.set(baseName, matches);
    }

    return index;
}

function normalizeBaseUrl(baseUrl) {
    if (!baseUrl) {
        return "";
    }

    return String(baseUrl).endsWith("/") ? String(baseUrl) : `${baseUrl}/`;
}

function buildRemoteAssetUrl(baseUrl, fileName) {
    return new URL(fileName, normalizeBaseUrl(baseUrl)).toString();
}

async function fetchWithTimeout(fetchImpl, url, fetchTimeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.max(1, fetchTimeoutMs || 10000));

    try {
        return await fetchImpl(url, {
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * @param {Array<{name?: string}|null|undefined>} [providers=[]]
 * @returns {Record<string, ProviderMetric>}
 */
function createProviderMetrics(providers = []) {
    return Object.fromEntries(
        providers
            .filter(Boolean)
            .map((provider) => [provider.name || "unknown-provider", {
                requests: 0,
                hits: 0,
                misses: 0,
                errors: 0,
                lastSuccessAt: null,
                lastErrorAt: null,
                lastErrorMessage: null,
            }])
    );
}

/**
 * @param {Record<string, ProviderMetric>} metrics
 * @param {string} providerName
 * @param {Partial<ProviderMetric>} update
 */
function updateProviderMetric(metrics, providerName, update) {
    const name = providerName || "unknown-provider";

    if (!metrics[name]) {
        metrics[name] = {
            requests: 0,
            hits: 0,
            misses: 0,
            errors: 0,
            lastSuccessAt: null,
            lastErrorAt: null,
            lastErrorMessage: null,
        };
    }

    metrics[name] = {
        ...metrics[name],
        ...update,
    };
}

/**
 * @param {Record<string, ProviderMetric>} metrics
 * @returns {Record<string, ProviderMetric>}
 */
function snapshotProviderMetrics(metrics) {
    return JSON.parse(JSON.stringify(metrics || {}));
}

function createLocalDirectoryProvider({
    name = "local-filesystem",
    sourceDir,
    extensionMap,
    buildCandidates,
    readDirectoryEntriesFn = readDirectoryEntries,
    statDirectoryFn = fsp.stat,
}) {
    let cachedFingerprint = null;
    let cachedIndex = new Map();

    return {
        name,
        /**
         * @param {unknown} input
         * @returns {Promise<ProviderAsset|null>}
         */
        async findAsset(input) {
            const candidates = Array.isArray(buildCandidates(input)) ? buildCandidates(input) : [];
            const nextFingerprint = await buildDirectoryFingerprint(sourceDir, statDirectoryFn);

            if (cachedFingerprint !== nextFingerprint) {
                cachedIndex = await buildLocalDirectoryIndex(sourceDir, extensionMap, readDirectoryEntriesFn);
                cachedFingerprint = nextFingerprint;
            }

            for (const candidate of candidates) {
                const matches = cachedIndex.get(candidate) || [];

                for (const match of matches) {
                    const absolutePath = path.join(sourceDir, match.fileName);
                    const buffer = await fsp.readFile(absolutePath);
                    const stats = await fsp.stat(absolutePath);

                    return {
                        absolutePath,
                        fileName: match.fileName,
                        mimeType: extensionMap.get(match.extension),
                        checksum: computeChecksum(buffer),
                        sizeBytes: stats.size,
                        content: buffer,
                        extension: match.extension,
                        source: name,
                    };
                }
            }

            return null;
        },
    };
}

function createRemoteHttpProvider({
    name = "remote-http",
    baseUrl,
    extensionMap,
    buildCandidates,
    fetchImpl = fetch,
    fetchTimeoutMs = 10000,
}) {
    return {
        name,
        /**
         * @param {unknown} input
         * @returns {Promise<ProviderAsset|null>}
         */
        async findAsset(input) {
            if (!baseUrl) {
                return null;
            }

            const candidates = Array.isArray(buildCandidates(input)) ? buildCandidates(input) : [];

            for (const candidate of candidates) {
                for (const extension of extensionMap.keys()) {
                    const fileName = `${candidate}${extension}`;
                    const url = buildRemoteAssetUrl(baseUrl, fileName);
                    let response;

                    try {
                        response = await fetchWithTimeout(fetchImpl, url, fetchTimeoutMs);
                    } catch (err) {
                        if (err && err.name === "AbortError") {
                            throw new Error(`Timed out fetching remote media asset from ${url}`);
                        }

                        throw err;
                    }

                    if (!response.ok) {
                        continue;
                    }

                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);

                    return {
                        fileName,
                        mimeType: response.headers.get("content-type") || extensionMap.get(extension),
                        checksum: computeChecksum(buffer),
                        sizeBytes: buffer.length,
                        content: buffer,
                        extension,
                        source: name,
                        url,
                    };
                }
            }

            return null;
        },
    };
}

/**
 * @param {Array<{name?: string, findAsset?: Function}>} providers
 * @param {unknown} input
 * @param {Record<string, ProviderMetric>|null} [metrics=null]
 * @returns {Promise<ProviderLookupResult>}
 */
async function findAssetFromProvidersWithReport(providers, input, metrics = null) {
    /** @type {ProviderAttempt[]} */
    const attempts = [];

    for (const provider of Array.isArray(providers) ? providers : []) {
        if (!provider || typeof provider.findAsset !== "function") {
            continue;
        }

        const providerName = provider.name || "unknown-provider";

        try {
            updateProviderMetric(metrics || {}, providerName, {
                requests: (metrics?.[providerName]?.requests || 0) + 1,
            });

            const asset = await provider.findAsset(input);

            if (asset) {
                updateProviderMetric(metrics || {}, providerName, {
                    requests: metrics?.[providerName]?.requests || 1,
                    hits: (metrics?.[providerName]?.hits || 0) + 1,
                    lastSuccessAt: new Date().toISOString(),
                    lastErrorMessage: null,
                });
                attempts.push({ provider: providerName, status: "hit" });

                return {
                    asset: {
                        ...asset,
                        source: asset.source || providerName,
                    },
                    attempts,
                };
            }

            updateProviderMetric(metrics || {}, providerName, {
                requests: metrics?.[providerName]?.requests || 1,
                misses: (metrics?.[providerName]?.misses || 0) + 1,
            });
            attempts.push({ provider: providerName, status: "miss" });
        } catch (err) {
            updateProviderMetric(metrics || {}, providerName, {
                requests: metrics?.[providerName]?.requests || 1,
                errors: (metrics?.[providerName]?.errors || 0) + 1,
                lastErrorAt: new Date().toISOString(),
                lastErrorMessage: err instanceof Error ? err.message : String(err),
            });
            attempts.push({
                provider: providerName,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        asset: null,
        attempts,
    };
}

/**
 * @param {Array<{name?: string, findAsset?: Function}>} providers
 * @param {unknown} input
 * @returns {Promise<ProviderAsset|null>}
 */
async function findAssetFromProviders(providers, input) {
    const result = await findAssetFromProvidersWithReport(providers, input, null);
    return result.asset;
}

module.exports = {
    buildDirectoryFingerprint,
    buildLocalDirectoryIndex,
    buildRemoteAssetUrl,
    computeChecksum,
    createLocalDirectoryProvider,
    createProviderMetrics,
    createRemoteHttpProvider,
    findAssetFromProviders,
    findAssetFromProvidersWithReport,
    snapshotProviderMetrics,
};
