const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildNlpTokenizationArtifactReport,
    formatNlpTokenizationArtifactReport,
} = require("../src/services/nlpTokenizationArtifactService");

function parseArgs(argv) {
    const options = {
        json: false,
        artifactDir: null,
        artifactPath: null,
        manifestPath: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--dir=")) {
            options.artifactDir = parseStringOption(arg, "dir").trim();
        } else if (arg.startsWith("--path=")) {
            options.artifactPath = parseStringOption(arg, "path").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.manifestPath = parseStringOption(arg, "manifest").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.artifactDir && options.artifactPath) {
        collectUnknownArg(options, "use only one of --dir or --path");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:tokenization:validate", options.unknownArgs);

    const report = buildNlpTokenizationArtifactReport({
        artifactDir: options.artifactDir || undefined,
        artifactPath: options.artifactPath || undefined,
        manifestPath: options.manifestPath || undefined,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpTokenizationArtifactReport(report));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
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
