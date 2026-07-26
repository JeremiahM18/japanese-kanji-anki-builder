const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { performance } = require("node:perf_hooks");

const { assertSafeGeneratedPath, ensureDir } = require("../utils/fs");
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
    if (deckKind === "kanji-additional") {
        return `Japanese Kanji Builder::Additional Unverified::JLPT N${level}`;
    }

    return `Japanese Kanji Builder::JLPT N${level}`;
}

function buildApkgFileName(levels, deckKind = "kanji") {
    let prefix = "japanese-kanji-builder";
    if (deckKind === "word") {
        prefix = "japanese-kanji-builder-words";
    } else if (deckKind === "kanji-additional") {
        prefix = "japanese-kanji-builder-additional-unverified";
    }
    return `${prefix}-${normalizeDeckSlug(levels)}.apkg`;
}

function resolveNoteSchemaPath(deckKind = "kanji") {
    if (deckKind === "word") {
        return path.resolve(__dirname, "..", "config", "ankiWordNoteSchema.json");
    }

    return path.resolve(__dirname, "..", "config", "ankiNoteSchema.json");
}

function resolveApkgBuilderScriptPath() {
    return path.resolve(__dirname, "..", "..", "scripts", "buildApkg.py");
}

function updateDigestWithFile(digest, filePath, label) {
    digest.update(label);
    digest.update("\0");
    digest.update(path.basename(filePath));
    digest.update("\0");
    digest.update(fs.readFileSync(filePath));
    digest.update("\0");
}

async function computeFileSha256(filePath) {
    const hash = crypto.createHash("sha256");
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", resolve);
    });
    return hash.digest("hex");
}

function computeApkgCacheKey({ packageRootDir, exports, levels, deckKind }) {
    const mediaIntegrityPath = path.join(packageRootDir, "media-integrity.json");
    const noteSchemaPath = resolveNoteSchemaPath(deckKind);
    const builderScriptPath = resolveApkgBuilderScriptPath();
    const exportArtifacts = Array.isArray(exports) ? exports : [];
    if (!fs.existsSync(mediaIntegrityPath) || !fs.existsSync(noteSchemaPath) || !fs.existsSync(builderScriptPath)) {
        return null;
    }
    if (exportArtifacts.some((artifact) => !artifact?.filePath || !fs.existsSync(artifact.filePath))) {
        return null;
    }

    const digest = crypto.createHash("sha256");
    digest.update("apkg-cache-v1");
    digest.update("\0");
    digest.update(deckKind);
    digest.update("\0");
    digest.update((Array.isArray(levels) ? levels : []).join(","));
    digest.update("\0");
    updateDigestWithFile(digest, noteSchemaPath, "note-schema");
    updateDigestWithFile(digest, builderScriptPath, "apkg-builder");
    updateDigestWithFile(digest, mediaIntegrityPath, "media-integrity");
    for (const artifact of [...exportArtifacts].sort((a, b) => String(a.filePath).localeCompare(String(b.filePath)))) {
        digest.update(String(artifact.level || ""));
        digest.update("\0");
        updateDigestWithFile(digest, artifact.filePath, "export");
    }
    return digest.digest("hex");
}

function resolveApkgCachePaths(cacheKey, { packageRootDir } = {}) {
    if (!cacheKey) {
        return null;
    }
    if (!packageRootDir || !String(packageRootDir).trim()) {
        throw new Error("APKG cache resolution requires packageRootDir.");
    }

    const cacheDir = path.join(path.dirname(path.resolve(packageRootDir)), ".apkg-cache");
    assertSafeGeneratedPath(cacheDir, { label: "APKG cache directory" });
    const apkgPath = path.join(cacheDir, `${cacheKey}.apkg`);
    return {
        cacheKey,
        cacheDir,
        apkgPath,
        metadataPath: `${apkgPath}.json`,
        sha256Path: `${apkgPath}.sha256`,
    };
}

async function readCachedApkg({ cachePaths, destinationPath }) {
    try {
        if (!cachePaths || !fs.existsSync(cachePaths.apkgPath) || !fs.existsSync(cachePaths.metadataPath)) {
            return false;
        }

        const metadata = JSON.parse(await fsp.readFile(cachePaths.metadataPath, "utf-8"));
        if (metadata?.version !== 1 || metadata?.cacheKey !== cachePaths.cacheKey) {
            return false;
        }

        const expectedSha256 = String(metadata.apkgSha256 || "").trim().toLowerCase();
        if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
            return false;
        }
        const stat = await fsp.stat(cachePaths.apkgPath);
        if (Number.isFinite(metadata.byteSize) && metadata.byteSize !== stat.size) {
            return false;
        }

        if (await computeFileSha256(cachePaths.apkgPath) !== expectedSha256) {
            return false;
        }

        await fsp.copyFile(cachePaths.apkgPath, destinationPath, fs.constants.COPYFILE_FICLONE);
        return true;
    } catch {
        return false;
    }
}

async function writeCachedApkg({ cachePaths, sourcePath }) {
    try {
        if (!cachePaths || !sourcePath || !fs.existsSync(sourcePath)) {
            return false;
        }

        ensureDir(cachePaths.cacheDir);
        await fsp.copyFile(sourcePath, cachePaths.apkgPath, fs.constants.COPYFILE_FICLONE);
        const stat = await fsp.stat(cachePaths.apkgPath);
        const apkgSha256 = await computeFileSha256(cachePaths.apkgPath);
        const metadata = {
            version: 1,
            generatedArtifact: true,
            source: "apkg-runtime-cache",
            cacheKey: cachePaths.cacheKey,
            apkgSha256,
            byteSize: stat.size,
            createdAt: new Date().toISOString(),
        };
        await fsp.writeFile(cachePaths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");
        await fsp.writeFile(cachePaths.sha256Path, `${apkgSha256}\n`, "utf-8");
        return true;
    } catch {
        return false;
    }
}

function listMediaFiles(mediaDir) {
    if (!fs.existsSync(mediaDir)) {
        return [];
    }

    return fs.readdirSync(mediaDir)
        .filter((fileName) => fs.statSync(path.join(mediaDir, fileName)).isFile())
        .sort();
}

function readMediaIntegrityFileCount(packageRootDir) {
    const integrityPath = path.join(packageRootDir, "media-integrity.json");
    if (!fs.existsSync(integrityPath)) {
        return null;
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(integrityPath, "utf-8"));
        return Array.isArray(parsed?.files) ? parsed.files.length : null;
    } catch {
        return null;
    }
}

function formatAnkiPackageSkipReason(error) {
    if (error && error.code === "EPERM") {
        return "Unable to run Python packaging on this machine (EPERM). The deck exports and packaged media were built, but native .apkg generation was skipped.";
    }

    return error instanceof Error ? error.message : String(error);
}

function captureTiming(timingsMs, key, startedAt) {
    timingsMs[key] = Number((performance.now() - startedAt).toFixed(2));
}

function resolvePythonCommandFromTool(pythonTool) {
    if (!pythonTool?.available) {
        return null;
    }

    return {
        command: pythonTool.command,
        argsPrefix: Array.isArray(pythonTool.runArgsPrefix) ? pythonTool.runArgsPrefix : [],
        version: pythonTool.version,
    };
}

function runPythonApkgBuilder({ outDir, levels, deckKind, python = null }) {
    const resolvedPython = python || resolvePythonCommand();
    if (!resolvedPython) {
        throw new Error("Missing required packaging tool: Python.");
    }

    const scriptPath = resolveApkgBuilderScriptPath();
    const result = spawnSync(
        resolvedPython.command,
        [
            ...resolvedPython.argsPrefix,
            "-S",
            scriptPath,
            `--out-dir=${outDir}`,
            `--levels=${(Array.isArray(levels) ? levels : []).join(",") || "5"}`,
            `--deck-kind=${deckKind}`,
            "--json",
        ],
        {
            encoding: "utf8",
            maxBuffer: 20 * 1024 * 1024,
            shell: false,
            windowsHide: true,
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
    exports,
    mediaDir,
    levels,
    deckKind = "kanji",
}) {
    const totalStartedAt = performance.now();
    const timingsMs = {};

    const listMediaStartedAt = performance.now();
    const mediaIntegrityFileCount = readMediaIntegrityFileCount(packageRootDir);
    const mediaFiles = mediaIntegrityFileCount === null ? listMediaFiles(mediaDir) : null;
    const mediaFileCount = mediaIntegrityFileCount ?? mediaFiles.length;
    captureTiming(timingsMs, "listMediaFiles", listMediaStartedAt);

    const cacheKeyStartedAt = performance.now();
    const cacheKey = computeApkgCacheKey({ packageRootDir, exports, levels, deckKind });
    const cachePaths = resolveApkgCachePaths(cacheKey, { packageRootDir });
    const apkgPath = path.join(packageRootDir, buildApkgFileName(levels, deckKind));
    captureTiming(timingsMs, "computeCacheKey", cacheKeyStartedAt);

    const cacheLookupStartedAt = performance.now();
    const cacheHit = await readCachedApkg({ cachePaths, destinationPath: apkgPath });
    captureTiming(timingsMs, "cacheLookup", cacheLookupStartedAt);

    if (cacheHit) {
        timingsMs.total = Number((performance.now() - totalStartedAt).toFixed(2));
        return {
            filePath: apkgPath,
            skipped: false,
            skipReason: "",
            noteCount: (Array.isArray(exports) ? exports : []).reduce((sum, artifact) => sum + (Number(artifact?.rows) || 0), 0),
            deckCount: new Set(levels || []).size,
            mediaFileCount,
            timingsMs,
            pythonTimingsMs: null,
            pythonRuntime: null,
            cacheHit: true,
        };
    }

    const describeStartedAt = performance.now();
    const pythonTool = describePythonTool();
    captureTiming(timingsMs, "describePythonTool", describeStartedAt);

    const resolveStartedAt = performance.now();
    const python = resolvePythonCommandFromTool(pythonTool);
    captureTiming(timingsMs, "resolvePythonCommand", resolveStartedAt);

    if (!python) {
        timingsMs.total = Number((performance.now() - totalStartedAt).toFixed(2));
        return {
            filePath: null,
            skipped: true,
            skipReason: pythonTool.blocked
                ? "Python packaging is blocked in the current runtime, so native .apkg generation was skipped."
                : "Missing required packaging tool: Python.",
            noteCount: 0,
            deckCount: 0,
            mediaFileCount,
            timingsMs,
            pythonRuntime: null,
        };
    }

    try {
        const pythonStartedAt = performance.now();
        const result = runPythonApkgBuilder({
            outDir: path.dirname(packageRootDir),
            levels,
            deckKind,
            python,
        });
        captureTiming(timingsMs, "runPythonApkgBuilder", pythonStartedAt);
        const cacheStoreStartedAt = performance.now();
        await writeCachedApkg({ cachePaths, sourcePath: result.filePath });
        captureTiming(timingsMs, "cacheStore", cacheStoreStartedAt);
        timingsMs.total = Number((performance.now() - totalStartedAt).toFixed(2));

        return {
            filePath: result.filePath || path.join(packageRootDir, buildApkgFileName(levels, deckKind)),
            skipped: false,
            skipReason: "",
            noteCount: Number(result.noteCount) || 0,
            deckCount: Number(result.deckCount) || new Set(levels || []).size,
            mediaFileCount: Number(result.mediaFileCount) || mediaFileCount,
            timingsMs,
            pythonTimingsMs: result.timingsMs || null,
            pythonRuntime: result.runtime || {
                pythonVersion: python.version,
            },
            integrityChecks: result.integrityChecks || null,
        };
    } catch (error) {
        timingsMs.total = Number((performance.now() - totalStartedAt).toFixed(2));
        return {
            filePath: null,
            skipped: true,
            skipReason: formatAnkiPackageSkipReason(error),
            noteCount: 0,
            deckCount: 0,
            mediaFileCount,
            timingsMs,
            pythonRuntime: null,
        };
    }
}

module.exports = {
    buildAnkiPackage,
    buildApkgFileName,
    buildDeckName,
    formatAnkiPackageSkipReason,
    resolveApkgCachePaths,
};
