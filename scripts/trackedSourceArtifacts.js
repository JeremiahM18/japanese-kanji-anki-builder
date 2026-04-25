const { invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const {
    buildTrackedSourceWordArtifact,
    formatTrackedSourceArtifactReport,
} = require("../src/services/trackedSourceArtifactService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        outDir: null,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else {
            throw new Error(`Unknown argument for trackedSourceArtifacts: ${arg}`);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = await buildTrackedSourceWordArtifact({
        level: options.level,
        outDir: options.outDir || undefined,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatTrackedSourceArtifactReport(report));
    }

    process.exit(report.passed ? 0 : 1);
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
