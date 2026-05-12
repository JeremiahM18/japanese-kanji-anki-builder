const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    buildKanjiDeckGeneratedSurfaceAudit,
    formatKanjiDeckGeneratedSurfaceAudit,
} = require("../src/services/kanjiDeckGeneratedSurfaceAuditService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: null,
        outDir: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:surface-audit", options.unknownArgs);

    const config = loadConfig();
    const report = buildKanjiDeckGeneratedSurfaceAudit({
        outDir: options.outDir || config.buildOutDir,
        levels: options.levels || [5, 4, 3, 2, 1],
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatKanjiDeckGeneratedSurfaceAudit(report));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
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
