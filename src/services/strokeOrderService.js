const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const {
    createEmptyMediaManifest,
    ensureMediaLayout,
    readManifestIfExists,
    writeManifest,
} = require("./mediaStore");

const IMAGE_EXTENSIONS = new Map([
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".webp", "image/webp"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
]);

const ANIMATION_EXTENSIONS = new Map([
    [".gif", "image/gif"],
    [".webp", "image/webp"],
    [".apng", "image/apng"],
    [".svg", "image/svg+xml"],
]);

function normalizeKanji(value) {
    const normalized = String(value ?? "").trim();

    if (!normalized) {
        throw new Error("kanji is required");
    }

    return normalized;
}

function buildKanjiFileCandidates(kanji) {
    const normalized = normalizeKanji(kanji);
    const codePoints = Array.from(normalized).map((char) => char.codePointAt(0).toString(16).toUpperCase());
    const compact = codePoints.join("_");

    return [
        normalized,
        compact,
        `U+${compact}`,
        compact.toLowerCase(),
        `u+${compact.toLowerCase()}`,
    ];
}

function computeChecksum(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function findMatchingAsset(sourceDir, kanji, extensionMap) {
    if (!sourceDir || !fs.existsSync(sourceDir)) {
        return null;
    }

    const candidates = buildKanjiFileCandidates(kanji);
    const entries = await fsp.readdir(sourceDir, { withFileTypes: true });

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
            };
        }
    }

    return null;
}

async function copyAssetIfChanged(sourceAsset, destinationPath) {
    let existingChecksum = null;

    try {
        const existing = await fsp.readFile(destinationPath);
        existingChecksum = computeChecksum(existing);
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }

    if (existingChecksum === sourceAsset.checksum) {
        return false;
    }

    await fsp.writeFile(destinationPath, sourceAsset.content);
    return true;
}

function createStrokeOrderService({ mediaRootDir, imageSourceDir, animationSourceDir }) {
    async function syncKanji(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        const layout = ensureMediaLayout(mediaRootDir, normalizedKanji);
        const manifest = (await readManifestIfExists(mediaRootDir, normalizedKanji)) || createEmptyMediaManifest(normalizedKanji);

        const imageAsset = await findMatchingAsset(imageSourceDir, normalizedKanji, IMAGE_EXTENSIONS);
        const animationAsset = await findMatchingAsset(animationSourceDir, normalizedKanji, ANIMATION_EXTENSIONS);

        if (imageAsset) {
            const destinationPath = path.join(layout.imagesDir, `stroke-order${imageAsset.extension}`);
            await copyAssetIfChanged(imageAsset, destinationPath);
            manifest.assets.strokeOrderImage = {
                kind: "image",
                path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
                mimeType: imageAsset.mimeType,
                source: "local-filesystem",
                checksum: imageAsset.checksum,
                notes: `Imported from ${imageAsset.fileName}`,
            };
        }

        if (animationAsset) {
            const destinationPath = path.join(layout.animationsDir, `stroke-order${animationAsset.extension}`);
            await copyAssetIfChanged(animationAsset, destinationPath);
            manifest.assets.strokeOrderAnimation = {
                kind: "animation",
                path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
                mimeType: animationAsset.mimeType,
                source: "local-filesystem",
                checksum: animationAsset.checksum,
                notes: `Imported from ${animationAsset.fileName}`,
            };
        }

        const writtenManifest = await writeManifest(mediaRootDir, manifest);

        return {
            kanji: normalizedKanji,
            manifest: writtenManifest,
            found: {
                image: Boolean(imageAsset),
                animation: Boolean(animationAsset),
            },
        };
    }

    async function getManifest(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        return readManifestIfExists(mediaRootDir, normalizedKanji);
    }

    async function getBestStrokeOrderPath(kanji) {
        const manifest = await getManifest(kanji);

        if (!manifest) {
            return "";
        }

        return manifest.assets.strokeOrderAnimation?.path || manifest.assets.strokeOrderImage?.path || "";
    }

    return {
        getBestStrokeOrderPath,
        getManifest,
        syncKanji,
    };
}

module.exports = {
    buildKanjiFileCandidates,
    copyAssetIfChanged,
    createStrokeOrderService,
    findMatchingAsset,
    normalizeKanji,
};
