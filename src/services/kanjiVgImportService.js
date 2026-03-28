const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { listFilesRecursive } = require("./freeStrokeOrderImportService");
const { normalizeKanji } = require("./strokeOrderService");

const KANJIVG_EXTENSION = ".svg";
const HEX_FILE_RE = /^(?:0x)?([0-9a-f]{4,6})$/i;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function buildKanjiVgDestinationFileName(kanji) {
    const normalized = normalizeKanji(kanji);
    const codePoint = Array.from(normalized)[0].codePointAt(0).toString(16).toUpperCase().padStart(5, "0");
    return `${normalized} - U+${codePoint}- KanjiVG stroke order.svg`;
}

function buildKanjiLookup(kanjiList) {
    const lookup = new Map();
    for (const kanji of kanjiList || []) {
        const normalized = normalizeKanji(kanji);
        const codePoint = Array.from(normalized)[0].codePointAt(0).toString(16).toLowerCase();
        lookup.set(codePoint, normalized);
    }
    return lookup;
}

function classifyKanjiVgFile(filePath, { kanjiLookup }) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension !== KANJIVG_EXTENSION) {
        return null;
    }

    const baseName = path.basename(filePath, extension).trim();
    const match = baseName.match(HEX_FILE_RE);
    if (!match) {
        return null;
    }

    const normalizedHex = match[1].replace(/^0+/, "").toLowerCase() || "0";
    const kanji = kanjiLookup.get(normalizedHex);
    if (!kanji) {
        return null;
    }

    return {
        kanji,
        destinationFileName: buildKanjiVgDestinationFileName(kanji),
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

async function importKanjiVgDirectory({
    inputDir,
    kanjiList,
    imageDestinationDir,
}) {
    ensureDir(imageDestinationDir);

    const kanjiLookup = buildKanjiLookup(kanjiList);
    const files = listFilesRecursive(inputDir);

    const summary = {
        inputDir: path.resolve(inputDir),
        scannedFiles: files.length,
        importedImages: 0,
        updatedFiles: 0,
        unchangedFiles: 0,
        skippedFiles: 0,
        imported: [],
        skipped: [],
    };

    for (const filePath of files) {
        const classification = classifyKanjiVgFile(filePath, { kanjiLookup });
        if (!classification) {
            summary.skippedFiles += 1;
            summary.skipped.push({ filePath, reason: "unsupported-or-unrecognized" });
            continue;
        }

        const destinationPath = path.join(imageDestinationDir, classification.destinationFileName);
        const status = await copyIfChanged(filePath, destinationPath);
        summary.importedImages += 1;

        if (status === "updated") {
            summary.updatedFiles += 1;
        } else if (status === "unchanged") {
            summary.unchangedFiles += 1;
        }

        summary.imported.push({
            filePath,
            destinationPath,
            kanji: classification.kanji,
            status,
        });
    }

    return summary;
}

module.exports = {
    KANJIVG_EXTENSION,
    buildKanjiLookup,
    buildKanjiVgDestinationFileName,
    classifyKanjiVgFile,
    importKanjiVgDirectory,
};
