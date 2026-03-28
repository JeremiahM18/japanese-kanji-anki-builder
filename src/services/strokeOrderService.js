const fsp = require("node:fs/promises");
const path = require("node:path");

const {
    ensureMediaLayout,
    readManifestIfExists,
    updateManifest,
    buildKanjiMediaId,
} = require("./mediaStore");
const {
    computeChecksum,
    createLocalDirectoryProvider,
    createProviderMetrics,
    findAssetFromProvidersWithReport,
    snapshotProviderMetrics,
} = require("./mediaProviders");

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
]);

const TRUE_ANIMATION_EXTENSIONS = new Set([".gif", ".webp", ".apng"]);

function isTrueAnimatedStrokeOrderPath(assetOrPath) {
    const candidate = typeof assetOrPath === "string"
        ? assetOrPath
        : assetOrPath?.path || "";
    const extension = path.extname(String(candidate || "")).toLowerCase();

    return TRUE_ANIMATION_EXTENSIONS.has(extension);
}

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

function buildKanjiVgStrokeOrderCandidates(kanji) {
    const normalized = normalizeKanji(kanji);
    const codePoint = Array.from(normalized)[0].codePointAt(0).toString(16).toUpperCase().padStart(5, "0");

    return [
        `${normalized} - U+${codePoint}- KanjiVG stroke order`,
        `${normalized} - U+${codePoint} (Kaisho) - KanjiVG stroke order`,
    ];
}

function buildStrokeOrderImageCandidates(kanji) {
    const baseCandidates = buildKanjiFileCandidates(kanji);
    const candidates = new Set();

    for (const base of baseCandidates) {
        candidates.add(base);
        candidates.add(`${base}-bw`);
        candidates.add(`${base}-jbw`);
        candidates.add(`${base}-red`);
        candidates.add(`${base}-jred`);
        candidates.add(`${base}-ired`);
        candidates.add(`${base}-tred`);
    }

    for (const kanjiVgBase of buildKanjiVgStrokeOrderCandidates(kanji)) {
        candidates.add(kanjiVgBase);
    }

    return [...candidates];
}

function buildStrokeOrderAnimationCandidates(kanji) {
    const baseCandidates = buildKanjiFileCandidates(kanji);
    const candidates = new Set();

    for (const base of baseCandidates) {
        candidates.add(base);
        candidates.add(`${base}-order`);
        candidates.add(`${base}-calligraphic-order`);
        candidates.add(`${base}-cursive-order`);
    }

    for (const kanjiVgBase of buildKanjiVgStrokeOrderCandidates(kanji)) {
        candidates.add(kanjiVgBase);
    }

    return [...candidates];
}

async function findMatchingAsset(sourceDir, kanji, extensionMap, buildCandidates = buildKanjiFileCandidates) {
    const provider = createLocalDirectoryProvider({
        sourceDir,
        extensionMap,
        buildCandidates: (input) => buildCandidates(input),
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

function createStrokeOrderService({
    mediaRootDir,
    imageSourceDir,
    animationSourceDir,
    imageProviders = [],
    animationProviders = [],
}) {
    const resolvedImageProviders = [
        createLocalDirectoryProvider({
            name: "local-filesystem",
            sourceDir: imageSourceDir,
            extensionMap: IMAGE_EXTENSIONS,
            buildCandidates: buildStrokeOrderImageCandidates,
        }),
        ...imageProviders,
    ];
    const resolvedAnimationProviders = [
        createLocalDirectoryProvider({
            name: "local-filesystem",
            sourceDir: animationSourceDir,
            extensionMap: ANIMATION_EXTENSIONS,
            buildCandidates: buildStrokeOrderAnimationCandidates,
        }),
        ...animationProviders,
    ];
    const providerMetrics = {
        image: createProviderMetrics(resolvedImageProviders),
        animation: createProviderMetrics(resolvedAnimationProviders),
    };

    async function syncKanji(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        const mediaId = buildKanjiMediaId(normalizedKanji);
        const imageLookup = await findAssetFromProvidersWithReport(resolvedImageProviders, normalizedKanji, providerMetrics.image);
        const animationLookup = await findAssetFromProvidersWithReport(resolvedAnimationProviders, normalizedKanji, providerMetrics.animation);
        const imageAsset = imageLookup.asset;
        const animationAsset = animationLookup.asset;

        const writtenManifest = await updateManifest(mediaRootDir, normalizedKanji, async (manifest) => {
            const nextManifest = cloneManifestForUpdate(manifest);
            const layout = ensureMediaLayout(mediaRootDir, normalizedKanji);

            if (imageAsset) {
                const destinationPath = path.join(layout.imagesDir, `${mediaId}-stroke-order${imageAsset.extension}`);
                await copyAssetIfChanged(imageAsset, destinationPath);
                nextManifest.assets.strokeOrderImage = {
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
                nextManifest.assets.strokeOrderAnimation = {
                    kind: "animation",
                    path: path.relative(layout.basePath, destinationPath).replace(/\\/g, "/"),
                    mimeType: animationAsset.mimeType,
                    source: animationAsset.source || "local-filesystem",
                    checksum: animationAsset.checksum,
                    notes: `Imported from ${animationAsset.fileName}`,
                };
            }

            return nextManifest;
        });

        return {
            kanji: normalizedKanji,
            manifest: writtenManifest,
            found: {
                image: Boolean(imageAsset),
                animation: Boolean(animationAsset),
            },
            acquisition: {
                image: imageLookup.attempts,
                animation: animationLookup.attempts,
            },
        };
    }

    async function getManifest(kanji) {
        const normalizedKanji = normalizeKanji(kanji);
        return readManifestIfExists(mediaRootDir, normalizedKanji);
    }

    async function getStrokeOrderImagePath(kanji) {
        const manifest = await getManifest(kanji);
        return manifest?.assets.strokeOrderImage?.path || "";
    }

    async function getStrokeOrderAnimationPath(kanji) {
        const manifest = await getManifest(kanji);
        return manifest?.assets.strokeOrderAnimation?.path || "";
    }

    async function getBestStrokeOrderPath(kanji) {
        return (await getStrokeOrderAnimationPath(kanji)) || (await getStrokeOrderImagePath(kanji)) || "";
    }

    function getProviderMetrics() {
        return snapshotProviderMetrics(providerMetrics);
    }

    return {
        getBestStrokeOrderPath,
        getManifest,
        getProviderMetrics,
        getStrokeOrderAnimationPath,
        getStrokeOrderImagePath,
        syncKanji,
    };
}

module.exports = {
    ANIMATION_EXTENSIONS,
    IMAGE_EXTENSIONS,
    TRUE_ANIMATION_EXTENSIONS,
    buildKanjiFileCandidates,
    buildKanjiVgStrokeOrderCandidates,
    buildStrokeOrderAnimationCandidates,
    buildStrokeOrderImageCandidates,
    copyAssetIfChanged,
    createStrokeOrderService,
    findMatchingAsset,
    isTrueAnimatedStrokeOrderPath,
    normalizeKanji,
};
