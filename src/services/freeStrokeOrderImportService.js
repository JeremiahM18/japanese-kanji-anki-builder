const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { buildStrokeOrderAnimationCandidates, buildStrokeOrderImageCandidates } = require("./strokeOrderService");

const IMAGE_EXTENSIONS = new Set([".svg", ".png", ".webp", ".jpg", ".jpeg"]);
const ANIMATION_EXTENSIONS = new Set([".gif", ".webp", ".apng", ".svg"]);

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function listFilesRecursive(rootDir) {
    if (!rootDir || !fs.existsSync(rootDir)) {
        return [];
    }

    const results = [];
    const queue = [rootDir];

    while (queue.length > 0) {
        const currentDir = queue.shift();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                queue.push(fullPath);
                continue;
            }

            if (entry.isFile()) {
                results.push(fullPath);
            }
        }
    }

    return results.sort((a, b) => a.localeCompare(b));
}

function buildCandidateLookup(kanjiList, buildCandidates) {
    const lookup = new Map();

    for (const kanji of kanjiList) {
        for (const candidate of buildCandidates(kanji)) {
            lookup.set(String(candidate).toLowerCase(), kanji);
        }
    }

    return lookup;
}

function classifyStrokeOrderFile(filePath, { imageLookup, animationLookup }) {
    const extension = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, extension).toLowerCase();
    const matchesImage = IMAGE_EXTENSIONS.has(extension) ? imageLookup.get(baseName) : null;
    const matchesAnimation = ANIMATION_EXTENSIONS.has(extension) ? animationLookup.get(baseName) : null;

    if (matchesImage && matchesAnimation) {
        if (extension === ".gif" || baseName.endsWith("-order")) {
            return { kind: "animation", kanji: matchesAnimation };
        }

        return { kind: "image", kanji: matchesImage };
    }

    if (matchesAnimation) {
        return { kind: "animation", kanji: matchesAnimation };
    }

    if (matchesImage) {
        return { kind: "image", kanji: matchesImage };
    }

    return null;
}

async function copyIfChanged(sourcePath, destinationPath) {
    const sourceBuffer = await fsp.readFile(sourcePath);
    let destinationBuffer = null;

    try {
        destinationBuffer = await fsp.readFile(destinationPath);
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }

    if (destinationBuffer && Buffer.compare(sourceBuffer, destinationBuffer) === 0) {
        return "unchanged";
    }

    ensureDir(path.dirname(destinationPath));
    await fsp.copyFile(sourcePath, destinationPath);
    return destinationBuffer ? "updated" : "copied";
}

async function importFreeStrokeOrderDirectory({
    inputDir,
    kanjiList,
    imageDestinationDir,
    animationDestinationDir,
}) {
    ensureDir(imageDestinationDir);
    ensureDir(animationDestinationDir);

    const imageLookup = buildCandidateLookup(kanjiList, buildStrokeOrderImageCandidates);
    const animationLookup = buildCandidateLookup(kanjiList, buildStrokeOrderAnimationCandidates);
    const files = listFilesRecursive(inputDir);

    const summary = {
        inputDir: path.resolve(inputDir),
        scannedFiles: files.length,
        importedImages: 0,
        importedAnimations: 0,
        updatedFiles: 0,
        unchangedFiles: 0,
        skippedFiles: 0,
        imported: [],
        skipped: [],
    };

    for (const filePath of files) {
        const classification = classifyStrokeOrderFile(filePath, { imageLookup, animationLookup });
        if (!classification) {
            summary.skippedFiles += 1;
            summary.skipped.push({ filePath, reason: "unsupported-or-unrecognized" });
            continue;
        }

        const extension = path.extname(filePath).toLowerCase();
        const destinationDir = classification.kind === "animation" ? animationDestinationDir : imageDestinationDir;
        const destinationPath = path.join(destinationDir, path.basename(filePath));
        const status = await copyIfChanged(filePath, destinationPath);

        if (classification.kind === "animation") {
            summary.importedAnimations += 1;
        } else {
            summary.importedImages += 1;
        }

        if (status === "updated") {
            summary.updatedFiles += 1;
        } else if (status === "unchanged") {
            summary.unchangedFiles += 1;
        }

        summary.imported.push({
            filePath,
            destinationPath,
            kanji: classification.kanji,
            kind: classification.kind,
            extension,
            status,
        });
    }

    return summary;
}

module.exports = {
    ANIMATION_EXTENSIONS,
    IMAGE_EXTENSIONS,
    buildCandidateLookup,
    classifyStrokeOrderFile,
    importFreeStrokeOrderDirectory,
    listFilesRecursive,
};
