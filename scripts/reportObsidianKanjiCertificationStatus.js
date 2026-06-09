const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const { readPriorLaneInputs } = require("./reportPlatinumKanjiRereviewStatus");
const {
    buildPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");
const {
    buildObsidianKanjiCertificationStatusSummary,
    formatObsidianKanjiCertificationStatusReport,
} = require("../src/services/obsidianKanjiCertificationStatusService");

function parseArgs(argv, {
    defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const options = {
        json: false,
        levels: [5, 4],
        proofProvider: normalizeObsidianProofProviderMode(defaultProofProvider),
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--proof-provider=")) {
            options.proofProvider = normalizeObsidianProofProviderMode(parseStringOption(arg, "proof-provider"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readReviewSet(level, {
    cwd = process.cwd(),
    proofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    return loadReviewSetWithObsidianProof({
        cwd,
        deckKind: "kanji",
        level,
        proofProvider,
    }).entries;
}

async function main({
    commandName = "deck:kanji:obsidian:certify-status",
    defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const options = parseArgs(process.argv.slice(2), { defaultProofProvider });
    assertNoUnknownArgs(commandName, options.unknownArgs);

    const config = loadConfig();
    const levelReports = [];
    for (const level of options.levels) {
        const entries = readReviewSet(level, { proofProvider: options.proofProvider });
        const rows = await buildKanjiRowsForLevel({ level, config });
        const priorLaneInputs = readPriorLaneInputs(level, { rows });
        levelReports.push(buildPlatinumKanjiRereviewStatusReport({
            rows,
            entries,
            ...priorLaneInputs,
            requireLanePreconditions: true,
            level,
        }));
    }
    const summary = buildObsidianKanjiCertificationStatusSummary(levelReports);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatObsidianKanjiCertificationStatusReport(summary));
    }

    if (!summary.passed) {
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
    readReviewSet,
};
