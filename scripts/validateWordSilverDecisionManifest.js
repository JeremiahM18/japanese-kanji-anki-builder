"use strict";

const path = require("node:path");

const {
    formatWordSilverDecisionManifestReport,
    loadWordSilverDecisionManifest,
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
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
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
    assertNoUnknownArgs("deck:words:silver:manifest:validate", options.unknownArgs);

    if (!options.input) {
        throw new Error("Missing required --input=<manifest-json>.");
    }

    const manifestPath = path.resolve(process.cwd(), options.input);
    const validation = loadWordSilverDecisionManifest(manifestPath);

    if (options.json) {
        process.stdout.write(
            `${JSON.stringify({
                manifestPath,
                ok: validation.ok,
                errors: validation.errors,
                summary: validation.summary,
            }, null, 2)}\n`
        );
    } else {
        process.stdout.write(formatWordSilverDecisionManifestReport(validation));
    }

    if (!validation.ok) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
};
