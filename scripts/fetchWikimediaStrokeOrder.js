const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/mediaSourceReportService");
const { buildWikimediaStrokeOrderPlan } = require("../src/services/wikimediaStrokeOrderPlanService");
const {
    fetchWikimediaStrokeOrderBatch,
    formatWikimediaStrokeOrderFetchSummary,
} = require("../src/services/wikimediaStrokeOrderFetchService");

function parseArgs(argv) {
    const options = {
        levels: [5],
        planLimit: 25,
        fileLimit: 4,
        delayMs: 2000,
        max429: 2,
    };

    for (const arg of argv) {
        if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.planLimit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--file-limit=")) {
            options.fileLimit = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--delay-ms=")) {
            options.delayMs = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--max-429=")) {
            options.max429 = Number(arg.split("=")[1]);
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
        limit: options.planLimit,
        discover: true,
        discoveryCachePath: path.join(config.cacheDir, "wikimedia-stroke-order-discovery.json"),
    });

    const summary = await fetchWikimediaStrokeOrderBatch({
        plan,
        imageSourceDir: config.strokeOrderImageSourceDir,
        animationSourceDir: config.strokeOrderAnimationSourceDir,
        fileLimit: options.fileLimit,
        delayMs: options.delayMs,
        maxConsecutiveRateLimits: options.max429,
    });

    process.stdout.write(formatWikimediaStrokeOrderFetchSummary(summary));
}

main().catch((err) => {
    console.error(err.stack || err);
    process.exit(1);
});
