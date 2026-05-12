const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadAudioSourcePolicy } = require("../src/datasets/audioSourcePolicy");
const { buildAudioPolicyAuditReport, formatAudioPolicyAuditReport } = require("../src/services/audioPolicyAuditService");

function parseArgs(argv) {
    const options = {
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:audit:audio", options.unknownArgs);
    const config = loadConfig();
    const policy = loadAudioSourcePolicy();
    const report = buildAudioPolicyAuditReport({
        mediaRootDir: config.mediaRootDir,
        audioSourcePolicy: policy,
        remoteAudioBaseUrl: config.remoteAudioBaseUrl || null,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatAudioPolicyAuditReport(report, policy));
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
