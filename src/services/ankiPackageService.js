const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { describePythonTool, resolvePythonCommand } = require("./toolchainService");

function normalizeDeckSlug(levels) {
    const normalized = (Array.isArray(levels) ? levels : [])
        .map((level) => `n${level}`)
        .join("-");

    return normalized || "deck";
}

function buildDeckName(level, deckKind = "kanji") {
    if (deckKind === "word") {
        return `Japanese Kanji Builder::Word Deck::JLPT N${level}`;
    }

    return `Japanese Kanji Builder::JLPT N${level}`;
}

function buildApkgFileName(levels, deckKind = "kanji") {
    const prefix = deckKind === "word" ? "japanese-kanji-builder-words" : "japanese-kanji-builder";
    return `${prefix}-${normalizeDeckSlug(levels)}.apkg`;
}

function listMediaFiles(mediaDir) {
    if (!fs.existsSync(mediaDir)) {
        return [];
    }

    return fs.readdirSync(mediaDir)
        .filter((fileName) => fs.statSync(path.join(mediaDir, fileName)).isFile())
        .sort();
}

function formatAnkiPackageSkipReason(error) {
    if (error && error.code === "EPERM") {
        return "Unable to run Python packaging on this machine (EPERM). The deck exports and packaged media were built, but native .apkg generation was skipped.";
    }

    return error instanceof Error ? error.message : String(error);
}

function runPythonApkgBuilder({ outDir, levels, deckKind }) {
    const python = resolvePythonCommand();
    if (!python) {
        throw new Error("Missing required packaging tool: Python.");
    }

    const scriptPath = path.resolve(__dirname, "..", "..", "scripts", "buildApkg.py");
    const result = spawnSync(
        python.command,
        [
            ...python.argsPrefix,
            scriptPath,
            `--out-dir=${outDir}`,
            `--levels=${(Array.isArray(levels) ? levels : []).join(",") || "5"}`,
            `--deck-kind=${deckKind}`,
            "--json",
        ],
        {
            encoding: "utf8",
        }
    );

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        throw new Error(
            `Python .apkg build failed with exit code ${result.status}: ${String(result.stderr || result.stdout || "").trim()}`
        );
    }

    return JSON.parse(String(result.stdout || "{}").trim());
}

async function buildAnkiPackage({
    packageRootDir,
    exports: _exports,
    mediaDir,
    levels,
    deckKind = "kanji",
}) {
    const pythonTool = describePythonTool();
    const python = pythonTool.available ? resolvePythonCommand() : null;
    const mediaFiles = listMediaFiles(mediaDir);

    if (!python) {
        return {
            filePath: null,
            skipped: true,
            skipReason: pythonTool.blocked
                ? "Python packaging is blocked in the current runtime, so native .apkg generation was skipped."
                : "Missing required packaging tool: Python.",
            noteCount: 0,
            deckCount: 0,
            mediaFileCount: mediaFiles.length,
        };
    }

    try {
        const result = runPythonApkgBuilder({
            outDir: path.dirname(packageRootDir),
            levels,
            deckKind,
        });

        return {
            filePath: result.filePath || path.join(packageRootDir, buildApkgFileName(levels, deckKind)),
            skipped: false,
            skipReason: "",
            noteCount: Number(result.noteCount) || 0,
            deckCount: Number(result.deckCount) || new Set(levels || []).size,
            mediaFileCount: Number(result.mediaFileCount) || mediaFiles.length,
        };
    } catch (error) {
        return {
            filePath: null,
            skipped: true,
            skipReason: formatAnkiPackageSkipReason(error),
            noteCount: 0,
            deckCount: 0,
            mediaFileCount: mediaFiles.length,
        };
    }
}

module.exports = {
    buildAnkiPackage,
    buildApkgFileName,
    buildDeckName,
    formatAnkiPackageSkipReason,
};
