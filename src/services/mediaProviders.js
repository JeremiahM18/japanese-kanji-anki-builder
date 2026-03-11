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

async function findAssetFromProviders(providers, input) {
    for (const provider of Array.isArray(providers) ? providers : []) {
        if (!provider || typeof provider.findAsset !== "function") {
            continue;
        }

        const asset = await provider.findAsset(input);
        if (asset) {
            return {
                ...asset,
                source: asset.source || provider.name || "unknown-provider",
            };
        }
    }

    return null;
}

module.exports = {
    buildRemoteAssetUrl,
    computeChecksum,
    createLocalDirectoryProvider,
    createRemoteHttpProvider,
    findAssetFromProviders,
};
