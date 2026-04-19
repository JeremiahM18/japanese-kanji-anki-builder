const { spawnSync } = require("node:child_process");

function parseNodeVersion(version = process.versions.node) {
    const [major = 0, minor = 0] = String(version)
        .split(".")
        .map((part) => Number.parseInt(part, 10));

    return { major, minor };
}

function supportsTestIsolationFlag(version = process.versions.node) {
    const { major, minor } = parseNodeVersion(version);

    return major > 22 || (major === 22 && minor >= 8);
}

function buildNodeTestArgs(version = process.versions.node) {
    const args = ["--test"];

    if (supportsTestIsolationFlag(version)) {
        args.push("--test-isolation=none");
    }

    args.push("test/**/*.test.js");
    return args;
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
    parseNodeVersion,
    supportsTestIsolationFlag,
};
