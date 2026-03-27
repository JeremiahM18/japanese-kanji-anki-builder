const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const {
    buildWikimediaStrokeOrderPlan,
    formatWikimediaStrokeOrderPlan,
} = require("../src/services/wikimediaStrokeOrderPlanService");
const { parseLevelsArgument } = require("../src/services/mediaSourceReportService");

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
    const plan = await buildWikimediaStrokeOrderPlan({
        jlptOnlyJson,
        strokeOrderImageSourceDir: config.strokeOrderImageSourceDir,
        strokeOrderAnimationSourceDir: config.strokeOrderAnimationSourceDir,
        levels: options.levels,
        limit: options.limit,
    });

    if (options.json) {
        console.log(JSON.stringify(plan, null, 2));
        return;
    }

    process.stdout.write(formatWikimediaStrokeOrderPlan(plan));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
