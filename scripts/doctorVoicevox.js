const { loadConfig } = require("../src/config");
const { buildVoicevoxDoctorReport, formatVoicevoxDoctorReport } = require("../src/services/voicevoxDoctorService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");

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
    assertNoUnknownArgs("doctor:voicevox", options.unknownArgs);
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
