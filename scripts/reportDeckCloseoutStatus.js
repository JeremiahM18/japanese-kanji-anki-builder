const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    buildDeckCloseoutStatus,
    formatDeckCloseoutStatus,
} = require("../src/services/deckCloseoutStatusService");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:closeout", options.unknownArgs);
    const report = buildDeckCloseoutStatus({
        levels: options.levels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatDeckCloseoutStatus(report));
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
