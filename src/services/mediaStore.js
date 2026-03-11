const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { z } = require("zod");

const mediaAssetSchema = z.object({
    kind: z.enum(["image", "animation", "audio"]),
    path: z.string().min(1),
    mimeType: z.string().min(1),
    source: z.string().min(1),
    checksum: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().positive().optional(),
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

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

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

async function writeManifest(mediaRootDir, manifest) {
    const parsed = mediaManifestSchema.parse({
        ...manifest,
        updatedAt: manifest.updatedAt || new Date().toISOString(),
    });
    const layout = ensureMediaLayout(mediaRootDir, parsed.kanji);
    const tempPath = `${layout.manifestPath}.tmp`;

    await fsp.writeFile(tempPath, JSON.stringify(parsed, null, 2), "utf-8");
    await fsp.rename(tempPath, layout.manifestPath);

    return parsed;
}

module.exports = {
    buildKanjiMediaId,
    buildManifestPath,
    buildMediaBasePath,
    createEmptyMediaManifest,
    ensureMediaLayout,
    ensureMediaRoot,
    mediaManifestSchema,
    readManifestIfExists,
    writeManifest,
};
