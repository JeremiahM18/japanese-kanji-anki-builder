const fs = require("node:fs");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const {
    buildMediaSourceReport,
    formatMediaSourceReport,
    parseLevelsArgument,
} = require("../src/services/mediaSourceReportService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: 25,
        json: argv.includes("--json"),
    };

    for (const arg of argv) {
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        }
    }

    return options;
}

async function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const report = await buildMediaSourceReport({
        jlptOnlyJson,
        strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
        strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
        audioSourceDir: config.audioSourceDir,
        audioEnabled: config.enableAudio !== false,
        levels: options.levels,
        limit: options.limit,
    });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }

    process.stdout.write(formatMediaSourceReport(report));
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
