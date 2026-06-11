const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const {
    buildWordStudyDataStalenessReport,
    formatWordStudyDataOverlayProvenance,
} = require("../src/datasets/wordStudyData");
const { parseSapphireWordReviewSet } = require("../src/datasets/sapphireWordReviewSet");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const {
    buildPlatinumWordRereviewStatusReport,
    buildPlatinumWordRereviewStatusSummary,
    formatPlatinumWordRereviewStatusReport,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");
const {
    evaluateSapphireWordReviewSet,
} = require("../src/services/sapphireWordReviewService");

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
    proofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const reviewSetPath = path.join(process.cwd(), "templates", `platinum_n${level}_word_review_set.json`);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing platinum word review set at ${reviewSetPath}`);
    }

    return loadReviewSetWithObsidianProof({
        deckKind: "word",
        level,
        proofProvider,
    }).entries;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readPriorLaneInputs(level, { rows } = {}) {
    const goldenPath = path.join(process.cwd(), "templates", `golden_n${level}_word_review_set.json`);
    const sapphirePath = path.join(process.cwd(), "templates", `sapphire_n${level}_word_review_set.json`);
    if (!fs.existsSync(goldenPath)) {
        throw new Error(`Missing prior Gold word review set at ${goldenPath}`);
    }
    if (!fs.existsSync(sapphirePath)) {
        throw new Error(`Missing prior Sapphire word review set at ${sapphirePath}`);
    }
    const goldenExpectations = readJson(goldenPath);
    const sapphireEntries = parseSapphireWordReviewSet(
        readJson(sapphirePath),
        `templates/sapphire_n${level}_word_review_set.json`
    );
    const sapphireReport = evaluateSapphireWordReviewSet({
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
    commandName = "deck:words:platinum:rereview-status",
    defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const options = parseArgs(process.argv.slice(2), { defaultProofProvider });
    assertNoUnknownArgs(commandName, options.unknownArgs);
    const proofProvider = options.proofProvider;

    const config = loadConfig();
    const includeWordOverlayProvenance = commandName === "deck:words:obsidian:rereview-status";
    const wordStudyPreflight = includeWordOverlayProvenance
        ? buildWordStudyDataStalenessReport({
            localPath: config.wordStudyDataPath,
            starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
        })
        : null;
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = loadJlptOnlyJson(config.jlptJsonPath);
    const levelReports = [];
    for (const level of options.levels) {
        const entries = readReviewSet(level, { proofProvider });
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
    const summary = buildPlatinumWordRereviewStatusSummary(levelReports);
    if (wordStudyPreflight) {
        summary.wordStudyPreflight = wordStudyPreflight;
    }

    if (options.json) {
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    } else {
        if (wordStudyPreflight) {
            process.stdout.write(`${formatWordStudyDataOverlayProvenance(wordStudyPreflight)}\n\n`);
        }
        process.stdout.write(formatPlatinumWordRereviewStatusReport(summary));
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
