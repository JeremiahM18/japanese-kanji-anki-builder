const fs = require("node:fs");
const { invokeCliMain } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { normalizeSentenceCorpus } = require("../src/datasets/sentenceCorpus");

function parseArgs(argv) {
    const options = {
        input: null,
        output: null,
        check: false,
    };

    for (const arg of argv) {
        if (arg.startsWith("--input=")) {
            options.input = arg.split("=")[1];
        } else if (arg.startsWith("--output=")) {
            options.output = arg.split("=")[1];
        } else if (arg === "--check") {
            options.check = true;
        }
    }

    return options;
}

function readJsonArray(filePath) {
    const text = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
        throw new Error(`Expected JSON array in ${filePath}`);
    }

    return parsed;
}

function buildMissingSummary(inputPath, outputPath, mode) {
    return {
        inputPath,
        outputPath,
        inputEntries: 0,
        outputEntries: 0,
        removedEntries: 0,
        changed: false,
        mode,
        missingInput: true,
    };
}

function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    const inputPath = options.input || config.sentenceCorpusPath;
    const outputPath = options.output || inputPath;

    if (!fs.existsSync(inputPath)) {
        if (options.check) {
            console.log(JSON.stringify(buildMissingSummary(inputPath, outputPath, "check"), null, 2));
            return;
        }

        throw new Error(`Missing sentence corpus input at ${inputPath}`);
    }

    const rawEntries = readJsonArray(inputPath);
    const normalizedEntries = normalizeSentenceCorpus(rawEntries);
    const normalizedText = `${JSON.stringify(normalizedEntries, null, 2)}\n`;
    const currentOutputText = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, "utf-8")
        : null;

    const summary = {
        inputPath,
        outputPath,
        inputEntries: rawEntries.length,
        outputEntries: normalizedEntries.length,
        removedEntries: rawEntries.length - normalizedEntries.length,
        changed: currentOutputText !== normalizedText,
        mode: options.check ? "check" : "write",
        missingInput: false,
    };

    if (options.check) {
        console.log(JSON.stringify(summary, null, 2));

        if (summary.changed) {
            process.exitCode = 1;
        }

        return;
    }

    fs.writeFileSync(outputPath, normalizedText, "utf-8");
    console.log(JSON.stringify(summary, null, 2));
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
