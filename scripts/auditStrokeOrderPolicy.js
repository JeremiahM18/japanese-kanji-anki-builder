const { loadConfig } = require("../src/config");
const { loadStrokeOrderSourcePolicy } = require("../src/datasets/strokeOrderSourcePolicy");
const {
    buildStrokeOrderPolicyAuditReport,
    formatStrokeOrderPolicyAuditReport,
} = require("../src/services/strokeOrderPolicyAuditService");
const { invokeCliMain } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    return {
        json: argv.includes("--json"),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const policy = loadStrokeOrderSourcePolicy();
    const report = buildStrokeOrderPolicyAuditReport({
        mediaRootDir: config.mediaRootDir,
        strokeOrderSourcePolicy: policy,
        remoteStrokeOrderImageBaseUrl: config.remoteStrokeOrderImageBaseUrl,
        remoteStrokeOrderAnimationBaseUrl: config.remoteStrokeOrderAnimationBaseUrl,
        remoteStrokeOrderAnimCjkBaseUrl: config.remoteStrokeOrderAnimCjkBaseUrl,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatStrokeOrderPolicyAuditReport(report, policy));
    }

    if (!report.valid) {
        process.exitCode = 1;
    }
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
