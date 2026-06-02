const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { writeFileAtomicSync } = require("../src/utils/fs");
const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const {
    loadJlptLevelContract,
    syncJlptInventoryToContract,
    auditJlptInventoryAgainstContract,
} = require("../src/datasets/jlptLevelContract");

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

function formatSyncReport({ datasetPath, contractPath, updates, audit }) {
    const lines = [
        "JLPT Inventory Sync",
        "",
        `Dataset: ${datasetPath}`,
        `Contract: ${contractPath}`,
        `Updated entries: ${updates.length}`,
        `Result: ${audit.valid ? "passing" : "failing"}`,
    ];

    if (updates.length > 0) {
        lines.push("", "Updated kanji:");
        for (const update of updates) {
            lines.push(`- ${update.kanji}: N${update.previousLevel} -> N${update.nextLevel}`);
        }
    }

    if (!audit.valid) {
        lines.push("", "Remaining issues:");
        lines.push(`- Missing kanji: ${audit.missingKanji.length}`);
        lines.push(`- Unexpected kanji: ${audit.unexpectedKanji.length}`);
        lines.push(`- Wrong level assignments: ${audit.levelMismatches.length}`);
        lines.push(`- Per-level count mismatches: ${audit.countMismatches.length}`);
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("syncJlptInventoryFromContract", options.unknownArgs);

    const config = loadConfig();
    const contractPath = path.join(process.cwd(), "templates", "jlpt_level_contract.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }
    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract at ${contractPath}`);
    }

    const dataset = loadJlptOnlyJson(config.jlptJsonPath, { contractPath: null });
    const contract = loadJlptLevelContract(contractPath);
    const { syncedDataset, updates } = syncJlptInventoryToContract(dataset, contract);

    writeFileAtomicSync(config.jlptJsonPath, `${JSON.stringify(syncedDataset, null, 2)}\n`, "utf-8");

    const audit = auditJlptInventoryAgainstContract(
        loadJlptOnlyJson(config.jlptJsonPath, { contractPath: null }),
        contract
    );
    const result = {
        datasetPath: config.jlptJsonPath,
        contractPath,
        updates,
        audit,
    };

    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        process.stdout.write(formatSyncReport(result));
    }

    process.exit(audit.valid ? 0 : 1);
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatSyncReport,
    main,
    parseArgs,
};
