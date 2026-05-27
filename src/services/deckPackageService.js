const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { pipeline } = require("node:stream/promises");

const { mapWithConcurrency } = require("../utils/concurrency");
const { assertSafeGeneratedPath, ensureDir, removeGeneratedPath } = require("../utils/fs");
const { buildAnkiPackage } = require("./ankiPackageService");
const { selectBestAudioAsset } = require("./audioService");
const { readManifestIfExists, resolveManagedAssetPath } = require("./mediaStore");
const { isTrueAnimatedStrokeOrderPath } = require("./strokeOrderService");

function buildDeckPackagePaths(rootDir) {
    const packageDir = path.join(rootDir, "package");

    return {
        rootDir: packageDir,
        exportsDir: path.join(packageDir, "exports"),
        mediaDir: path.join(packageDir, "media"),
        mediaIntegrityPath: path.join(packageDir, "media-integrity.json"),
        readmePath: path.join(packageDir, "IMPORT.txt"),
        summaryPath: path.join(packageDir, "package-summary.json"),
    };
}

function createEmptyMediaCounts() {
    return {
        strokeOrder: 0,
        strokeOrderImage: 0,
        strokeOrderAnimation: 0,
        trueStrokeOrderAnimation: 0,
        svgStrokeOrderAnimationFallback: 0,
        audio: 0,
    };
}

function buildImportGuide({ exportCount, mediaAssetCount, mediaCounts, ankiPackage, mediaDirectoryMode }) {
    return [
        "Japanese Kanji Builder Deck Package",
        "",
        `Exports included: ${exportCount}`,
        `Unique media files included: ${mediaAssetCount}`,
        `- Stroke-order field references: ${mediaCounts.strokeOrder}`,
        ...(mediaCounts.strokeOrderImage > 0 ? [`- Stroke-order static image package assets: ${mediaCounts.strokeOrderImage}`] : []),
        ...(mediaCounts.strokeOrderAnimation > 0 ? [`- Stroke-order animation package assets: ${mediaCounts.strokeOrderAnimation}`] : []),
        `- Audio fields: ${mediaCounts.audio}`,
        ...(ankiPackage?.filePath ? [
            `Anki package: ${ankiPackage.filePath}`,
            `- Notes: ${ankiPackage.noteCount}`,
            `- Decks: ${ankiPackage.deckCount}`,
        ] : []),
        ...(ankiPackage?.skipped ? [`Anki package skipped: ${ankiPackage.skipReason}`] : []),
        ...(mediaDirectoryMode === "source-backed-apkg" ? [
            "Package media folder: not materialized because the APKG was built directly from managed-media source paths.",
        ] : []),
        ...(mediaDirectoryMode === "materialized" ? [
            "Package media folder: materialized for TSV/manual-copy compatibility.",
        ] : []),
        "",
        "Suggested import flow:",
        ...(ankiPackage?.filePath
            ? ["1. Import the generated .apkg file into Anki."]
            : ["1. Import one of the TSV files from the exports folder into Anki."]),
        ...(ankiPackage?.filePath
            ? ["2. Re-import a newer .apkg when media coverage improves or when you regenerate the deck."]
            : [
                "2. Copy the media files from the media folder into your Anki collection.media directory.",
                "3. Re-import when media coverage improves or when you regenerate the deck.",
            ]),
        "",
        "This package contains the exact referenced audio and stroke-order assets currently available in managed media storage.",
        "One file can satisfy multiple exported fields, so field counts may be higher than unique copied files.",
        "If media coverage is still zero, the media folder will be empty until you sync or add assets.",
        "",
    ].join("\n");
}

async function copyFileIntoPackage(sourcePath, destinationPath) {
    ensureDir(path.dirname(destinationPath));
    await fsp.copyFile(sourcePath, destinationPath);
}

function isSha256(value) {
    return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

async function copyFileIntoPackageWithSha256(sourcePath, destinationPath) {
    ensureDir(path.dirname(destinationPath));

    const hash = crypto.createHash("sha256");
    let byteSize = 0;
    const sourceStream = fs.createReadStream(sourcePath);

    sourceStream.on("data", (chunk) => {
        hash.update(chunk);
        byteSize += chunk.length;
    });

    await pipeline(sourceStream, fs.createWriteStream(destinationPath));

    return {
        sha256: hash.digest("hex"),
        byteSize,
    };
}

async function hashFileSha256(sourcePath) {
    const hash = crypto.createHash("sha256");
    let byteSize = 0;
    const sourceStream = fs.createReadStream(sourcePath);

    sourceStream.on("data", (chunk) => {
        hash.update(chunk);
        byteSize += chunk.length;
    });

    await new Promise((resolve, reject) => {
        sourceStream.on("error", reject);
        sourceStream.on("end", resolve);
    });

    return {
        sha256: hash.digest("hex"),
        byteSize,
    };
}

function withOptionalChecksum(candidate, asset) {
    if (asset?.checksum) {
        return {
            ...candidate,
            checksum: asset.checksum,
        };
    }

    return candidate;
}

function capturePackageTiming(timingsMs, key, startedAt) {
    timingsMs[key] = Number((performance.now() - startedAt).toFixed(2));
}

async function capturePackagePhase(timingsMs, key, action) {
    const startedAt = performance.now();
    try {
        return await action();
    } finally {
        capturePackageTiming(timingsMs, key, startedAt);
    }
}

function filterPackageAssetCandidates(candidates, assetKinds) {
    if (!Array.isArray(assetKinds) || assetKinds.length === 0) {
        return candidates;
    }

    const allowedKinds = new Set(assetKinds);
    return candidates.filter((entry) => allowedKinds.has(entry.kind));
}

function buildPackageAssetCandidatesFromManifest(manifest, kanji, { assetKinds = null } = {}) {
    const bestStrokeOrderAsset = manifest?.assets?.strokeOrderAnimation || manifest?.assets?.strokeOrderImage || null;
    const bestAudioAsset = selectBestAudioAsset(manifest?.assets?.audio || [], {
        category: "kanji-reading",
        text: kanji,
    });

    return filterPackageAssetCandidates([
        withOptionalChecksum({ kind: "strokeOrder", relativePath: bestStrokeOrderAsset?.path || "" }, bestStrokeOrderAsset),
        withOptionalChecksum({ kind: "strokeOrderImage", relativePath: manifest?.assets?.strokeOrderImage?.path || "" }, manifest?.assets?.strokeOrderImage),
        withOptionalChecksum({ kind: "strokeOrderAnimation", relativePath: manifest?.assets?.strokeOrderAnimation?.path || "" }, manifest?.assets?.strokeOrderAnimation),
        withOptionalChecksum({ kind: "audio", relativePath: bestAudioAsset?.path || "" }, bestAudioAsset),
    ], assetKinds).filter((entry) => entry.relativePath);
}

function buildReferencedPackageAssetCandidatesFromManifest(manifest, { assetKinds = null } = {}) {
    const bestStrokeOrderAsset = manifest?.assets?.strokeOrderAnimation || manifest?.assets?.strokeOrderImage || null;
    const audioAssets = Array.isArray(manifest?.assets?.audio) ? manifest.assets.audio : [];

    return filterPackageAssetCandidates([
        withOptionalChecksum({ kind: "strokeOrder", relativePath: bestStrokeOrderAsset?.path || "" }, bestStrokeOrderAsset),
        withOptionalChecksum({ kind: "strokeOrderImage", relativePath: manifest?.assets?.strokeOrderImage?.path || "" }, manifest?.assets?.strokeOrderImage),
        withOptionalChecksum({ kind: "strokeOrderAnimation", relativePath: manifest?.assets?.strokeOrderAnimation?.path || "" }, manifest?.assets?.strokeOrderAnimation),
        ...audioAssets.map((asset) => withOptionalChecksum({ kind: "audio", relativePath: asset?.path || "" }, asset)),
    ], assetKinds).filter((entry) => entry.relativePath);
}

function toPortableRelativePath(fromDir, toPath) {
    const relativePath = path.relative(fromDir, toPath);
    if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return null;
    }

    return relativePath.split(path.sep).join("/");
}

function buildPackageMediaIntegrity({ assets, mediaRootDir }) {
    const resolvedMediaRootDir = path.resolve(mediaRootDir);
    const sourceRoot = toPortableRelativePath(process.cwd(), resolvedMediaRootDir);

    return {
        version: 1,
        generatedArtifact: true,
        checksumAlgorithm: "sha256",
        sourceRoot: sourceRoot || null,
        files: assets.map((asset) => ({
            fileName: asset.fileName,
            sha256: asset.sha256,
            byteSize: asset.byteSize,
            kind: asset.kind,
            kanji: asset.kanji,
            relativePath: asset.relativePath,
            sourceRelativePath: sourceRoot
                ? toPortableRelativePath(resolvedMediaRootDir, path.resolve(asset.sourcePath))
                : null,
        })),
    };
}

function buildManifestBackedPackagedAssets({ assets, mediaRootDir }) {
    const resolvedMediaRootDir = path.resolve(mediaRootDir);
    const sourceRoot = toPortableRelativePath(process.cwd(), resolvedMediaRootDir);
    if (!sourceRoot) {
        return null;
    }

    const packagedAssets = [];
    for (const asset of assets) {
        const sourceRelativePath = toPortableRelativePath(resolvedMediaRootDir, path.resolve(asset.sourcePath));
        const checksum = String(asset.checksum || "").trim().toLowerCase();
        if (!sourceRelativePath || !isSha256(checksum)) {
            return null;
        }

        packagedAssets.push({
            ...asset,
            sha256: checksum,
            byteSize: null,
        });
    }

    return packagedAssets;
}

async function buildSourceBackedPackagedAssets({ assets, mediaRootDir, concurrency = 8 }) {
    const resolvedMediaRootDir = path.resolve(mediaRootDir);
    const sourceRoot = toPortableRelativePath(process.cwd(), resolvedMediaRootDir);
    if (!sourceRoot) {
        return null;
    }

    const resolvedAssets = [];
    for (const asset of assets) {
        const sourceRelativePath = toPortableRelativePath(resolvedMediaRootDir, path.resolve(asset.sourcePath));
        if (!sourceRelativePath) {
            return null;
        }
        resolvedAssets.push({
            ...asset,
            sourceRelativePath,
        });
    }

    return mapWithConcurrency(resolvedAssets, concurrency, async (asset) => {
        const checksum = String(asset.checksum || "").trim().toLowerCase();
        if (isSha256(checksum)) {
            const stat = await fsp.stat(asset.sourcePath);
            if (!stat.isFile()) {
                throw new Error(`Managed media source is not a file: ${asset.sourcePath}`);
            }
            return {
                ...asset,
                sha256: checksum,
                byteSize: stat.size,
            };
        }

        const integrity = await hashFileSha256(asset.sourcePath);
        return {
            ...asset,
            sha256: integrity.sha256,
            byteSize: integrity.byteSize,
        };
    });
}

async function copyPackageMediaAssetsWithIntegrity({ assets, mediaDir, packageConcurrency }) {
    return mapWithConcurrency(assets, packageConcurrency, async (asset) => {
        const integrity = await copyFileIntoPackageWithSha256(asset.sourcePath, path.join(mediaDir, asset.fileName));
        const expectedChecksum = String(asset.checksum || asset.sha256 || "").trim();
        if (isSha256(expectedChecksum) && expectedChecksum.toLowerCase() !== integrity.sha256) {
            throw new Error(`Managed media checksum mismatch for ${asset.fileName}: manifest ${expectedChecksum}, copied ${integrity.sha256}.`);
        }

        return {
            ...asset,
            sha256: integrity.sha256,
            byteSize: integrity.byteSize,
        };
    });
}

async function readManagedManifest({ kanji, mediaRootDir, strokeOrderService, audioService }) {
    const manifestProvider = typeof strokeOrderService?.getManifest === "function"
        ? strokeOrderService
        : (typeof audioService?.getManifest === "function" ? audioService : null);

    if (manifestProvider) {
        const manifest = await manifestProvider.getManifest(kanji);
        if (manifest) {
            return manifest;
        }
    }

    return readManifestIfExists(mediaRootDir, kanji);
}

async function collectPackageAssets({ kanjiList, mediaRootDir, strokeOrderService = null, audioService = null, concurrency = 8, assetKinds = null, referencedFileNames = null }) {
    const assets = new Map();
    const mediaCounts = createEmptyMediaCounts();
    const selectedKanji = [...new Set((Array.isArray(kanjiList) ? kanjiList : []).filter(Boolean))];

    const assetGroups = await mapWithConcurrency(selectedKanji, concurrency, async (kanji) => {
        const manifest = await readManagedManifest({ kanji, mediaRootDir, strokeOrderService, audioService });
        const candidates = referencedFileNames
            ? buildReferencedPackageAssetCandidatesFromManifest(manifest, { assetKinds })
            : buildPackageAssetCandidatesFromManifest(manifest, kanji, { assetKinds });
        return candidates
            .filter((candidate) => !referencedFileNames || referencedFileNames.has(path.basename(candidate.relativePath)))
            .map((candidate) => ({
                ...candidate,
                kanji,
            }));
    });

    for (const candidates of assetGroups) {
        for (const candidate of candidates) {
            const absolutePath = resolveManagedAssetPath(mediaRootDir, candidate.kanji, candidate.relativePath);
            if (!absolutePath || !fs.existsSync(absolutePath)) {
                continue;
            }

            mediaCounts[candidate.kind] += 1;
            if (candidate.kind === "strokeOrderAnimation") {
                if (isTrueAnimatedStrokeOrderPath(candidate.relativePath)) {
                    mediaCounts.trueStrokeOrderAnimation += 1;
                } else {
                    mediaCounts.svgStrokeOrderAnimationFallback += 1;
                }
            }

            const fileName = path.basename(candidate.relativePath);
            if (!assets.has(fileName)) {
                assets.set(fileName, {
                    kind: candidate.kind,
                    kanji: candidate.kanji,
                    fileName,
                    sourcePath: absolutePath,
                    relativePath: candidate.relativePath,
                    checksum: candidate.checksum,
                });
            }
        }
    }

    return {
        assets: [...assets.values()].sort((a, b) => a.fileName.localeCompare(b.fileName)),
        mediaCounts,
    };
}

function collectReferencedMediaFileNames(exports = []) {
    const fileNames = new Set();
    const mediaRefRe = /(?:src="|\[sound:)([^"\]]+)/g;

    for (const artifact of Array.isArray(exports) ? exports : []) {
        const filePath = artifact?.filePath;
        if (!filePath || !fs.existsSync(filePath)) {
            continue;
        }

        const text = fs.readFileSync(filePath, "utf-8");
        for (const match of text.matchAll(mediaRefRe)) {
            const fileName = path.basename(String(match[1] || "").trim());
            if (fileName) {
                fileNames.add(fileName);
            }
        }
    }

    return fileNames;
}

async function collectExplicitReferencedAssets({ referencedMedia = [], mediaRootDir }) {
    const assets = new Map();
    const mediaCounts = createEmptyMediaCounts();

    for (const reference of Array.isArray(referencedMedia) ? referencedMedia : []) {
        const kanji = String(reference?.kanji || "").trim();
        const relativePath = String(reference?.relativePath || "").trim();
        const kind = String(reference?.kind || "").trim();
        if (!kanji || !relativePath || !kind) {
            continue;
        }

        const absolutePath = resolveManagedAssetPath(mediaRootDir, kanji, relativePath);
        if (!absolutePath || !fs.existsSync(absolutePath)) {
            continue;
        }

        mediaCounts[kind] += 1;
        if (kind === "strokeOrderAnimation") {
            if (isTrueAnimatedStrokeOrderPath(relativePath)) {
                mediaCounts.trueStrokeOrderAnimation += 1;
            } else {
                mediaCounts.svgStrokeOrderAnimationFallback += 1;
            }
        }

        const fileName = path.basename(relativePath);
        if (!assets.has(fileName)) {
            assets.set(fileName, {
                kind,
                kanji,
                fileName,
                sourcePath: absolutePath,
                relativePath,
                checksum: reference.checksum,
            });
        }
    }

    return {
        assets: [...assets.values()].sort((a, b) => a.fileName.localeCompare(b.fileName)),
        mediaCounts,
    };
}

function collectReferencedKanji({ exports, kanjiByLevel }) {
    const exportReferenced = (Array.isArray(exports) ? exports : [])
        .flatMap((artifact) => Array.isArray(artifact?.mediaKanji) ? artifact.mediaKanji : []);

    if (exportReferenced.length > 0) {
        return [...new Set(exportReferenced.filter(Boolean))];
    }

    return [...new Set(
        Object.values(kanjiByLevel || {}).flatMap((list) => Array.isArray(list) ? list : [])
    )];
}

async function buildDeckPackage({
    outDir,
    exports,
    kanjiByLevel,
    mediaRootDir,
    strokeOrderService = null,
    audioService = null,
    packageConcurrency = 8,
    deckKind = "kanji",
    referencedMedia = [],
    buildAnkiPackageFn = buildAnkiPackage,
}) {
    const totalStartedAt = performance.now();
    const timingsMs = {};
    const packagePaths = buildDeckPackagePaths(outDir);

    await capturePackagePhase(timingsMs, "prepareDirectories", async () => {
        assertSafeGeneratedPath(packagePaths.rootDir, { label: "deck package directory" });
        ensureDir(packagePaths.rootDir);
        await removeGeneratedPath(packagePaths.exportsDir, { recursive: true, force: true, label: "deck package exports directory" });
        await removeGeneratedPath(packagePaths.mediaDir, { recursive: true, force: true, label: "deck package media directory" });
        await removeGeneratedPath(packagePaths.mediaIntegrityPath, { force: true, label: "deck package media integrity sidecar" });
        await removeGeneratedPath(packagePaths.readmePath, { force: true, label: "deck package import guide" });
        await removeGeneratedPath(packagePaths.summaryPath, { force: true, label: "deck package summary" });
        ensureDir(packagePaths.exportsDir);
        ensureDir(packagePaths.mediaDir);
    });

    await capturePackagePhase(timingsMs, "copyExports", async () => mapWithConcurrency(exports, packageConcurrency, async (artifact) => {
        await copyFileIntoPackage(
            artifact.filePath,
            path.join(packagePaths.exportsDir, path.basename(artifact.filePath))
        );
    }));

    const assetSelectionStartedAt = performance.now();
    const selectedKanji = collectReferencedKanji({ exports, kanjiByLevel });
    const isWordDeck = deckKind === "word";
    const isKanjiDeck = deckKind === "kanji" || deckKind === "kanji-additional";
    const kanjiAssetKinds = isWordDeck
        ? ["strokeOrder", "strokeOrderAnimation"]
        : ["strokeOrder", "audio"];
    capturePackageTiming(timingsMs, "selectKanji", assetSelectionStartedAt);

    const referencedMediaStartedAt = performance.now();
    const referencedMediaFileNames = isKanjiDeck
        ? collectReferencedMediaFileNames(exports)
        : null;
    capturePackageTiming(timingsMs, "collectReferencedMediaFileNames", referencedMediaStartedAt);

    const { assets, mediaCounts } = await capturePackagePhase(timingsMs, "collectManifestAssets", async () => collectPackageAssets({
        kanjiList: selectedKanji,
        mediaRootDir,
        strokeOrderService,
        audioService,
        concurrency: packageConcurrency,
        assetKinds: kanjiAssetKinds,
        referencedFileNames: referencedMediaFileNames,
    }));
    const explicitReferencedAssets = await capturePackagePhase(timingsMs, "collectExplicitReferencedAssets", async () => collectExplicitReferencedAssets({
        referencedMedia,
        mediaRootDir,
    }));

    const mergeAssetsStartedAt = performance.now();
    const mergedAssetMap = new Map(assets.map((asset) => [asset.fileName, asset]));
    for (const asset of explicitReferencedAssets.assets) {
        if (!mergedAssetMap.has(asset.fileName)) {
            mergedAssetMap.set(asset.fileName, asset);
        }
    }
    const mergedMediaCounts = {
        strokeOrder: mediaCounts.strokeOrder + explicitReferencedAssets.mediaCounts.strokeOrder,
        strokeOrderImage: mediaCounts.strokeOrderImage + explicitReferencedAssets.mediaCounts.strokeOrderImage,
        strokeOrderAnimation: mediaCounts.strokeOrderAnimation + explicitReferencedAssets.mediaCounts.strokeOrderAnimation,
        trueStrokeOrderAnimation: mediaCounts.trueStrokeOrderAnimation + explicitReferencedAssets.mediaCounts.trueStrokeOrderAnimation,
        svgStrokeOrderAnimationFallback: mediaCounts.svgStrokeOrderAnimationFallback + explicitReferencedAssets.mediaCounts.svgStrokeOrderAnimationFallback,
        audio: mediaCounts.audio + explicitReferencedAssets.mediaCounts.audio,
    };
    const mergedAssets = [...mergedAssetMap.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
    capturePackageTiming(timingsMs, "mergeAssets", mergeAssetsStartedAt);

    const manifestBackedIntegrityStartedAt = performance.now();
    const manifestBackedAssets = buildManifestBackedPackagedAssets({ assets: mergedAssets, mediaRootDir });
    capturePackageTiming(timingsMs, "prepareManifestBackedMediaIntegrity", manifestBackedIntegrityStartedAt);
    let packagedAssets = manifestBackedAssets;
    let mediaDirectoryMode = mergedAssets.length === 0 ? "empty" : "materialized";
    let ankiPackage = null;

    if (packagedAssets) {
        await capturePackagePhase(timingsMs, "writeMediaIntegrity", async () => fsp.writeFile(
            packagePaths.mediaIntegrityPath,
            `${JSON.stringify(buildPackageMediaIntegrity({ assets: packagedAssets, mediaRootDir }), null, 2)}\n`,
            "utf-8"
        ));

        ankiPackage = await capturePackagePhase(timingsMs, "buildAnkiPackage", async () => buildAnkiPackageFn({
            packageRootDir: packagePaths.rootDir,
            exports,
            mediaDir: packagePaths.mediaDir,
            levels: exports.map((artifact) => artifact.level),
            deckKind,
        }));

        await capturePackagePhase(timingsMs, "copyMedia", async () => {
            if (ankiPackage?.skipped) {
                packagedAssets = await copyPackageMediaAssetsWithIntegrity({
                    assets: packagedAssets,
                    mediaDir: packagePaths.mediaDir,
                    packageConcurrency,
                });
                mediaDirectoryMode = "materialized";
                return;
            }
            mediaDirectoryMode = mergedAssets.length === 0 ? "empty" : "source-backed-apkg";
        });
    } else {
        packagedAssets = await capturePackagePhase(timingsMs, "prepareSourceBackedMediaIntegrity", async () => buildSourceBackedPackagedAssets({
            assets: mergedAssets,
            mediaRootDir,
            concurrency: packageConcurrency,
        }));

        if (packagedAssets) {
            await capturePackagePhase(timingsMs, "writeMediaIntegrity", async () => fsp.writeFile(
                packagePaths.mediaIntegrityPath,
                `${JSON.stringify(buildPackageMediaIntegrity({ assets: packagedAssets, mediaRootDir }), null, 2)}\n`,
                "utf-8"
            ));

            ankiPackage = await capturePackagePhase(timingsMs, "buildAnkiPackage", async () => buildAnkiPackageFn({
                packageRootDir: packagePaths.rootDir,
                exports,
                mediaDir: packagePaths.mediaDir,
                levels: exports.map((artifact) => artifact.level),
                deckKind,
            }));

            await capturePackagePhase(timingsMs, "copyMedia", async () => {
                if (ankiPackage?.skipped) {
                    packagedAssets = await copyPackageMediaAssetsWithIntegrity({
                        assets: packagedAssets,
                        mediaDir: packagePaths.mediaDir,
                        packageConcurrency,
                    });
                    mediaDirectoryMode = "materialized";
                    return;
                }
                mediaDirectoryMode = mergedAssets.length === 0 ? "empty" : "source-backed-apkg";
            });
        } else {
            packagedAssets = await capturePackagePhase(timingsMs, "copyMedia", async () => copyPackageMediaAssetsWithIntegrity({
                assets: mergedAssets,
                mediaDir: packagePaths.mediaDir,
                packageConcurrency,
            }));

            await capturePackagePhase(timingsMs, "writeMediaIntegrity", async () => fsp.writeFile(
                packagePaths.mediaIntegrityPath,
                `${JSON.stringify(buildPackageMediaIntegrity({ assets: packagedAssets, mediaRootDir }), null, 2)}\n`,
                "utf-8"
            ));

            ankiPackage = await capturePackagePhase(timingsMs, "buildAnkiPackage", async () => buildAnkiPackageFn({
                packageRootDir: packagePaths.rootDir,
                exports,
                mediaDir: packagePaths.mediaDir,
                levels: exports.map((artifact) => artifact.level),
                deckKind,
            }));
            mediaDirectoryMode = mergedAssets.length === 0 ? "empty" : "materialized";
        }
    }

    await capturePackagePhase(timingsMs, "writeImportGuide", async () => fsp.writeFile(packagePaths.readmePath, buildImportGuide({
        exportCount: exports.length,
        mediaAssetCount: mergedAssets.length,
        mediaCounts: mergedMediaCounts,
        ankiPackage,
        mediaDirectoryMode,
    }), "utf-8"));

    const summary = {
        rootDir: packagePaths.rootDir,
        exportsDir: packagePaths.exportsDir,
        mediaDir: packagePaths.mediaDir,
        mediaIntegrityPath: packagePaths.mediaIntegrityPath,
        readmePath: packagePaths.readmePath,
        exportCount: exports.length,
        mediaAssetCount: mergedAssets.length,
        materializedMediaAssetCount: mediaDirectoryMode === "materialized" ? mergedAssets.length : 0,
        mediaDirectoryMode,
        mediaCounts: mergedMediaCounts,
        ankiPackage,
        assets: packagedAssets,
    };
    summary.timingsMs = {
        ...timingsMs,
        total: Number((performance.now() - totalStartedAt).toFixed(2)),
    };

    await capturePackagePhase(timingsMs, "writePackageSummary", async () => fsp.writeFile(packagePaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8"));
    summary.timingsMs = {
        ...timingsMs,
        total: Number((performance.now() - totalStartedAt).toFixed(2)),
    };
    return summary;
}

module.exports = {
    buildDeckPackage,
    buildPackageAssetCandidatesFromManifest,
};
