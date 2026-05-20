const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildNlpReviewPacketArtifactReport,
    formatNlpReviewPacketArtifactReport,
} = require("../src/services/nlpReviewPacketArtifactService");

function parseArgs(argv) {
    const options = {
        json: false,
        artifactDir: null,
        artifactPath: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--artifact-dir=")) {
            options.artifactDir = parseStringOption(arg, "artifact-dir").trim();
        } else if (arg.startsWith("--artifact-path=")) {
            options.artifactPath = parseStringOption(arg, "artifact-path").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.artifactDir && options.artifactPath) {
        collectUnknownArg(options, "use only one of --artifact-dir or --artifact-path");
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("nlp:review-packets:validate", options.unknownArgs);

    const report = buildNlpReviewPacketArtifactReport({
        artifactDir: options.artifactDir || undefined,
        artifactPath: options.artifactPath || undefined,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatNlpReviewPacketArtifactReport(report));
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
