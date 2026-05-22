const path = require("node:path");
const fs = require("node:fs");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { importFreeStrokeOrderDirectory } = require("../src/services/freeStrokeOrderImportService");

function parseArgs(argv) {
    const options = {
        inputDir: null,
        limit: null,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--input-dir=")) {
            options.inputDir = parseStringOption(arg, "input-dir");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
        collectUnknownArg(options, "--limit must be a positive integer");
    }

    return options;
}

function selectKanjiList(jlptOnlyJson, limit) {
    const kanjiList = Object.keys(jlptOnlyJson || {});
    if (Number.isFinite(limit) && limit > 0) {
        return kanjiList.slice(0, limit);
    }

    return kanjiList;
}

function formatReport(summary) {
    const lines = [];
    lines.push("Japanese Kanji Builder Free Stroke-Order Import");
    lines.push("");
    lines.push(`Scanned files: ${summary.scannedFiles}`);
    lines.push(`Imported images: ${summary.importedImages}`);
    lines.push(`Imported animations: ${summary.importedAnimations}`);
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
    lines.push(`Animation destination: ${summary.animationDestinationDir}`);
    return `${lines.join("\n")}\n`;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("media:stroke-order:import-free", options.unknownArgs);
    if (!options.inputDir) {
        throw new Error("Missing --input-dir=... for the free stroke-order source folder.");
    }

    const config = loadConfig();
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const jlptOnlyJson = loadJlptOnlyJson(config.jlptJsonPath);
    const kanjiList = selectKanjiList(jlptOnlyJson, options.limit);
    const summary = await importFreeStrokeOrderDirectory({
        inputDir: path.resolve(options.inputDir),
        kanjiList,
        imageDestinationDir: config.strokeOrderImageSourceDir,
        animationDestinationDir: config.strokeOrderAnimationSourceDir,
    });

    summary.imageDestinationDir = config.strokeOrderImageSourceDir;
    summary.animationDestinationDir = config.strokeOrderAnimationSourceDir;

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
