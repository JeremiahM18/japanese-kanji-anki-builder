const { loadConfig } = require("../src/config");
const { buildDoctorReport, formatDoctorReport } = require("../src/services/doctorService");
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
    assertNoUnknownArgs("doctor", options.unknownArgs);
    const config = loadConfig();
    const report = await buildDoctorReport({ config });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatDoctorReport(report));
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
