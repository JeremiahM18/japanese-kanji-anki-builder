const { loadConfig } = require("../src/config");
const { buildDoctorReport } = require("../src/services/doctorService");
const { formatLevelReadinessReport } = require("../src/services/levelReadinessService");

function parseArgs(argv) {
    return {
        json: argv.includes("--json"),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
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

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
