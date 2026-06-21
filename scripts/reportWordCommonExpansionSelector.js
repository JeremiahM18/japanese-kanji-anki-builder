const path = require("node:path");

const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const {
    buildWordCommonExpansionSelectorReport,
    formatWordCommonExpansionSelectorReport,
} = require("../src/services/wordCommonExpansionSelectorService");
const { normalizePlacementMode } = require("../src/services/wordCandidateAgreementService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");
const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    loadSharedInputs,
    loadTriageDecisionsByLevelSource,
    resolveManifestPath,
} = require("./reportWordCandidateAgreement");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        limit: 40,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        placementMode: process.env.JKB_WORD_PLACEMENT_MODE || "kanji-anchor",
        strict: false,
        triage: "templates/word_inventory_expansion_triage.json",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--level=")) {
            options.levels = [parseNumericOption(arg, "level")];
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseCsvOption(arg, "levels").map((level) => Number(level));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--manifest=")) {
            options.manifest = String(arg.slice("--manifest=".length) || "").trim();
        } else if (arg.startsWith("--placement-mode=")) {
            options.placementMode = String(arg.slice("--placement-mode=".length) || "").trim();
        } else if (arg.startsWith("--placement=")) {
            options.placementMode = String(arg.slice("--placement=".length) || "").trim();
        } else if (arg.startsWith("--triage=")) {
            options.triage = String(arg.slice("--triage=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function validateLevels(levels = []) {
    if (!Array.isArray(levels) || levels.length === 0) {
        throw new Error("Common expansion selector requires at least one level.");
    }
    for (const level of levels) {
        if (!Number.isInteger(level) || level < 1 || level > 5) {
            throw new Error("Common expansion selector levels must be 1-5.");
        }
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:common-expansion", options.unknownArgs);
    validateLevels(options.levels);

    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Common expansion selector limit must be a positive integer.");
    }

    const manifest = loadWordSourceManifest(resolveManifestPath(options.manifest));
    const report = buildWordCommonExpansionSelectorReport({
        levels: options.levels,
        manifest,
        limit,
        placementMode: normalizePlacementMode(options.placementMode),
        triageDecisionsByLevelSource: loadTriageDecisionsByLevelSource(options.triage),
        ...loadSharedInputs(),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatWordCommonExpansionSelectorReport(report));
    }

    if (options.strict && (report.blockers.length > 0 || report.placementAudit.violationCount > 0)) {
        throw new Error("Word common expansion selector strict mode failed.");
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_WORD_SOURCE_MANIFEST,
    main,
    parseArgs,
    resolveManifestPath: (manifestPath = DEFAULT_WORD_SOURCE_MANIFEST) => path.resolve(process.cwd(), manifestPath || DEFAULT_WORD_SOURCE_MANIFEST),
    validateLevels,
};
