const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { z } = require("zod");
const { ensureDir } = require("../utils/fs");

/** @typedef {import("../types/contracts").MediaAsset} MediaAsset */
/** @typedef {import("../types/contracts").MediaManifest} MediaManifest */

function isManagedAssetRelativePath(value) {
    if (typeof value !== "string" || value.length === 0) {
        return false;
    }
    if (path.isAbsolute(value) || value.includes("\\") || value.includes("\0")) {
        return false;
    }

    const parts = value.split("/");
    return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}

const mediaAssetSchema = z.object({
    kind: z.enum(["image", "animation", "audio"]),
    path: z.string().min(1).refine(isManagedAssetRelativePath, {
        message: "Invalid managed media asset relative path",
    }),
    mimeType: z.string().min(1),
    source: z.string().min(1),
    checksum: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().optional(),
    category: z.enum(["kanji-reading", "word-reading", "sentence"]).optional(),
    text: z.string().min(1).optional(),
    reading: z.string().min(1).optional(),
    voice: z.string().min(1).optional(),
    locale: z.string().min(1).optional(),
    notes: z.string().optional(),
});

const mediaManifestSchema = z.object({
    kanji: z.string().min(1),
    version: z.literal(1),
    updatedAt: z.string().datetime(),
    assets: z.object({
        strokeOrderImage: mediaAssetSchema.nullable(),
        strokeOrderAnimation: mediaAssetSchema.nullable(),
        audio: z.array(mediaAssetSchema),
    }),
});

const manifestWriteQueues = new Map();

function ensureMediaRoot(mediaRootDir) {
    ensureDir(mediaRootDir);
    ensureDir(path.join(mediaRootDir, "kanji"));
}

function buildKanjiMediaId(kanji) {
    const codePoints = Array.from(String(kanji)).map((char) => char.codePointAt(0).toString(16).toUpperCase());
    return `${codePoints.join("_")}_${kanji}`;
}

function buildMediaBasePath(mediaRootDir, kanji) {
    const mediaId = buildKanjiMediaId(kanji);
    const shard = mediaId.slice(0, 2) || "__";
    return path.join(mediaRootDir, "kanji", shard, mediaId);
}

function buildManifestPath(mediaRootDir, kanji) {
    return path.join(buildMediaBasePath(mediaRootDir, kanji), "manifest.json");
}

function normalizeManagedAssetRelativePath(relativePath) {
    if (!relativePath) {
        return [];
    }

    const value = String(relativePath);
    if (!isManagedAssetRelativePath(value)) {
        throw new Error(`Invalid managed media asset path: ${value}`);
    }

    return value.split("/");
}

function resolveManagedAssetPath(mediaRootDir, kanji, relativePath) {
    const parts = normalizeManagedAssetRelativePath(relativePath);
    if (parts.length === 0) {
        return "";
    }

    const basePath = path.resolve(buildMediaBasePath(mediaRootDir, kanji));
    const resolvedPath = path.resolve(basePath, ...parts);
    const relativeToBase = path.relative(basePath, resolvedPath);
    if (relativeToBase.startsWith("..") || path.isAbsolute(relativeToBase)) {
        throw new Error(`Managed media asset path escapes media root: ${relativePath}`);
    }

    return resolvedPath;
}

function buildManifestQueueKey(mediaRootDir, kanji) {
    return `${path.resolve(mediaRootDir)}::${buildKanjiMediaId(kanji)}`;
}

function buildTemporaryManifestPath(manifestPath) {
    return `${manifestPath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientRenameError(err) {
    return Boolean(err && ["EPERM", "EBUSY", "EACCES"].includes(err.code));
}

async function renameWithRetry(fromPath, toPath, {
    retries = 5,
    baseDelayMs = 25,
} = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            await fsp.rename(fromPath, toPath);
            return;
        } catch (err) {
            lastError = err;

            if (err && err.code === "EXDEV") {
                await fsp.copyFile(fromPath, toPath);
                await fsp.unlink(fromPath);
                return;
            }

            if (!isTransientRenameError(err) || attempt === retries) {
                throw err;
            }

            await delay(baseDelayMs * (2 ** attempt));
        }
    }

    throw lastError;
}

/**
 * @param {string} kanji
 * @returns {MediaManifest}
 */
function createEmptyMediaManifest(kanji) {
    return {
        kanji,
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {
            strokeOrderImage: null,
            strokeOrderAnimation: null,
            audio: [],
        },
    };
}

function managedAssetExists(mediaRootDir, kanji, relativePath) {
    if (!relativePath) {
        return false;
    }

    return fs.existsSync(resolveManagedAssetPath(mediaRootDir, kanji, relativePath));
}

function cloneManifestForUpdate(manifest) {
    return {
        ...manifest,
        assets: {
            strokeOrderImage: manifest.assets?.strokeOrderImage || null,
            strokeOrderAnimation: manifest.assets?.strokeOrderAnimation || null,
            audio: Array.isArray(manifest.assets?.audio) ? [...manifest.assets.audio] : [],
        },
    };
}

function getCachedManifest(manifestCache, kanji, { manifestCacheTtlMs = 30000, nowFn = Date.now } = {}) {
    const cacheEntry = manifestCache.get(kanji);
    if (!cacheEntry) {
        return undefined;
    }

    if (manifestCacheTtlMs > 0 && (nowFn() - cacheEntry.cachedAt) > manifestCacheTtlMs) {
        manifestCache.delete(kanji);
        return undefined;
    }

    return cacheEntry.manifest;
}

function setCachedManifest(manifestCache, kanji, manifest, { nowFn = Date.now } = {}) {
    manifestCache.set(kanji, {
        manifest,
        cachedAt: nowFn(),
    });

    return manifest;
}

function ensureMediaLayout(mediaRootDir, kanji) {
    ensureMediaRoot(mediaRootDir);

    const basePath = buildMediaBasePath(mediaRootDir, kanji);

    ensureDir(basePath);
    ensureDir(path.join(basePath, "images"));
    ensureDir(path.join(basePath, "animations"));
    ensureDir(path.join(basePath, "audio"));

    return {
        basePath,
        imagesDir: path.join(basePath, "images"),
        animationsDir: path.join(basePath, "animations"),
        audioDir: path.join(basePath, "audio"),
        manifestPath: buildManifestPath(mediaRootDir, kanji),
    };
}

/**
 * @param {string} mediaRootDir
 * @param {string} kanji
 * @returns {Promise<MediaManifest|null>}
 */
async function readManifestIfExists(mediaRootDir, kanji) {
    const manifestPath = buildManifestPath(mediaRootDir, kanji);

    try {
        const text = await fsp.readFile(manifestPath, "utf-8");
        return mediaManifestSchema.parse(JSON.parse(text));
    } catch (err) {
        if (err && err.code === "ENOENT") {
            return null;
        }
        throw err;
    }
}

async function runWithManifestLock(mediaRootDir, kanji, callback) {
    const queueKey = buildManifestQueueKey(mediaRootDir, kanji);
    const previous = manifestWriteQueues.get(queueKey) || Promise.resolve();

    let releaseCurrent;
    const current = new Promise((resolve) => {
        releaseCurrent = resolve;
    });

    const queued = previous.then(() => current, () => current);
    manifestWriteQueues.set(queueKey, queued);

    try {
        await previous;
        return await callback();
    } finally {
        releaseCurrent();

        if (manifestWriteQueues.get(queueKey) === queued) {
            manifestWriteQueues.delete(queueKey);
        }
    }
}

/**
 * @param {string} mediaRootDir
 * @param {MediaManifest} manifest
 * @returns {Promise<MediaManifest>}
 */
async function writeManifest(mediaRootDir, manifest) {
    const parsed = mediaManifestSchema.parse({
        ...manifest,
        updatedAt: new Date().toISOString(),
    });
    const layout = ensureMediaLayout(mediaRootDir, parsed.kanji);
    const tempPath = buildTemporaryManifestPath(layout.manifestPath);

    await fsp.writeFile(tempPath, JSON.stringify(parsed, null, 2), "utf-8");
    await renameWithRetry(tempPath, layout.manifestPath);

    return parsed;
}

async function updateManifest(mediaRootDir, kanji, updater) {
    return runWithManifestLock(mediaRootDir, kanji, async () => {
        const existing = await readManifestIfExists(mediaRootDir, kanji);
        const baseManifest = existing || createEmptyMediaManifest(kanji);
        const nextManifest = await updater(baseManifest);

        return writeManifest(mediaRootDir, nextManifest || baseManifest);
    });
}

module.exports = {
    buildKanjiMediaId,
    buildManifestPath,
    buildMediaBasePath,
    buildTemporaryManifestPath,
    cloneManifestForUpdate,
    createEmptyMediaManifest,
    ensureMediaLayout,
    ensureMediaRoot,
    ensureDir,
    getCachedManifest,
    isTransientRenameError,
    managedAssetExists,
    mediaManifestSchema,
    readManifestIfExists,
    renameWithRetry,
    resolveManagedAssetPath,
    isManagedAssetRelativePath,
    runWithManifestLock,
    setCachedManifest,
    updateManifest,
    writeManifest,
};
