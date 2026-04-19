const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TEST_ROOT_DIR = path.resolve(__dirname, "..", "test");
const TEST_FILE_SUFFIX = ".test.js";

function parseNodeVersion(version = process.versions.node) {
    const [major = 0, minor = 0] = String(version)
        .split(".")
        .map((part) => Number.parseInt(part, 10));

    return { major, minor };
}

function supportsTestIsolationFlag(version = process.versions.node) {
    const { major } = parseNodeVersion(version);

    return major >= 24;
}

function buildNodeTestArgs(version = process.versions.node) {
    const args = ["--test"];

    if (supportsTestIsolationFlag(version)) {
        args.push("--test-isolation=none");
    }

    args.push(...findTestFiles());
    return args;
}

function findTestFiles(rootDir = TEST_ROOT_DIR) {
    const discovered = [];
    const pending = [rootDir];

    while (pending.length > 0) {
        const currentDir = pending.pop();
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                pending.push(entryPath);
                continue;
            }

            if (entry.isFile() && entry.name.endsWith(TEST_FILE_SUFFIX)) {
                discovered.push(path.relative(process.cwd(), entryPath));
            }
        }
    }

    discovered.sort((left, right) => left.localeCompare(right));
    return discovered;
}

function main() {
    const args = buildNodeTestArgs();
    const result = spawnSync(process.execPath, args, {
        stdio: "inherit",
    });

    if (result.error) {
        throw result.error;
    }

    process.exit(result.status ?? 1);
}

if (require.main === module) {
    main();
}

module.exports = {
    buildNodeTestArgs,
    findTestFiles,
    parseNodeVersion,
    supportsTestIsolationFlag,
};
