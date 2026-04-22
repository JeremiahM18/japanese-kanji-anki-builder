const { loadConfig } = require("../src/config");
const { buildVoicevoxDoctorReport, formatVoicevoxDoctorReport } = require("../src/services/voicevoxDoctorService");
const { invokeCliMain } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    return {
        json: argv.includes("--json"),
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const report = await buildVoicevoxDoctorReport({ config });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatVoicevoxDoctorReport(report));
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
