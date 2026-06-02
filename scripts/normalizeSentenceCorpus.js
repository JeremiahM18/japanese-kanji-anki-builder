const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const { normalizeSentenceCorpus } = require("../src/datasets/sentenceCorpus");
const { readFileIfExistsSync, writeFileAtomicSync } = require("../src/utils/fs");

function parseArgs(argv) {
    const options = {
        input: null,
        output: null,
        check: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg.startsWith("--input=")) {
            options.input = parseStringOption(arg, "input");
        } else if (arg.startsWith("--output=")) {
            options.output = parseStringOption(arg, "output");
        } else if (arg === "--check") {
            options.check = true;
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function parseJsonArray(text, filePath) {
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
    assertNoUnknownArgs("corpus:normalize", options.unknownArgs);
    const inputPath = options.input || config.sentenceCorpusPath;
    const outputPath = options.output || inputPath;

    const rawText = readFileIfExistsSync(inputPath, "utf-8");
    if (rawText === null) {
        if (options.check) {
            console.log(JSON.stringify(buildMissingSummary(inputPath, outputPath, "check"), null, 2));
            return;
        }

        throw new Error(`Missing sentence corpus input at ${inputPath}`);
    }

    const rawEntries = parseJsonArray(rawText, inputPath);
    const normalizedEntries = normalizeSentenceCorpus(rawEntries);
    const normalizedText = `${JSON.stringify(normalizedEntries, null, 2)}\n`;
    const currentOutputText = readFileIfExistsSync(outputPath, "utf-8");

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

    writeFileAtomicSync(outputPath, normalizedText, "utf-8");
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
