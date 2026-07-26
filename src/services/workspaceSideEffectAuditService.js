const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeRelativePath(value) {
    return String(value || "").replaceAll("\\", "/").replace(/^\.\/+/u, "");
}

function assertSafeRelativePath(value, label = "path") {
    const normalized = normalizeRelativePath(value);
    if (
        !normalized
        || path.isAbsolute(normalized)
        || normalized === ".."
        || normalized.startsWith("../")
        || normalized.includes("/../")
    ) {
        throw new Error(`${label} must be a workspace-relative contained path: ${value}`);
    }
    return normalized;
}

function loadWorkspaceSideEffectPolicy(filePath) {
    const resolved = path.resolve(filePath);
    const raw = fs.readFileSync(resolved, "utf8");
    const policy = JSON.parse(raw);
    if (policy.version !== 1) {
        throw new Error(`Unsupported workspace side-effect policy version: ${policy.version}`);
    }
    if (!Array.isArray(policy.roots) || policy.roots.length === 0) {
        throw new Error("Workspace side-effect policy must declare at least one root.");
    }
    const roots = policy.roots.map((entry) => assertSafeRelativePath(entry, "policy root"));
    const excludedPrefixes = (policy.excludedPrefixes || [])
        .map((entry) => assertSafeRelativePath(entry, "excluded prefix"));
    const contentHashPrefixes = (policy.contentHashPrefixes || [])
        .map((entry) => assertSafeRelativePath(entry, "content-hash prefix"));
    for (const prefix of contentHashPrefixes) {
        if (!roots.some((root) => prefix === root || prefix.startsWith(`${root}/`))) {
            throw new Error(`Content-hash prefix is outside governed roots: ${prefix}`);
        }
    }
    const hashMaxBytes = Number(policy.hashMaxBytes);
    if (!Number.isSafeInteger(hashMaxBytes) || hashMaxBytes < 0) {
        throw new Error("Workspace side-effect policy hashMaxBytes must be a non-negative safe integer.");
    }
    return {
        filePath: resolved,
        sha256: sha256(raw),
        policy: {
            ...policy,
            roots,
            excludedPrefixes,
            contentHashPrefixes,
            hashMaxBytes,
        },
    };
}

function isExcluded(relativePath, excludedPrefixes = []) {
    return excludedPrefixes.some((prefix) => (
        relativePath === prefix || relativePath.startsWith(`${prefix}/`)
    ));
}

function buildFileRecord(filePath, relativePath, hashMaxBytes, shouldHash) {
    let stats;
    try {
        stats = fs.statSync(filePath);
    } catch (error) {
        return {
            path: relativePath,
            statError: error?.code || error?.name || "UNKNOWN",
        };
    }
    const record = {
        path: relativePath,
        size: stats.size,
        mtimeMs: Math.trunc(stats.mtimeMs),
        hashMode: shouldHash && stats.size <= hashMaxBytes ? "sha256" : "metadata",
    };
    if (record.hashMode === "sha256") {
        try {
            record.sha256 = sha256(fs.readFileSync(filePath));
        } catch (error) {
            record.readError = error?.code || error?.name || "UNKNOWN";
            record.hashMode = "metadata-read-error";
        }
    }
    return record;
}

function buildWorkspaceSideEffectSnapshot({
    rootDir = process.cwd(),
    policyPath = path.join(rootDir, "templates", "workspace_side_effect_policy.json"),
} = {}) {
    const workspaceRoot = path.resolve(rootDir);
    const loaded = loadWorkspaceSideEffectPolicy(policyPath);
    const files = [];
    const skippedSymlinks = [];
    const missingRoots = [];
    const unreadableDirectories = [];

    for (const configuredRoot of loaded.policy.roots) {
        const absoluteRoot = path.resolve(workspaceRoot, configuredRoot);
        const relativeRoot = normalizeRelativePath(path.relative(workspaceRoot, absoluteRoot));
        if (relativeRoot !== configuredRoot) {
            throw new Error(`Workspace side-effect root escapes or normalizes unexpectedly: ${configuredRoot}`);
        }
        if (!fs.existsSync(absoluteRoot)) {
            missingRoots.push(configuredRoot);
            continue;
        }
        const pending = [absoluteRoot];
        while (pending.length > 0) {
            const current = pending.pop();
            let entries;
            try {
                entries = fs.readdirSync(current, { withFileTypes: true })
                    .sort((left, right) => right.name.localeCompare(left.name));
            } catch (error) {
                unreadableDirectories.push({
                    path: normalizeRelativePath(path.relative(workspaceRoot, current)),
                    error: error?.code || error?.name || "UNKNOWN",
                });
                continue;
            }
            for (const entry of entries) {
                const absolutePath = path.join(current, entry.name);
                const relativePath = normalizeRelativePath(path.relative(workspaceRoot, absolutePath));
                if (isExcluded(relativePath, loaded.policy.excludedPrefixes)) {
                    continue;
                }
                if (entry.isSymbolicLink()) {
                    skippedSymlinks.push(relativePath);
                } else if (entry.isDirectory()) {
                    pending.push(absolutePath);
                } else if (entry.isFile()) {
                    files.push(buildFileRecord(
                        absolutePath,
                        relativePath,
                        loaded.policy.hashMaxBytes,
                        loaded.policy.contentHashPrefixes.some((prefix) => (
                            relativePath === prefix || relativePath.startsWith(`${prefix}/`)
                        ))
                    ));
                }
            }
        }
    }

    files.sort((left, right) => left.path.localeCompare(right.path));
    skippedSymlinks.sort((left, right) => left.localeCompare(right));
    unreadableDirectories.sort((left, right) => left.path.localeCompare(right.path));
    return {
        schemaVersion: 1,
        policyPath: normalizeRelativePath(path.relative(workspaceRoot, loaded.filePath)),
        policySha256: loaded.sha256,
        hashMaxBytes: loaded.policy.hashMaxBytes,
        roots: loaded.policy.roots,
        excludedPrefixes: loaded.policy.excludedPrefixes,
        contentHashPrefixes: loaded.policy.contentHashPrefixes,
        files,
        skippedSymlinks,
        missingRoots,
        unreadableDirectories,
        authority: loaded.policy.authority,
    };
}

function recordChanged(before, after) {
    if (before.hashMode !== after.hashMode) {
        return true;
    }
    if (before.statError !== after.statError) {
        return true;
    }
    if (before.size !== after.size) {
        return true;
    }
    if (before.readError !== after.readError) {
        return true;
    }
    if (before.sha256 || after.sha256) {
        return before.sha256 !== after.sha256;
    }
    return before.mtimeMs !== after.mtimeMs;
}

function normalizeAllowedPrefixes(values = [], roots = []) {
    return [...new Set(values.map((entry) => assertSafeRelativePath(entry, "allowed prefix")))]
        .map((prefix) => {
            if (!roots.some((root) => prefix === root || prefix.startsWith(`${root}/`))) {
                throw new Error(`Allowed side-effect prefix is outside governed roots: ${prefix}`);
            }
            return prefix;
        })
        .sort();
}

function pathAllowed(filePath, allowedPrefixes = []) {
    return allowedPrefixes.some((prefix) => (
        filePath === prefix || filePath.startsWith(`${prefix}/`)
    ));
}

function compareWorkspaceSideEffectSnapshots(before, after, {
    allowedPrefixes = [],
} = {}) {
    if (before.schemaVersion !== 1 || after.schemaVersion !== 1) {
        throw new Error("Workspace side-effect snapshots must use schemaVersion 1.");
    }
    if (before.policySha256 !== after.policySha256) {
        throw new Error("Workspace side-effect policy changed between baseline and verification.");
    }
    const allowed = normalizeAllowedPrefixes(allowedPrefixes, after.roots);
    const beforeByPath = new Map(before.files.map((entry) => [entry.path, entry]));
    const afterByPath = new Map(after.files.map((entry) => [entry.path, entry]));
    const changes = [];
    for (const filePath of [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort()) {
        const prior = beforeByPath.get(filePath);
        const current = afterByPath.get(filePath);
        let kind = "";
        if (!prior) {
            kind = "added";
        } else if (!current) {
            kind = "removed";
        } else if (recordChanged(prior, current)) {
            kind = "changed";
        }
        if (kind) {
            changes.push({
                path: filePath,
                kind,
                allowed: pathAllowed(filePath, allowed),
            });
        }
    }
    const beforeSymlinks = new Set(before.skippedSymlinks || []);
    const afterSymlinks = new Set(after.skippedSymlinks || []);
    for (const symlinkPath of [...new Set([...beforeSymlinks, ...afterSymlinks])].sort()) {
        if (beforeSymlinks.has(symlinkPath) !== afterSymlinks.has(symlinkPath)) {
            changes.push({
                path: symlinkPath,
                kind: afterSymlinks.has(symlinkPath) ? "symlink-added" : "symlink-removed",
                allowed: pathAllowed(symlinkPath, allowed),
            });
        }
    }
    const beforeMissingRoots = new Set(before.missingRoots || []);
    const afterMissingRoots = new Set(after.missingRoots || []);
    for (const rootPath of [...new Set([...beforeMissingRoots, ...afterMissingRoots])].sort()) {
        if (beforeMissingRoots.has(rootPath) !== afterMissingRoots.has(rootPath)) {
            changes.push({
                path: rootPath,
                kind: afterMissingRoots.has(rootPath) ? "root-became-missing" : "root-appeared",
                allowed: pathAllowed(rootPath, allowed),
            });
        }
    }
    const beforeUnreadableDirectories = new Map(
        (before.unreadableDirectories || []).map((entry) => [entry.path, entry.error])
    );
    const afterUnreadableDirectories = new Map(
        (after.unreadableDirectories || []).map((entry) => [entry.path, entry.error])
    );
    for (const directoryPath of [
        ...new Set([...beforeUnreadableDirectories.keys(), ...afterUnreadableDirectories.keys()]),
    ].sort()) {
        const priorError = beforeUnreadableDirectories.get(directoryPath);
        const currentError = afterUnreadableDirectories.get(directoryPath);
        if (priorError !== currentError) {
            changes.push({
                path: directoryPath,
                kind: !priorError
                    ? "unreadable-directory-added"
                    : !currentError
                        ? "unreadable-directory-removed"
                        : "unreadable-directory-changed",
                allowed: pathAllowed(directoryPath, allowed),
            });
        }
    }
    changes.sort((left, right) => (
        left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind)
    ));
    const unexpectedChanges = changes.filter((entry) => !entry.allowed);
    const unreadableFiles = after.files
        .filter((entry) => entry.readError || entry.statError)
        .map((entry) => ({
            path: entry.path,
            error: entry.readError || entry.statError,
        }));
    const coverageComplete = unreadableFiles.length === 0
        && (after.unreadableDirectories || []).length === 0
        && (after.skippedSymlinks || []).length === 0
        && (after.missingRoots || []).length === 0;
    return {
        passed: unexpectedChanges.length === 0,
        coverageComplete,
        allowedPrefixes: allowed,
        fileCountBefore: before.files.length,
        fileCountAfter: after.files.length,
        changeCount: changes.length,
        unexpectedChangeCount: unexpectedChanges.length,
        changes,
        unexpectedChanges,
        skippedSymlinks: after.skippedSymlinks,
        missingRoots: after.missingRoots,
        unreadableFiles,
        unreadableDirectories: after.unreadableDirectories || [],
        authority: after.authority,
    };
}

module.exports = {
    assertSafeRelativePath,
    buildWorkspaceSideEffectSnapshot,
    compareWorkspaceSideEffectSnapshots,
    loadWorkspaceSideEffectPolicy,
    normalizeAllowedPrefixes,
};
