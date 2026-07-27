const fs = require("node:fs");
const path = require("node:path");

const FULL_GIT_COMMIT_PATTERN = /^[a-f0-9]{40}$/u;

function pathsEqual(leftPath, rightPath) {
    const left = path.resolve(leftPath);
    const right = path.resolve(rightPath);
    return process.platform === "win32"
        ? left.toLowerCase() === right.toLowerCase()
        : left === right;
}

function resolveGitDirectory(repositoryRoot = process.cwd()) {
    const resolvedRepositoryRoot = path.resolve(repositoryRoot);
    const dotGitPath = path.join(resolvedRepositoryRoot, ".git");
    const dotGitHandle = fs.openSync(dotGitPath, "r");
    try {
        const dotGitStats = fs.fstatSync(dotGitHandle);
        if (dotGitStats.isDirectory()) {
            return dotGitPath;
        }
        if (dotGitStats.isFile()) {
            const pointer = fs.readFileSync(dotGitHandle, "utf8")
                .replace(/^gitdir:\s*/u, "")
                .trim();
            if (!pointer) {
                throw new Error(`${dotGitPath} contains an empty gitdir pointer.`);
            }
            return path.resolve(path.dirname(dotGitPath), pointer);
        }
        throw new Error(`${dotGitPath} must be a Git directory or gitdir pointer file.`);
    } finally {
        fs.closeSync(dotGitHandle);
    }
}

function assertFullGitCommit(value, label = "Git commit") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!FULL_GIT_COMMIT_PATTERN.test(normalized)) {
        throw new Error(`${label} must be a full 40-character Git SHA.`);
    }
    return normalized;
}

function resolveGitCommonDirectory(gitDir) {
    const commonDirPath = path.join(gitDir, "commondir");
    let pointer;
    try {
        pointer = fs.readFileSync(commonDirPath, "utf8").trim();
    } catch (error) {
        if (error?.code === "ENOENT") {
            return gitDir;
        }
        throw error;
    }
    if (!pointer) {
        throw new Error(`${commonDirPath} contains an empty common Git directory pointer.`);
    }
    return path.resolve(gitDir, pointer);
}

function readLooseGitRef(gitDirectory, ref) {
    try {
        return assertFullGitCommit(
            fs.readFileSync(path.join(gitDirectory, ...ref.split("/")), "utf8").trim(),
            `Git ref ${ref}`
        );
    } catch (error) {
        if (error?.code === "ENOENT") {
            return null;
        }
        throw error;
    }
}

function readGitHead(repositoryRoot = process.cwd()) {
    const gitDir = resolveGitDirectory(repositoryRoot);
    const commonGitDir = resolveGitCommonDirectory(gitDir);
    const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) {
        return assertFullGitCommit(head, "Detached Git HEAD");
    }

    const ref = head.slice(5).trim();
    if (!ref) {
        throw new Error("Git HEAD contains an empty ref.");
    }
    const gitDirectoryCandidates = pathsEqual(gitDir, commonGitDir)
        ? [gitDir]
        : [gitDir, commonGitDir];
    for (const gitDirectory of gitDirectoryCandidates) {
        const looseCommit = readLooseGitRef(gitDirectory, ref);
        if (looseCommit) {
            return looseCommit;
        }
    }

    let packedRefs;
    try {
        packedRefs = fs.readFileSync(path.join(commonGitDir, "packed-refs"), "utf8");
    } catch (error) {
        if (error?.code === "ENOENT") {
            throw new Error(`Unable to resolve Git HEAD ref ${ref}: no loose or packed ref exists.`);
        }
        throw error;
    }
    const match = packedRefs.split(/\r?\n/u)
        .find((line) => !line.startsWith("#") && !line.startsWith("^") && line.endsWith(` ${ref}`));
    if (!match) {
        throw new Error(`Unable to resolve Git HEAD ref ${ref}.`);
    }
    return assertFullGitCommit(match.split(" ")[0], `Packed Git ref ${ref}`);
}

module.exports = {
    FULL_GIT_COMMIT_PATTERN,
    assertFullGitCommit,
    readGitHead,
    resolveGitCommonDirectory,
    resolveGitDirectory,
};
