const path = require("node:path");
const fs = require("node:fs");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { importAudioDirectory } = require("../src/services/audioImportService");
const { parseLevelsArgument } = require("../src/services/mediaGapService");

function parseArgs(argv) {
    const options = {
        inputDir: null,
        levels: [5],
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--input-dir=")) {
            options.inputDir = parseStringOption(arg, "input-dir");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function selectKanjiList(jlptOnlyJson, levels) {
    const targetLevels = new Set(levels);
    return Object.entries(jlptOnlyJson || {})
        .filter(([, value]) => targetLevels.has(value?.jlpt))
        .map(([kanji]) => kanji)
        .sort((a, b) => a.localeCompare(b));
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Audio Import");
    lines.push("");
    lines.push(`Scanned files: ${summary.scannedFiles}`);
    lines.push(`Imported audio files: ${summary.importedAudio}`);
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
    lines.push(`Audio destination: ${summary.audioDestinationDir}`);
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("media:audio:import", options.unknownArgs);
    if (!options.inputDir) {
        throw new Error("Missing --input-dir=... for the local audio source folder.");
    }

    const config = loadConfig();
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const kanjiList = selectKanjiList(jlptOnlyJson, options.levels);
    const summary = await importAudioDirectory({
        inputDir: path.resolve(options.inputDir),
        kanjiList,
        audioDestinationDir: config.audioSourceDir,
    });

    summary.audioDestinationDir = config.audioSourceDir;

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
