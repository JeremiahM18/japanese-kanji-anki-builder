const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function readFileIfExistsSync(filePath, options) {
    try {
        return fs.readFileSync(filePath, options);
    } catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

function openVerifiedRegularFileSync(filePath, { label = "file" } = {}) {
    const resolvedPath = path.resolve(filePath);
    const noFollowFlag = Number.isInteger(fs.constants.O_NOFOLLOW)
        ? fs.constants.O_NOFOLLOW
        : 0;
    let fileHandle;
    try {
        fileHandle = fs.openSync(resolvedPath, fs.constants.O_RDONLY | noFollowFlag);
        const descriptorStats = fs.fstatSync(fileHandle, { bigint: true });
        const pathStats = fs.lstatSync(resolvedPath, { bigint: true });
        if (
            !descriptorStats.isFile()
            || pathStats.isSymbolicLink()
            || !pathStats.isFile()
        ) {
            throw new Error(`${label} must be a regular non-symbolic-link file: ${resolvedPath}`);
        }
        if (descriptorStats.dev !== pathStats.dev || descriptorStats.ino !== pathStats.ino) {
            throw new Error(`${label} changed while it was being opened: ${resolvedPath}`);
        }
        return fileHandle;
    } catch (error) {
        if (fileHandle !== undefined) {
            fs.closeSync(fileHandle);
        }
        throw error;
    }
}

function writeFileAtomicSync(filePath, data, options) {
    const resolvedTarget = path.resolve(filePath);
    const targetDir = path.dirname(resolvedTarget);
    ensureDir(targetDir);

    const tempPath = path.join(
        targetDir,
        `.${path.basename(resolvedTarget)}.${process.pid}.${Date.now()}.tmp`
    );

    try {
        fs.writeFileSync(tempPath, data, options);
        fs.renameSync(tempPath, resolvedTarget);
    } finally {
        try {
            fs.rmSync(tempPath, { force: true });
        } catch {
            // Best-effort cleanup only; the rename may already have consumed it.
        }
    }
}

function buildWriteOptions(options, flag) {
    if (typeof options === "string") {
        return { encoding: options, flag };
    }
    return { ...(options || {}), flag };
}

function writeFileIfMissingSync(filePath, data, options) {
    const resolvedTarget = path.resolve(filePath);
    const targetDir = path.dirname(resolvedTarget);
    ensureDir(targetDir);

    try {
        fs.writeFileSync(resolvedTarget, data, buildWriteOptions(options, "wx"));
        return true;
    } catch (error) {
        if (error?.code === "EEXIST") {
            return false;
        }
        throw error;
    }
}

function normalizeForPathComparison(filePath) {
    const resolved = path.resolve(filePath);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isPathInside(childPath, parentPath) {
    const child = normalizeForPathComparison(childPath);
    const parent = normalizeForPathComparison(parentPath);
    const relative = path.relative(parent, child);

    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sameResolvedPath(leftPath, rightPath) {
    return normalizeForPathComparison(leftPath) === normalizeForPathComparison(rightPath);
}

/**
 * @param {{
 *   baseDirectory: string,
 *   directoryPath: string,
 *   fsImpl?: typeof fs,
 *   label?: string,
 * }} options
 */
function assertUnredirectedDirectoryPath({ baseDirectory, directoryPath, fsImpl = fs, label = "directory" }) {
    const resolvedBase = path.resolve(baseDirectory);
    const resolvedDirectory = path.resolve(directoryPath);
    if (!sameResolvedPath(resolvedBase, resolvedDirectory) && !isPathInside(resolvedDirectory, resolvedBase)) {
        throw new Error(`${label} is outside its governed base directory: ${resolvedDirectory}`);
    }
    const realBase = fsImpl.realpathSync(resolvedBase);
    let current = resolvedBase;
    const relativeSegments = path.relative(resolvedBase, resolvedDirectory)
        .split(path.sep)
        .filter(Boolean);
    for (const segment of relativeSegments) {
        current = path.join(current, segment);
        if (!fsImpl.existsSync(current)) {
            break;
        }
        const stats = fsImpl.lstatSync(current);
        if (stats.isSymbolicLink()) {
            throw new Error(`${label} must not traverse a symbolic link or junction: ${current}`);
        }
        if (!stats.isDirectory()) {
            throw new Error(`${label} ancestor is not a directory: ${current}`);
        }
        const expectedRealPath = path.resolve(realBase, path.relative(resolvedBase, current));
        const actualRealPath = fsImpl.realpathSync(current);
        if (!sameResolvedPath(actualRealPath, expectedRealPath)) {
            throw new Error(`${label} resolves through a redirected directory: ${current} -> ${actualRealPath}`);
        }
    }
}

/**
 * @param {{
 *   baseDirectory: string,
 *   governedDirectory: string,
 *   declaredPath: string,
 *   extension: string,
 *   expectedBaseName?: string,
 *   label?: string,
 *   rejectWindowsReservedName?: boolean,
 *   fsImpl?: typeof fs,
 * }} options
 */
function resolveGovernedDirectChildPath({
    baseDirectory,
    governedDirectory,
    declaredPath,
    extension,
    expectedBaseName = "",
    label = "governed file",
    rejectWindowsReservedName = false,
    fsImpl = fs,
}) {
    const rawPath = String(declaredPath || "");
    if (!rawPath || rawPath !== rawPath.trim() || rawPath.includes("\0")) {
        throw new Error(`${label} requires a nonempty canonical relative path.`);
    }
    if (
        path.posix.parse(rawPath).root
        || path.win32.parse(rawPath).root
        || rawPath.includes(":")
    ) {
        throw new Error(`${label} requires a canonical relative path without roots, drives, devices, or alternate data streams.`);
    }
    const segments = rawPath.split(/[\\/]/u);
    if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment !== segment.trimEnd())) {
        throw new Error(`${label} contains a noncanonical path segment.`);
    }

    const resolvedBase = path.resolve(baseDirectory);
    const resolvedGovernedDirectory = path.resolve(governedDirectory);
    const resolvedPath = path.resolve(resolvedBase, ...segments);
    if (!sameResolvedPath(path.dirname(resolvedPath), resolvedGovernedDirectory)) {
        throw new Error(`${label} must be a direct child of ${resolvedGovernedDirectory}.`);
    }
    const baseName = path.basename(resolvedPath);
    if (expectedBaseName && baseName !== expectedBaseName) {
        throw new Error(`${label} must use canonical data path basename ${expectedBaseName}.`);
    }
    if (!extension || path.extname(baseName) !== extension) {
        throw new Error(`${label} requires a lowercase ${extension || "file"} extension.`);
    }
    if (rejectWindowsReservedName && /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(baseName)) {
        throw new Error(`${label} uses a reserved Windows filename: ${baseName}.`);
    }

    assertUnredirectedDirectoryPath({
        baseDirectory: resolvedBase,
        directoryPath: resolvedGovernedDirectory,
        fsImpl,
        label: `${label} directory`,
    });
    if (fsImpl.existsSync(resolvedPath)) {
        const stats = fsImpl.lstatSync(resolvedPath);
        if (stats.isSymbolicLink() || !stats.isFile()) {
            throw new Error(`${label} target must be a regular non-symbolic-link file: ${resolvedPath}`);
        }
    }
    return resolvedPath;
}

function getDefaultGeneratedPathRoots({ cwd = process.cwd(), tempDir = os.tmpdir() } = {}) {
    return [
        path.join(cwd, "out"),
        path.join(cwd, ".ci-smoke"),
        path.join(cwd, ".release-gate"),
        path.join(cwd, ".release-smoke"),
        tempDir,
    ].map((entry) => path.resolve(entry));
}

function assertSafeGeneratedPath(targetPath, {
    allowedRoots = getDefaultGeneratedPathRoots(),
    label = "generated path",
} = {}) {
    if (!targetPath || !String(targetPath).trim()) {
        throw new Error(`Refusing to clean empty ${label}.`);
    }

    const resolvedTarget = path.resolve(String(targetPath));
    const parsed = path.parse(resolvedTarget);
    if (resolvedTarget === parsed.root) {
        throw new Error(`Refusing to clean filesystem root for ${label}: ${resolvedTarget}`);
    }

    const resolvedRoots = allowedRoots.map((root) => path.resolve(root));
    if (!resolvedRoots.some((root) => isPathInside(resolvedTarget, root))) {
        throw new Error(
            `Refusing to clean ${label} outside governed generated-output roots: ${resolvedTarget}`
        );
    }

    return resolvedTarget;
}

function removeGeneratedPathSync(targetPath, {
    recursive = false,
    force = false,
    label = "generated path",
    allowedRoots = undefined,
} = {}) {
    const resolvedTarget = assertSafeGeneratedPath(targetPath, { allowedRoots, label });
    fs.rmSync(resolvedTarget, { recursive, force });
}

async function removeGeneratedPath(targetPath, {
    recursive = false,
    force = false,
    label = "generated path",
    allowedRoots = undefined,
} = {}) {
    const resolvedTarget = assertSafeGeneratedPath(targetPath, { allowedRoots, label });
    await fsp.rm(resolvedTarget, { recursive, force });
}

module.exports = {
    assertSafeGeneratedPath,
    ensureDir,
    getDefaultGeneratedPathRoots,
    isPathInside,
    openVerifiedRegularFileSync,
    readFileIfExistsSync,
    removeGeneratedPath,
    removeGeneratedPathSync,
    resolveGovernedDirectChildPath,
    writeFileIfMissingSync,
    writeFileAtomicSync,
};
