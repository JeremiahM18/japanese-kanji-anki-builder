const fs = require("node:fs");
const path = require("node:path");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

const { loadConfig } = require("../src/config");
const {
    assertKanjiPlatinumPreflight,
    buildKanjiRowsForLevel,
    parseKanjiTsvForPlatinum,
} = require("../src/services/kanjiGeneratedRowsService");
const {
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");
const {
    evaluateSapphireKanjiReviewSet,
} = require("../src/services/sapphireKanjiReviewService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");

function parseArgs(argv) {
    const args = {
        allowEmpty: false,
        json: false,
        level: null,
        proofProvider: OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--allow-legacy-standard") {
            args.requireCurrentReviewStandard = false;
        } else if (arg === "--allow-empty") {
            args.allowEmpty = true;
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--require-all") {
            args.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            args.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--proof-provider=")) {
            args.proofProvider = normalizeObsidianProofProviderMode(parseStringOption(arg, "proof-provider"));
        } else {
            collectUnknownArg(args, arg);
        }
    }

    return args;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:platinum:n<level>", options.unknownArgs);
    const level = options.level;

    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Platinum kanji review level must be 1-5.");
    }

    const config = loadConfig();
    const reviewSetPath = path.join(process.cwd(), "templates", "platinum_n" + level + "_review_set.json");
    const sapphireReviewSetPath = path.join(process.cwd(), "templates", "sapphire_n" + level + "_review_set.json");
    const goldenReviewSetPath = path.join(process.cwd(), "templates", "golden_n" + level + "_review_set.json");

    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error("Missing JLPT JSON file at " + config.jlptJsonPath);
    }
    if (!fs.existsSync(config.kanjiComponentContractPath || "") && !fs.existsSync(config.kradfilePath || "")) {
        throw new Error(`Missing kanji component contract at ${config.kanjiComponentContractPath} and KRADFILE at ${config.kradfilePath}`);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error("Missing platinum kanji review set at " + reviewSetPath);
    }
    if (!fs.existsSync(sapphireReviewSetPath)) {
        throw new Error("Missing prior Sapphire kanji review set at " + sapphireReviewSetPath);
    }
    if (!fs.existsSync(goldenReviewSetPath)) {
        throw new Error("Missing prior Gold kanji review set at " + goldenReviewSetPath);
    }

    const reviewSet = loadReviewSetWithObsidianProof({
        cwd: process.cwd(),
        deckKind: "kanji",
        level,
        proofProvider: options.proofProvider,
    });
    const entries = reviewSet.entries;
    const sapphireEntries = loadJson(sapphireReviewSetPath);
    const goldenExpectations = loadJson(goldenReviewSetPath);
    assertKanjiPlatinumPreflight({ entries, level, options });
    const rows = await buildKanjiRowsForLevel({ level, config });
    const sapphireReport = evaluateSapphireKanjiReviewSet({
        rows,
        entries: sapphireEntries,
        goldenExpectations,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
        allowEmpty: options.allowEmpty,
    });
    const report = evaluatePlatinumKanjiReviewSet({
        rows,
        entries,
        goldenExpectations,
        requireGoldPrecondition: true,
        sapphireEntries,
        sapphireResults: sapphireReport.results,
        requireSapphirePrecondition: true,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        console.log(JSON.stringify({ report, rows }, null, 2));
        process.exit(report.passed ? 0 : 1);
    }

    process.stdout.write(formatPlatinumKanjiReviewReport(report, {
        title: "Japanese Kanji Builder Platinum N" + level + " Kanji Gate",
    }));
    process.exit(report.passed ? 0 : 1);
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    assertKanjiPlatinumPreflight,
    buildKanjiRowsForLevel,
    main,
    parseArgs,
    parseKanjiTsvForPlatinum,
};
