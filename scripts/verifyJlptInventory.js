const fs = require("node:fs");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson, validateCanonicalJlptInventory } = require("../src/datasets/jlptOnlyJson");

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

function formatInventoryReport(result, filePath) {
    const lines = [
        "JLPT Inventory Check",
        "",
        `Dataset: ${filePath}`,
        `Total kanji: ${result.summary.totalKanji}`,
        `Counts: N5 ${result.summary.counts[5]}, N4 ${result.summary.counts[4]}, N3 ${result.summary.counts[3]}, N2 ${result.summary.counts[2]}, N1 ${result.summary.counts[1]}`,
        `Result: ${result.valid ? "passing" : "failing"}`,
    ];

    if (!result.valid) {
        lines.push("", "Issues:");
        for (const error of result.errors) {
            lines.push(`- ${error}`);
        }
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("verifyJlptInventory", options.unknownArgs);

    const config = loadConfig();

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const result = validateCanonicalJlptInventory(jlptOnlyJson);

    if (options.json) {
        console.log(JSON.stringify({
            dataset: config.jlptJsonPath,
            ...result,
        }, null, 2));
    } else {
        process.stdout.write(formatInventoryReport(result, config.jlptJsonPath));
    }

    process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatInventoryReport,
    main,
    parseArgs,
};
