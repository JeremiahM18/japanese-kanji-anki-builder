const { loadConfig } = require("../src/config");
const fs = require("node:fs");
const path = require("node:path");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildKanjiRowsForLevel } = require("../src/services/kanjiGeneratedRowsService");
const {
    buildPlatinumKanjiRereviewStatusReport,
    buildPlatinumKanjiRereviewStatusSummary,
    formatPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");
const {
    evaluateSapphireKanjiReviewSet,
} = require("../src/services/sapphireKanjiReviewService");

function parseArgs(argv, { defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE } = {}) {
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

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPriorLaneInputs(level, { rows } = {}) {
    const goldenPath = path.join(process.cwd(), "templates", `golden_n${level}_review_set.json`);
    const sapphirePath = path.join(process.cwd(), "templates", `sapphire_n${level}_review_set.json`);
    if (!fs.existsSync(goldenPath)) {
        throw new Error(`Missing prior Gold kanji review set at ${goldenPath}`);
    }
    if (!fs.existsSync(sapphirePath)) {
        throw new Error(`Missing prior Sapphire kanji review set at ${sapphirePath}`);
    }
    const goldenExpectations = readJson(goldenPath);
    const sapphireEntries = readJson(sapphirePath);
    const sapphireReport = evaluateSapphireKanjiReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
    });
    return {
        goldenExpectations,
        sapphireEntries,
        sapphireResults: sapphireReport.results,
    };
}

async function main({
    commandName = "deck:platinum:rereview-status",
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
    const summary = buildPlatinumKanjiRereviewStatusSummary(levelReports);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(formatPlatinumKanjiRereviewStatusReport(summary));
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
    readPriorLaneInputs,
    readReviewSet,
};
