const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { auditJlptInventoryAgainstContract, loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");

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
        `Contract kanji: ${result.contractKanjiCount}`,
        `Dataset kanji: ${result.datasetKanjiCount}`,
        `Counts: N5 ${result.datasetCounts[5]}, N4 ${result.datasetCounts[4]}, N3 ${result.datasetCounts[3]}, N2 ${result.datasetCounts[2]}, N1 ${result.datasetCounts[1]}`,
        `Result: ${result.valid ? "passing" : "failing"}`,
    ];

    if (!result.valid) {
        lines.push("", "Issues:");
        lines.push(`- Missing kanji: ${result.missingKanji.length}`);
        lines.push(`- Unexpected kanji: ${result.unexpectedKanji.length}`);
        lines.push(`- Wrong level assignments: ${result.levelMismatches.length}`);
        lines.push(`- Per-level count mismatches: ${result.countMismatches.length}`);
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("verifyJlptInventory", options.unknownArgs);

    const config = loadConfig();
    const contractPath = path.join(process.cwd(), "templates", "jlpt_level_contract.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract at ${contractPath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const result = auditJlptInventoryAgainstContract(jlptOnlyJson, loadJlptLevelContract(contractPath));

    if (options.json) {
        console.log(JSON.stringify({
            dataset: config.jlptJsonPath,
            contractPath,
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
