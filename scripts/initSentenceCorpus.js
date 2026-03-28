const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { bootstrapSentenceCorpus } = require("../src/services/sentenceCorpusBootstrapService");

function parseArgs(argv) {
    return {
        merge: argv.includes("--merge"),
        json: argv.includes("--json"),
    };
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Sentence Corpus Init");
    lines.push("");
    lines.push(`Starter entries available: ${summary.starterEntries}`);
    lines.push(`Existing target entries: ${summary.existingEntries}`);
    lines.push(`Written target entries: ${summary.writtenEntries}`);
    lines.push(`Mode: ${summary.merge ? "merge" : "initialize"}`);
    lines.push(`Target file: ${summary.targetPath}`);
    lines.push("");

    if (!summary.changed) {
        lines.push("No file changes were made because a sentence corpus already exists. Re-run with `--merge` to add starter entries.");
    } else {
        lines.push("Sentence corpus is ready.");
        lines.push("Next steps:");
        lines.push("- Run `npm run corpus:report -- --limit=25` to see remaining coverage gaps.");
        lines.push("- Run `npm run deck:preview -- --level=5 --limit=5` to inspect the improved examples.");
        lines.push("- Edit the sentence corpus over time with better or more specific learner-friendly examples.");
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    const config = loadConfig();
    const starterPath = path.resolve(process.cwd(), "templates", "starter_sentence_corpus.json");

    if (!fs.existsSync(starterPath)) {
        throw new Error(`Missing starter sentence corpus at ${starterPath}`);
    }

    const summary = bootstrapSentenceCorpus({
        targetPath: config.sentenceCorpusPath,
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
