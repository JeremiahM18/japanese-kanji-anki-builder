const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { bootstrapWordStudyData } = require("../src/services/wordStudyBootstrapService");

function parseArgs(argv) {
    return {
        merge: argv.includes("--merge"),
        json: argv.includes("--json"),
    };
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Word Study Init");
    lines.push("");
    lines.push(`Starter entries available: ${summary.starterEntries}`);
    lines.push(`Existing target entries: ${summary.existingEntries}`);
    lines.push(`Written target entries: ${summary.writtenEntries}`);
    lines.push(`Mode: ${summary.merge ? "merge" : "initialize"}`);
    lines.push(`Target file: ${summary.targetPath}`);
    lines.push("");

    if (!summary.changed) {
        lines.push("No file changes were made because word study data already exists. Re-run with `--merge` to add starter entries.");
    } else {
        lines.push("Word study data is ready.");
        lines.push("Next steps:");
        lines.push("- Run `npm run deck:words:ready -- --levels=5` to build the curated word deck.");
        lines.push("- Edit word entries over time with stronger meanings, better notes, and hand-picked example sentences.");
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const starterPath = path.resolve(process.cwd(), "templates", "starter_word_study_data.json");

    if (!fs.existsSync(starterPath)) {
        throw new Error(`Missing starter word study data at ${starterPath}`);
    }

    const summary = bootstrapWordStudyData({
        targetPath: config.wordStudyDataPath,
        starterPath,
        merge: options.merge,
    });

    if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
    }

    process.stdout.write(formatReport(summary));
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
