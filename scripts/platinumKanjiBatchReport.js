const fs = require("node:fs");
const path = require("node:path");
const { invokeCliMain, parseCsvOption, parseNumericOption, parseStringOption, collectUnknownArg, assertNoUnknownArgs } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { loadCuratedStudyData } = require("../src/datasets/curatedStudyData");
const { buildKanjiRowsForLevel } = require("../src/services/kanjiGeneratedRowsService");
const {
    OBSIDIAN_PROOF_PROVIDER_MODES,
    loadReviewSetWithObsidianProof,
    normalizeObsidianProofProviderMode,
} = require("../src/services/obsidianProofProviderService");
const {
    DEFAULT_KANJI_BATCH_QUEUE_MODE,
    buildPlatinumKanjiBatchReport,
    formatPlatinumKanjiBatchReport,
    normalizeQueueMode,
} = require("../src/services/platinumKanjiBatchReportService");

function parseLevel(value) {
    const normalized = String(value ?? "").trim().toUpperCase().replace(/^N/, "");
    const parsed = Number(normalized);
    return [1, 2, 3, 4, 5].includes(parsed) ? parsed : null;
}

function parseArgs(argv, {
    defaultProofProvider = OBSIDIAN_PROOF_PROVIDER_MODES.LEDGER_IF_AVAILABLE,
} = {}) {
    const options = {
        json: false,
        kanji: [],
        level: null,
        limit: 12,
        proofProvider: normalizeObsidianProofProviderMode(defaultProofProvider),
        queue: DEFAULT_KANJI_BATCH_QUEUE_MODE,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--kanji=")) {
            options.kanji = parseCsvOption(arg, "kanji");
        } else if (arg.startsWith("--level=")) {
            options.level = parseLevel(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--proof-provider=")) {
            options.proofProvider = normalizeObsidianProofProviderMode(parseStringOption(arg, "proof-provider"));
        } else if (arg.startsWith("--queue=")) {
            options.queue = normalizeQueueMode(parseStringOption(arg, "queue"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("platinumKanjiBatchReport", options.unknownArgs);

    if (!Number.isInteger(options.level) || options.level < 1 || options.level > 5) {
        throw new Error("Platinum kanji batch report level must be 1-5.");
    }

    const config = loadConfig();
    const entries = loadReviewSetWithObsidianProof({
        deckKind: "kanji",
        level: options.level,
        proofProvider: options.proofProvider,
    }).entries;
    const sapphireReviewSetPath = path.join(process.cwd(), "templates", `sapphire_n${options.level}_review_set.json`);
    if (!fs.existsSync(sapphireReviewSetPath)) {
        throw new Error(`Missing prior Sapphire kanji review set at ${sapphireReviewSetPath}`);
    }
    const sapphireEntries = loadJson(sapphireReviewSetPath);
    const curatedStudyData = loadCuratedStudyData(config.curatedStudyDataPath);
    const rows = await buildKanjiRowsForLevel({ level: options.level, config });
    const report = buildPlatinumKanjiBatchReport({
        rows,
        entries,
        sapphireEntries,
        level: options.level,
        kanji: options.kanji,
        limit: options.limit,
        queue: options.queue,
        curatedStudyData,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatPlatinumKanjiBatchReport(report));
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
