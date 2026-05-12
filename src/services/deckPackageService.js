const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { mapWithConcurrency } = require("../utils/concurrency");
const { ensureDir } = require("../utils/fs");
const { buildAnkiPackage } = require("./ankiPackageService");
const { selectBestAudioAsset } = require("./audioService");
const { buildMediaBasePath, readManifestIfExists } = require("./mediaStore");
const { isTrueAnimatedStrokeOrderPath } = require("./strokeOrderService");

function buildDeckPackagePaths(rootDir) {
    const packageDir = path.join(rootDir, "package");

    return {
        rootDir: packageDir,
        exportsDir: path.join(packageDir, "exports"),
        mediaDir: path.join(packageDir, "media"),
        readmePath: path.join(packageDir, "IMPORT.txt"),
        summaryPath: path.join(packageDir, "package-summary.json"),
    };
}

function resolveManagedAssetAbsolutePath(mediaRootDir, kanji, relativeAssetPath) {
    if (!relativeAssetPath) {
        return "";
    }

    const normalizedParts = String(relativeAssetPath)
        .split("/")
        .filter(Boolean);

    return path.join(buildMediaBasePath(mediaRootDir, kanji), ...normalizedParts);
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

function buildImportGuide({ exportCount, mediaAssetCount, mediaCounts, ankiPackage }) {
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

function filterPackageAssetCandidates(candidates, assetKinds) {
    if (!Array.isArray(assetKinds) || assetKinds.length === 0) {
        return candidates;
    }

    const allowedKinds = new Set(assetKinds);
    return candidates.filter((entry) => allowedKinds.has(entry.kind));
}

function buildPackageAssetCandidatesFromManifest(manifest, kanji, { assetKinds = null } = {}) {
    const bestStrokeOrderPath = manifest?.assets?.strokeOrderAnimation?.path || manifest?.assets?.strokeOrderImage?.path || "";
    const bestAudioPath = selectBestAudioAsset(manifest?.assets?.audio || [], {
        category: "kanji-reading",
        text: kanji,
    })?.path || "";

    return filterPackageAssetCandidates([
        { kind: "strokeOrder", relativePath: bestStrokeOrderPath },
        { kind: "strokeOrderImage", relativePath: manifest?.assets?.strokeOrderImage?.path || "" },
        { kind: "strokeOrderAnimation", relativePath: manifest?.assets?.strokeOrderAnimation?.path || "" },
        { kind: "audio", relativePath: bestAudioPath },
    ], assetKinds).filter((entry) => entry.relativePath);
}

function buildReferencedPackageAssetCandidatesFromManifest(manifest, { assetKinds = null } = {}) {
    const bestStrokeOrderPath = manifest?.assets?.strokeOrderAnimation?.path || manifest?.assets?.strokeOrderImage?.path || "";
    const audioAssets = Array.isArray(manifest?.assets?.audio) ? manifest.assets.audio : [];

    return filterPackageAssetCandidates([
        { kind: "strokeOrder", relativePath: bestStrokeOrderPath },
        { kind: "strokeOrderImage", relativePath: manifest?.assets?.strokeOrderImage?.path || "" },
        { kind: "strokeOrderAnimation", relativePath: manifest?.assets?.strokeOrderAnimation?.path || "" },
        ...audioAssets.map((asset) => ({ kind: "audio", relativePath: asset?.path || "" })),
    ], assetKinds).filter((entry) => entry.relativePath);
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
            const absolutePath = resolveManagedAssetAbsolutePath(mediaRootDir, candidate.kanji, candidate.relativePath);
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

        const absolutePath = resolveManagedAssetAbsolutePath(mediaRootDir, kanji, relativePath);
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
}) {
    const packagePaths = buildDeckPackagePaths(outDir);
    ensureDir(packagePaths.rootDir);
    await fsp.rm(packagePaths.exportsDir, { recursive: true, force: true });
    await fsp.rm(packagePaths.mediaDir, { recursive: true, force: true });
    await fsp.rm(packagePaths.readmePath, { force: true });
    await fsp.rm(packagePaths.summaryPath, { force: true });
    ensureDir(packagePaths.exportsDir);
    ensureDir(packagePaths.mediaDir);

    await mapWithConcurrency(exports, packageConcurrency, async (artifact) => {
        await copyFileIntoPackage(
            artifact.filePath,
            path.join(packagePaths.exportsDir, path.basename(artifact.filePath))
        );
    });

    const selectedKanji = collectReferencedKanji({ exports, kanjiByLevel });
    const isWordDeck = deckKind === "word";
    const isKanjiDeck = deckKind === "kanji" || deckKind === "kanji-additional";
    const kanjiAssetKinds = isWordDeck
        ? ["strokeOrder", "strokeOrderAnimation"]
        : ["strokeOrder", "audio"];
    const referencedMediaFileNames = isKanjiDeck
        ? collectReferencedMediaFileNames(exports)
        : null;
    const { assets, mediaCounts } = await collectPackageAssets({
        kanjiList: selectedKanji,
        mediaRootDir,
        strokeOrderService,
        audioService,
        concurrency: packageConcurrency,
        assetKinds: kanjiAssetKinds,
        referencedFileNames: referencedMediaFileNames,
    });
    const explicitReferencedAssets = await collectExplicitReferencedAssets({
        referencedMedia,
        mediaRootDir,
    });
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

    await mapWithConcurrency(mergedAssets, packageConcurrency, async (asset) => {
        await copyFileIntoPackage(asset.sourcePath, path.join(packagePaths.mediaDir, asset.fileName));
    });

    const ankiPackage = await buildAnkiPackage({
        packageRootDir: packagePaths.rootDir,
        exports,
        mediaDir: packagePaths.mediaDir,
        levels: exports.map((artifact) => artifact.level),
        deckKind,
    });

    await fsp.writeFile(packagePaths.readmePath, buildImportGuide({
        exportCount: exports.length,
        mediaAssetCount: mergedAssets.length,
        mediaCounts: mergedMediaCounts,
        ankiPackage,
    }), "utf-8");

    const summary = {
        rootDir: packagePaths.rootDir,
        exportsDir: packagePaths.exportsDir,
        mediaDir: packagePaths.mediaDir,
        readmePath: packagePaths.readmePath,
        exportCount: exports.length,
        mediaAssetCount: mergedAssets.length,
        mediaCounts: mergedMediaCounts,
        ankiPackage,
        assets: mergedAssets,
    };

    await fsp.writeFile(packagePaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
    return summary;
}

module.exports = {
    buildDeckPackage,
    buildPackageAssetCandidatesFromManifest,
};
