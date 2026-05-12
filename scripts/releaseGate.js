const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { runReleaseGate } = require("../src/services/releaseGateService");

function parseArgs(argv) {
    const options = {
        rootDir: null,
        keepTempDir: false,
        requireApkgTools: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--keep-temp-dir") {
            options.keepTempDir = true;
        } else if (arg === "--require-apkg-tools") {
            options.requireApkgTools = true;
        } else if (arg.startsWith("--root-dir=")) {
            options.rootDir = parseStringOption(arg, "root-dir").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("release:gate", options.unknownArgs);
    const report = await runReleaseGate({
        rootDir: options.rootDir || null,
        keepTempDir: options.keepTempDir,
        requireApkgTools: options.requireApkgTools,
    });

    console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
