const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const {
    buildWordCandidateAgreementReport,
    formatWordCandidateAgreementReport,
    normalizePlacementMode,
} = require("../src/services/wordCandidateAgreementService");
const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    loadSharedInputs,
    loadTriageDecisionsByLevelSource,
    resolveManifestPath,
} = require("../src/services/wordExpansionSelectorSupportService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4],
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

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:candidate-agreement", options.unknownArgs);

    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Candidate agreement report limit must be a positive integer.");
    }

    const manifest = loadWordSourceManifest(resolveManifestPath(options.manifest));
    const report = buildWordCandidateAgreementReport({
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
        process.stdout.write(formatWordCandidateAgreementReport(report));
    }

    if (options.strict && (report.sourceBlockers.length > 0 || report.placementAudit.violationCount > 0)) {
        throw new Error("Word candidate agreement strict mode failed.");
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
    loadTriageDecisionsByLevelSource,
    loadSharedInputs,
    main,
    parseArgs,
    resolveManifestPath,
};
