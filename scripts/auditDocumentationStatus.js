const { invokeCliMain } = require("../src/utils/cliArgs");
const {
    auditDocumentationStatus,
    formatDocumentationStatusAuditReport,
} = require("../src/services/documentationStatusAuditService");

function parseArgs(argv) {
    return {
        json: argv.includes("--json"),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = auditDocumentationStatus();

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatDocumentationStatusAuditReport(report));
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
