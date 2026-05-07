const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TEST_ROOT_DIR = path.resolve(__dirname, "..", "test");
const TEST_FILE_SUFFIX = ".test.js";
const TEST_SCOPES = Object.freeze({
    "source-evidence": Object.freeze([
        "jlptKanjiSourceBatchService.test.js",
        "jlptKanjiSourceAccessService.test.js",
        "jlptKanjiSourceEvidenceCostReport.test.js",
        "jlptKanjiSourceEvidence.test.js",
        "jlptKanjiSourceImportService.test.js",
        "jlptKanjiSourceInputService.test.js",
        "jlptKanjiSourceInputTemplateService.test.js",
        "jlptKanjiSourceLevelDeltaService.test.js",
        "jlptOfficialOccurrenceService.test.js",
        "jlptTaxonomyGovernance.test.js",
        "pinJlptKanjiSourceInputScript.test.js",
        "repositoryGovernance.test.js",
        "runNodeTestsScript.test.js",
    ]),
});

// Keep the test invocation compatible across the supported Node matrix.
// Newer runtimes can opt into shared-process execution, while older CI lanes
// still run with the plain built-in runner and the same explicit test file set.
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

function parseRunNodeTestsArgs(argv = []) {
    const passthroughArgs = [];
    let scope = null;

    for (const arg of argv) {
        if (arg.startsWith("--scope=")) {
            scope = arg.slice("--scope=".length);
            continue;
        }
        passthroughArgs.push(arg);
    }

    if (scope && !TEST_SCOPES[scope]) {
        throw new Error(`Unknown test scope: ${scope}`);
    }

    return { passthroughArgs, scope };
}

function buildNodeTestArgs(version = process.versions.node, passthroughArgs = [], options = {}) {
    const parsed = parseRunNodeTestsArgs(passthroughArgs);
    const scope = options.scope || parsed.scope;
    const args = ["--test"];

    if (supportsTestIsolationFlag(version)) {
        args.push("--test-isolation=none");
    }

    if (scope && !TEST_SCOPES[scope]) {
        throw new Error(`Unknown test scope: ${scope}`);
    }

    args.push(...parsed.passthroughArgs);
    args.push(...findTestFiles(TEST_ROOT_DIR, scope));
    return args;
}

function findScopedTestFiles(rootDir, scope) {
    return TEST_SCOPES[scope].map((fileName) => {
        const testPath = path.join(rootDir, fileName);
        if (!fs.existsSync(testPath)) {
            throw new Error(`Missing test file for ${scope} scope: ${testPath}`);
        }
        return path.relative(process.cwd(), testPath);
    });
}

function findTestFiles(rootDir = TEST_ROOT_DIR, scope = null) {
    if (scope) {
        if (!TEST_SCOPES[scope]) {
            throw new Error(`Unknown test scope: ${scope}`);
        }
        return findScopedTestFiles(rootDir, scope);
    }

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
    const args = buildNodeTestArgs(process.versions.node, process.argv.slice(2));
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
    TEST_SCOPES,
    buildNodeTestArgs,
    findScopedTestFiles,
    findTestFiles,
    parseNodeVersion,
    parseRunNodeTestsArgs,
    supportsTestIsolationFlag,
};
