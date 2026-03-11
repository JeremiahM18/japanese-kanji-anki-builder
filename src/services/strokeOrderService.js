const fsp = require("node:fs/promises");
const path = require("node:path");

const {
    createEmptyMediaManifest,
    ensureMediaLayout,
    readManifestIfExists,
    writeManifest,
    buildKanjiMediaId,
} = require("./mediaStore");
const { computeChecksum, createLocalDirectoryProvider, findAssetFromProviders } = require("./mediaProviders");

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

async function findMatchingAsset(sourceDir, kanji, extensionMap) {
    const provider = createLocalDirectoryProvider({
        sourceDir,
        extensionMap,
        buildCandidates: (input) => buildKanjiFileCandidates(input),
    });

    return provider.findAsset(kanji);
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

function createStrokeOrderService({
    mediaRootDir,
    imageSourceDir,
    animationSourceDir,
    imageProviders,
    animationProviders,
}) {
    const resolvedImageProviders = imageProviders || [
        createLocalDirectoryProvider({
            name: "local-filesystem",
            sourceDir: imageSourceDir,
            extensionMap: IMAGE_EXTENSIONS,
            buildCandidates: (input) => buildKanjiFileCandidates(input),
        }),
    ];
    const resolvedAnimationProviders = animationProviders || [
        createLocalDirectoryProvider({
            name: "local-filesystem",
            sourceDir: animationSourceDir,
            extensionMap: ANIMATION_EXTENSIONS,
            buildCandidates: (input) => buildKanjiFileCandidates(input),
        }),
    ];

    async function syncKanji(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        const layout = ensureMediaLayout(mediaRootDir, normalizedKanji);
        const manifest = (await readManifestIfExists(mediaRootDir, normalizedKanji)) || createEmptyMediaManifest(normalizedKanji);
        const mediaId = buildKanjiMediaId(normalizedKanji);

        const imageAsset = await findAssetFromProviders(resolvedImageProviders, normalizedKanji);
        const animationAsset = await findAssetFromProviders(resolvedAnimationProviders, normalizedKanji);

        if (imageAsset) {
            const destinationPath = path.join(layout.imagesDir, `${mediaId}-stroke-order${imageAsset.extension}`);
            await copyAssetIfChanged(imageAsset, destinationPath);
            manifest.assets.strokeOrderImage = {
                kind: "image",
                path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
                mimeType: imageAsset.mimeType,
                source: imageAsset.source || "local-filesystem",
                checksum: imageAsset.checksum,
                notes: `Imported from ${imageAsset.fileName}`,
            };
        }

        if (animationAsset) {
            const destinationPath = path.join(layout.animationsDir, `${mediaId}-stroke-order${animationAsset.extension}`);
            await copyAssetIfChanged(animationAsset, destinationPath);
            manifest.assets.strokeOrderAnimation = {
                kind: "animation",
                path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
                mimeType: animationAsset.mimeType,
                source: animationAsset.source || "local-filesystem",
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

