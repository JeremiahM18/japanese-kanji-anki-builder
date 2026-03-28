const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/mediaSourceReportService");
const {
    generateStrokeOrderGifs,
    formatStrokeOrderGifGenerationSummary,
} = require("../src/services/strokeOrderGifGenerationService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        limit: 25,
        overwrite: argv.includes("--overwrite"),
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
    const summary = await generateStrokeOrderGifs({
        jlptOnlyJson,
        imageSourceDir: config.strokeOrderImageSourceDir,
        animationSourceDir: config.strokeOrderAnimationSourceDir,
        levels: options.levels,
        limit: options.limit,
        overwrite: options.overwrite,
    });

    process.stdout.write(formatStrokeOrderGifGenerationSummary(summary));
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
