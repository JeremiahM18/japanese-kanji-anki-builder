const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { bootstrapCuratedStudyData } = require("../src/services/curatedStudyBootstrapService");

function parseArgs(argv) {
    return {
        merge: argv.includes("--merge"),
        json: argv.includes("--json"),
    };
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Curated Study Init");
    lines.push("");
    lines.push(`Starter entries available: ${summary.starterEntries}`);
    lines.push(`Existing target entries: ${summary.existingEntries}`);
    lines.push(`Written target entries: ${summary.writtenEntries}`);
    lines.push(`Mode: ${summary.merge ? "merge" : "initialize"}`);
    lines.push(`Target file: ${summary.targetPath}`);
    lines.push("");

    if (!summary.changed) {
        lines.push("No file changes were made because curated study data already exists. Re-run with `--merge` to add starter entries.");
    } else {
        lines.push("Curated study data is ready.");
        lines.push("Next steps:");
        lines.push("- Run `npm run doctor` to see the updated curated coverage.");
        lines.push("- Run `npm run deck:preview -- --level=5 --limit=5` to inspect the improved notes and meanings.");
        lines.push("- Edit curated entries over time with stronger meanings, better notes, and hand-picked examples.");
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const starterPath = path.resolve(process.cwd(), "templates", "starter_curated_study_data.json");

    if (!fs.existsSync(starterPath)) {
        throw new Error(`Missing starter curated study data at ${starterPath}`);
    }

    const summary = bootstrapCuratedStudyData({
        targetPath: config.curatedStudyDataPath,
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
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
