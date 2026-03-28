const fs = require("node:fs");

const { loadConfig } = require("../src/config");
const { normalizeCuratedStudyData } = require("../src/datasets/curatedStudyData");

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

function buildMissingSummary(inputPath, outputPath, mode) {
    return {
        inputPath,
        outputPath,
        inputEntries: 0,
        outputEntries: 0,
        changed: false,
        mode,
        missingInput: true,
    };
}

function main() {
    const config = loadConfig();
    const options = parseArgs(process.argv.slice(2));
    const inputPath = options.input || config.curatedStudyDataPath;
    const outputPath = options.output || inputPath;

    if (!fs.existsSync(inputPath)) {
        if (options.check) {
            console.log(JSON.stringify(buildMissingSummary(inputPath, outputPath, "check"), null, 2));
            return;
        }

        throw new Error(`Missing curated study data input at ${inputPath}`);
    }

    const rawText = fs.readFileSync(inputPath, "utf-8");
    const rawData = JSON.parse(rawText);
    const normalizedData = normalizeCuratedStudyData(rawData);
    const normalizedText = `${JSON.stringify(normalizedData, null, 2)}\n`;
    const currentOutputText = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, "utf-8")
        : null;

    const summary = {
        inputPath,
        outputPath,
        inputEntries: Object.keys(rawData || {}).length,
        outputEntries: Object.keys(normalizedData).length,
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
    main().catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
