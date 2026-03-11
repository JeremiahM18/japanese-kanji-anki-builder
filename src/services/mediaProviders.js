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
    computeChecksum,
    createLocalDirectoryProvider,
    findAssetFromProviders,
};
