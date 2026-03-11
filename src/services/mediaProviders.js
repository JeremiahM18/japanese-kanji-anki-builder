const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

function computeChecksum(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function readDirectoryEntries(sourceDir) {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        return [];
    }

    return fsp.readdir(sourceDir, { withFileTypes: true });
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

function snapshotProviderMetrics(metrics) {
    return JSON.parse(JSON.stringify(metrics || {}));
}

function createLocalDirectoryProvider({ name = "local-filesystem", sourceDir, extensionMap, buildCandidates }) {
    return {
        name,
        async findAsset(input) {
            const candidates = Array.isArray(buildCandidates(input)) ? buildCandidates(input) : [];
            const entries = await readDirectoryEntries(sourceDir);

            for (const candidate of candidates) {
                for (const entry of entries) {
                    if (!entry.isFile()) {
                        continue;
                    }

                    const extension = path.extname(entry.name).toLowerCase();
                    if (!extensionMap.has(extension)) {
                        continue;
                    }

                    if (path.basename(entry.name, extension) !== candidate) {
                        continue;
                    }

                    const absolutePath = path.join(sourceDir, entry.name);
                    const buffer = await fsp.readFile(absolutePath);
                    const stats = await fsp.stat(absolutePath);

                    return {
                        absolutePath,
                        fileName: entry.name,
                        mimeType: extensionMap.get(extension),
                        checksum: computeChecksum(buffer),
                        sizeBytes: stats.size,
                        content: buffer,
                        extension,
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

async function findAssetFromProvidersWithReport(providers, input, metrics = null) {
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

async function findAssetFromProviders(providers, input) {
    const result = await findAssetFromProvidersWithReport(providers, input, null);
    return result.asset;
}

module.exports = {
    buildRemoteAssetUrl,
    computeChecksum,
    createLocalDirectoryProvider,
    createProviderMetrics,
    createRemoteHttpProvider,
    findAssetFromProviders,
    findAssetFromProvidersWithReport,
    snapshotProviderMetrics,
};
