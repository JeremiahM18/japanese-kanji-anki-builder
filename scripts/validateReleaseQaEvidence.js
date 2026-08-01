#!/usr/bin/env node

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const {
    DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    buildReleaseQaEvidenceReport,
    formatReleaseQaEvidenceReport,
    loadReleaseQaEvidencePacket,
} = require("../src/services/releaseQaEvidenceService");

function parseArgs(argv = []) {
    const options = {
        json: false,
        packetPath: DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
        artifactDirectory: null,
        expectedReleaseTag: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--packet=")) {
            options.packetPath = arg.slice("--packet=".length);
        } else if (arg.startsWith("--artifact-dir=")) {
            options.artifactDirectory = arg.slice("--artifact-dir=".length);
        } else if (arg.startsWith("--expected-tag=")) {
            options.expectedReleaseTag = arg.slice("--expected-tag=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("product:release-qa:evidence", options.unknownArgs);

    const { packetPath, packet } = loadReleaseQaEvidencePacket(options.packetPath);
    const report = buildReleaseQaEvidenceReport({
        packetPath,
        packet,
        artifactDirectory: options.artifactDirectory,
        expectedReleaseTag: options.expectedReleaseTag,
    });
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatReleaseQaEvidenceReport(report));
    }
    process.exitCode = report.passed ? 0 : 1;
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
