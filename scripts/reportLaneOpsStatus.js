const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    buildLaneOpsStatus,
    formatLaneOpsStatus,
} = require("../src/services/laneOpsStatusService");

function parseArgs(argv) {
    const options = {
        deckKind: "word",
        lane: "ops",
        levels: [5, 4, 3, 2, 1],
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--deck=")) {
            options.deckKind = parseStringOption(arg, "deck");
        } else if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind");
        } else if (arg.startsWith("--lane=")) {
            options.lane = parseStringOption(arg, "lane");
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
    assertNoUnknownArgs("deck:ops", options.unknownArgs);
    const report = buildLaneOpsStatus({
        deckKind: options.deckKind,
        lane: options.lane,
        levels: options.levels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatLaneOpsStatus(report));
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
