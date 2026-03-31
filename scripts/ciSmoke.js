const { invokeCliMain } = require("../src/utils/cliArgs");
const { runCiSmoke } = require("../src/services/ciSmokeService");

function parseArgs(argv) {
    const options = {
        rootDir: null,
        keepTempDir: false,
    };

    for (const arg of argv) {
        if (arg === "--keep-temp-dir") {
            options.keepTempDir = true;
        } else if (arg.startsWith("--root-dir=")) {
            options.rootDir = arg.slice("--root-dir=".length).trim();
        } else {
            throw new Error(`Unknown argument for ciSmoke: ${arg}`);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const summary = await runCiSmoke({
        rootDir: options.rootDir || null,
        keepTempDir: options.keepTempDir,
    });

    console.log(JSON.stringify(summary, null, 2));
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
