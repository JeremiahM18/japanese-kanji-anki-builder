const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { buildMediaBasePath } = require("./mediaStore");

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
        audio: 0,
    };
}

function buildImportGuide({ exportCount, mediaAssetCount, mediaCounts }) {
    return [
        "Japanese Kanji Builder Deck Package",
        "",
        `Exports included: ${exportCount}`,
        `Unique media files included: ${mediaAssetCount}`,
        `- Stroke-order field references: ${mediaCounts.strokeOrder}`,
        `- Stroke-order images: ${mediaCounts.strokeOrderImage}`,
        `- Stroke-order animations: ${mediaCounts.strokeOrderAnimation}`,
        `- Audio fields: ${mediaCounts.audio}`,
        "",
        "Suggested import flow:",
        "1. Import one of the TSV files from the exports folder into Anki.",
        "2. Copy the media files from the media folder into your Anki collection.media directory.",
        "3. Re-import when media coverage improves or when you regenerate the deck.",
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

async function collectPackageAssets({ kanjiList, mediaRootDir, strokeOrderService, audioService }) {
    const assets = new Map();
    const mediaCounts = createEmptyMediaCounts();

    for (const kanji of kanjiList) {
        const strokeOrderImagePath = typeof strokeOrderService?.getStrokeOrderImagePath === "function"
            ? await strokeOrderService.getStrokeOrderImagePath(kanji)
            : "";
        const strokeOrderAnimationPath = typeof strokeOrderService?.getStrokeOrderAnimationPath === "function"
            ? await strokeOrderService.getStrokeOrderAnimationPath(kanji)
            : "";
        const strokeOrderPath = typeof strokeOrderService?.getBestStrokeOrderPath === "function"
            ? await strokeOrderService.getBestStrokeOrderPath(kanji)
            : "";
        const audioPath = typeof audioService?.getBestAudioPath === "function"
            ? await audioService.getBestAudioPath(kanji, { category: "kanji-reading", text: kanji })
            : "";

        const candidates = [
            { kind: "strokeOrder", relativePath: strokeOrderPath },
            { kind: "strokeOrderImage", relativePath: strokeOrderImagePath },
            { kind: "strokeOrderAnimation", relativePath: strokeOrderAnimationPath },
            { kind: "audio", relativePath: audioPath },
        ].filter((entry) => entry.relativePath);

        for (const candidate of candidates) {
            const absolutePath = resolveManagedAssetAbsolutePath(mediaRootDir, kanji, candidate.relativePath);
            if (!absolutePath || !fs.existsSync(absolutePath)) {
                continue;
            }

            mediaCounts[candidate.kind] += 1;

            const fileName = path.basename(candidate.relativePath);
            if (!assets.has(fileName)) {
                assets.set(fileName, {
                    kind: candidate.kind,
                    kanji,
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
    strokeOrderService,
    audioService,
}) {
    const packagePaths = buildDeckPackagePaths(outDir);
    ensureDir(packagePaths.rootDir);
    ensureDir(packagePaths.exportsDir);
    ensureDir(packagePaths.mediaDir);

    for (const artifact of exports) {
        await copyFileIntoPackage(
            artifact.filePath,
            path.join(packagePaths.exportsDir, path.basename(artifact.filePath))
        );
    }

    const selectedKanji = [...new Set(
        Object.values(kanjiByLevel || {}).flatMap((list) => Array.isArray(list) ? list : [])
    )];
    const { assets, mediaCounts } = await collectPackageAssets({
        kanjiList: selectedKanji,
        mediaRootDir,
        strokeOrderService,
        audioService,
    });

    for (const asset of assets) {
        await copyFileIntoPackage(asset.sourcePath, path.join(packagePaths.mediaDir, asset.fileName));
    }

    await fsp.writeFile(packagePaths.readmePath, buildImportGuide({
        exportCount: exports.length,
        mediaAssetCount: assets.length,
        mediaCounts,
    }), "utf-8");

    const summary = {
        rootDir: packagePaths.rootDir,
        exportsDir: packagePaths.exportsDir,
        mediaDir: packagePaths.mediaDir,
        readmePath: packagePaths.readmePath,
        exportCount: exports.length,
        mediaAssetCount: assets.length,
        mediaCounts,
        assets,
    };

    await fsp.writeFile(packagePaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf-8");
    return summary;
}

module.exports = {
    buildDeckPackage,
    buildDeckPackagePaths,
    buildImportGuide,
    collectPackageAssets,
    createEmptyMediaCounts,
    resolveManagedAssetAbsolutePath,
};
