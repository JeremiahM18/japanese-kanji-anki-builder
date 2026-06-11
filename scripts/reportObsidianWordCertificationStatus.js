const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const {
    buildWordStudyDataStalenessReport,
    formatWordStudyDataOverlayProvenance,
} = require("../src/datasets/wordStudyData");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const { readPriorLaneInputs } = require("./reportPlatinumWordRereviewStatus");
const {
    buildPlatinumWordRereviewStatusReport,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    buildObsidianWordCertificationStatusSummary,
    formatObsidianWordCertificationStatusReport,
} = require("../src/services/obsidianWordCertificationStatusService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");

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
        deckKind: "word",
        level,
        proofProvider,
    }).entries;
}

async function main({
    commandName = "deck:words:obsidian:certify-status",
    defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const options = parseArgs(process.argv.slice(2), { defaultProofProvider });
    assertNoUnknownArgs(commandName, options.unknownArgs);

    const config = loadConfig();
    const wordStudyPreflight = buildWordStudyDataStalenessReport({
        localPath: config.wordStudyDataPath,
        starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
    });
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = loadJlptOnlyJson(config.jlptJsonPath);
    const levelReports = [];
    for (const level of options.levels) {
        const entries = readReviewSet(level, { proofProvider: options.proofProvider });
        const rows = await buildWordRowsForLevel({ level, config });
        const priorLaneInputs = readPriorLaneInputs(level, { rows });
        levelReports.push(buildPlatinumWordRereviewStatusReport({
            rows,
            entries,
            ...priorLaneInputs,
            requireLanePreconditions: true,
            level,
            wordPitchAccentData,
            kanjiLevelData,
        }));
    }
    const summary = buildObsidianWordCertificationStatusSummary(levelReports);
    summary.wordStudyPreflight = wordStudyPreflight;

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatWordStudyDataOverlayProvenance(wordStudyPreflight)}\n\n`);
        process.stdout.write(formatObsidianWordCertificationStatusReport(summary));
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
