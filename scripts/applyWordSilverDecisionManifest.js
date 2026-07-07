"use strict";

const path = require("node:path");

const {
    applyWordSilverDecisionManifest,
    formatWordSilverApplyReport,
} = require("../src/services/wordSilverReviewPipelineService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        input: "",
        json: false,
        write: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--write") {
            options.write = true;
        } else if (arg.startsWith("--input=")) {
            options.input = parseStringOption(arg, "input").trim();
        } else if (arg.startsWith("--manifest=")) {
            options.input = parseStringOption(arg, "manifest").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:silver:apply", options.unknownArgs);

    if (!options.input) {
        throw new Error("Missing required --input=<manifest-json>.");
    }

    const report = applyWordSilverDecisionManifest({
        manifestPath: path.resolve(process.cwd(), options.input),
        rootDir: process.cwd(),
        write: options.write,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordSilverApplyReport(report));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        if (error.validation) {
            process.stderr.write(
                `${error.message}\n${JSON.stringify(error.validation.errors, null, 2)}\n`
            );
        } else if (error.errors) {
            process.stderr.write(
                `${error.message}\n${JSON.stringify(error.errors, null, 2)}\n`
            );
        } else {
            console.error(error.stack || error);
        }
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
