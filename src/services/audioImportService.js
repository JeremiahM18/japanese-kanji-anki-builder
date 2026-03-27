const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { buildAudioFileCandidates } = require("./audioService");

const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".webm"]);

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

function buildCandidateLookup(kanjiList) {
    const lookup = new Map();

    for (const kanji of kanjiList) {
        for (const candidate of buildAudioFileCandidates({ kanji, text: kanji })) {
            lookup.set(String(candidate).toLowerCase(), kanji);
        }
    }

    return lookup;
}

function classifyAudioFile(filePath, { audioLookup }) {
    const extension = path.extname(filePath).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(extension)) {
        return null;
    }

    const baseName = path.basename(filePath, extension).toLowerCase();
    const kanji = audioLookup.get(baseName);
    if (!kanji) {
        return null;
    }

    return {
        kind: "audio",
        kanji,
    };
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

async function importAudioDirectory({
    inputDir,
    kanjiList,
    audioDestinationDir,
}) {
    ensureDir(audioDestinationDir);

    const audioLookup = buildCandidateLookup(kanjiList);
    const files = listFilesRecursive(inputDir);

    const summary = {
        inputDir: path.resolve(inputDir),
        scannedFiles: files.length,
        importedAudio: 0,
        updatedFiles: 0,
        unchangedFiles: 0,
        skippedFiles: 0,
        imported: [],
        skipped: [],
    };

    for (const filePath of files) {
        const classification = classifyAudioFile(filePath, { audioLookup });
        if (!classification) {
            summary.skippedFiles += 1;
            summary.skipped.push({ filePath, reason: "unsupported-or-unrecognized" });
            continue;
        }

        const destinationPath = path.join(audioDestinationDir, path.basename(filePath));
        const status = await copyIfChanged(filePath, destinationPath);

        summary.importedAudio += 1;
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
            extension: path.extname(filePath).toLowerCase(),
            status,
        });
    }

    return summary;
}

module.exports = {
    AUDIO_EXTENSIONS,
    buildCandidateLookup,
    classifyAudioFile,
    importAudioDirectory,
    listFilesRecursive,
};
