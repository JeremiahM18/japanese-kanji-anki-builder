const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
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
    removeGeneratedPath,
    removeGeneratedPathSync,
};
