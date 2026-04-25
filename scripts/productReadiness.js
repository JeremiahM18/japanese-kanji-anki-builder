const { invokeCliMain } = require("../src/utils/cliArgs");
const {
    formatProductReadinessReport,
    runProductReadinessGate,
} = require("../src/services/productReadinessService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(arg.slice("--level=".length));
        } else {
            throw new Error(`Unknown argument for productReadiness: ${arg}`);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = runProductReadinessGate({ level: options.level });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        process.stdout.write(formatProductReadinessReport(report));
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
