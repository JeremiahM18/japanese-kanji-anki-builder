const path = require("node:path");
const fs = require("node:fs");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/mediaSourceReportService");
const { importKanjiVgDirectory } = require("../src/services/kanjiVgImportService");

function parseArgs(argv) {
    const options = {
        inputDir: null,
        levels: null,
        limit: null,
        json: argv.includes("--json"),
    };

    for (const arg of argv) {
        if (arg.startsWith("--input-dir=")) {
            options.inputDir = arg.split("=")[1];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(arg.split("=")[1]);
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        }
    }

    return options;
}

function selectKanjiList(jlptOnlyJson, levels, limit) {
    let kanjiList = Object.entries(jlptOnlyJson || {})
        .filter(([, value]) => !Array.isArray(levels) || levels.length === 0 || levels.includes(Number(value?.jlpt)))
        .map(([kanji]) => kanji);

    if (Number.isFinite(limit) && limit > 0) {
        kanjiList = kanjiList.slice(0, limit);
    }

    return kanjiList;
}

function formatLevels(levels) {
    return Array.isArray(levels) && levels.length > 0
        ? levels.map((level) => `N${level}`).join(", ")
        : "all";
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder KanjiVG Import");
    lines.push("");
    lines.push(`Target levels: ${formatLevels(summary.levels)}`);
    lines.push(`Scanned files: ${summary.scannedFiles}`);
    lines.push(`Imported images: ${summary.importedImages}`);
    lines.push(`Updated files: ${summary.updatedFiles}`);
    lines.push(`Unchanged files: ${summary.unchangedFiles}`);
    lines.push(`Skipped files: ${summary.skippedFiles}`);

    if (summary.skipped.length > 0) {
        lines.push("");
        lines.push("Skipped sample:");
        for (const entry of summary.skipped.slice(0, 10)) {
            lines.push(`- ${entry.filePath} (${entry.reason})`);
        }
    }

    lines.push("");
    lines.push(`Image destination: ${summary.imageDestinationDir}`);
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (!options.inputDir) {
        throw new Error("Missing --input-dir=... for the extracted KanjiVG source folder.");
    }

    const config = loadConfig();
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = JSON.parse(fs.readFileSync(config.jlptJsonPath, "utf-8"));
    const kanjiList = selectKanjiList(jlptOnlyJson, options.levels, options.limit);
    const summary = await importKanjiVgDirectory({
        inputDir: path.resolve(options.inputDir),
        kanjiList,
        imageDestinationDir: config.strokeOrderImageSourceDir,
    });

    summary.imageDestinationDir = config.strokeOrderImageSourceDir;
    summary.levels = options.levels || [];

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
