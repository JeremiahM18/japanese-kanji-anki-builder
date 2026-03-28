const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { mapWithConcurrency } = require("../utils/concurrency");
const { buildAnkiPackage } = require("./ankiPackageService");
const { selectBestAudioAsset } = require("./audioService");
const { buildMediaBasePath, readManifestIfExists } = require("./mediaStore");
const { isTrueAnimatedStrokeOrderPath } = require("./strokeOrderService");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

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
        `- Stroke-order images: ${mediaCounts.strokeOrderImage}`,
        `- Stroke-order animation fields: ${mediaCounts.strokeOrderAnimation}`,
        `- True animated stroke-order fields: ${mediaCounts.trueStrokeOrderAnimation}`,
        `- SVG fallback animation fields: ${mediaCounts.svgStrokeOrderAnimationFallback}`,
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

function buildPackageAssetCandidatesFromManifest(manifest, kanji) {
    const bestStrokeOrderPath = manifest?.assets?.strokeOrderAnimation?.path || manifest?.assets?.strokeOrderImage?.path || "";
    const bestAudioPath = selectBestAudioAsset(manifest?.assets?.audio || [], {
        category: "kanji-reading",
        text: kanji,
    })?.path || "";

    return [
        { kind: "strokeOrder", relativePath: bestStrokeOrderPath },
        { kind: "strokeOrderImage", relativePath: manifest?.assets?.strokeOrderImage?.path || "" },
        { kind: "strokeOrderAnimation", relativePath: manifest?.assets?.strokeOrderAnimation?.path || "" },
        { kind: "audio", relativePath: bestAudioPath },
    ].filter((entry) => entry.relativePath);
}

async function collectPackageAssets({ kanjiList, mediaRootDir, concurrency = 8 }) {
    const assets = new Map();
    const mediaCounts = createEmptyMediaCounts();
    const selectedKanji = [...new Set((Array.isArray(kanjiList) ? kanjiList : []).filter(Boolean))];

    const assetGroups = await mapWithConcurrency(selectedKanji, concurrency, async (kanji) => {
        const manifest = await readManifestIfExists(mediaRootDir, kanji);
        return buildPackageAssetCandidatesFromManifest(manifest, kanji).map((candidate) => ({
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

async function buildDeckPackage({
    outDir,
    exports,
    kanjiByLevel,
    mediaRootDir,
    packageConcurrency = 8,
}) {
    const packagePaths = buildDeckPackagePaths(outDir);
    ensureDir(packagePaths.rootDir);
    ensureDir(packagePaths.exportsDir);
    ensureDir(packagePaths.mediaDir);

    await mapWithConcurrency(exports, packageConcurrency, async (artifact) => {
        await copyFileIntoPackage(
            artifact.filePath,
            path.join(packagePaths.exportsDir, path.basename(artifact.filePath))
        );
    });

    const selectedKanji = [...new Set(
        Object.values(kanjiByLevel || {}).flatMap((list) => Array.isArray(list) ? list : [])
    )];
    const { assets, mediaCounts } = await collectPackageAssets({
        kanjiList: selectedKanji,
        mediaRootDir,
        concurrency: packageConcurrency,
    });

    await mapWithConcurrency(assets, packageConcurrency, async (asset) => {
        await copyFileIntoPackage(asset.sourcePath, path.join(packagePaths.mediaDir, asset.fileName));
    });

    const ankiPackage = await buildAnkiPackage({
        packageRootDir: packagePaths.rootDir,
        exports,
        mediaDir: packagePaths.mediaDir,
        levels: exports.map((artifact) => artifact.level),
    });

    await fsp.writeFile(packagePaths.readmePath, buildImportGuide({
        exportCount: exports.length,
        mediaAssetCount: assets.length,
        mediaCounts,
        ankiPackage,
    }), "utf-8");

    const summary = {
        rootDir: packagePaths.rootDir,
        exportsDir: packagePaths.exportsDir,
        mediaDir: packagePaths.mediaDir,
        readmePath: packagePaths.readmePath,
        exportCount: exports.length,
        mediaAssetCount: assets.length,
        mediaCounts,
        ankiPackage,
        assets,
    };

    await fsp.writeFile(packagePaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
    return summary;
}

module.exports = {
    buildDeckPackage,
    buildDeckPackagePaths,
    buildImportGuide,
    buildPackageAssetCandidatesFromManifest,
    collectPackageAssets,
    createEmptyMediaCounts,
    resolveManagedAssetAbsolutePath,
};
