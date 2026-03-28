const { loadConfig } = require("../src/config");
const { buildDoctorReport } = require("../src/services/doctorService");
const { formatLevelReadinessReport } = require("../src/services/levelReadinessService");

function parseArgs(argv) {
    const options = { json: false, unknownArgs: [] };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else {
            options.unknownArgs.push(arg);
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();

    if (options.unknownArgs.length > 0) {
        throw new Error("Unsupported arguments for reportDeckReadiness: " + options.unknownArgs.join(", "));
    }
    const report = await buildDoctorReport({ config });
    const readiness = report.quality?.levelReadiness;

    if (!readiness) {
        throw new Error("Level readiness is unavailable because required datasets are missing.");
    }

    if (options.json) {
        console.log(JSON.stringify(readiness, null, 2));
        return;
    }

    process.stdout.write(formatLevelReadinessReport(readiness));
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
