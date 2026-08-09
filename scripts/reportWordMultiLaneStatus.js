"use strict";

const { loadConfig } = require("../src/config");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");
const {
    buildCompactWordMultiLaneStatus,
    buildWordMultiLaneStatus,
    formatWordMultiLaneStatus,
} = require("../src/services/wordMultiLaneStatusService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseExplicitJlptLevels,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        json: false,
        summary: false,
        levels: [],
        lanes: null,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--summary") {
            options.summary = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = parseExplicitJlptLevels(parseStringOption(arg, "level"), "level");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseExplicitJlptLevels(parseStringOption(arg, "levels"), "levels");
        } else if (arg.startsWith("--lanes=")) {
            options.lanes = parseStringOption(arg, "lanes").split(",");
        } else if (arg.startsWith("--proof-provider=")) {
            options.proofProvider = normalizeObsidianProofProviderMode(parseStringOption(arg, "proof-provider"));
        } else {
            collectUnknownArg(options, arg);
        }
    }
    if (options.json && options.summary) {
        throw new Error("Choose exactly one of --json or --summary.");
    }
    if (options.levels.length === 0) {
        throw new Error("Word multi-lane status requires --level=<1-5> or --levels=<levels>.");
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:multi-lane-status", options.unknownArgs);
    const status = await buildWordMultiLaneStatus({
        levels: options.levels,
        lanes: options.lanes || undefined,
        config: loadConfig(),
        proofProvider: options.proofProvider,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    } else if (options.summary) {
        process.stdout.write(`${JSON.stringify(buildCompactWordMultiLaneStatus(status), null, 2)}\n`);
    } else {
        process.stdout.write(formatWordMultiLaneStatus(status));
    }
    if (!status.passed) {
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
