const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption, collectUnknownArg, assertNoUnknownArgs } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const {
    buildPlatinumKanjiBatchReport,
    formatPlatinumKanjiBatchReport,
} = require("../src/services/platinumKanjiBatchReportService");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv) {
    const options = {
        json: false,
        kanji: [],
        level: null,
        limit: 12,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("platinumKanjiBatchReport", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Platinum kanji batch report level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", `platinum_n${options.level}_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing platinum kanji review set at " + reviewSetPath);
    }

    const entries = JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
    const rows = await buildKanjiRowsForLevel({ level: options.level, config });
    const report = buildPlatinumKanjiBatchReport({
        rows,
        entries,
        level: options.level,
        kanji: options.kanji,
        limit: options.limit,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatPlatinumKanjiBatchReport(report));
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
