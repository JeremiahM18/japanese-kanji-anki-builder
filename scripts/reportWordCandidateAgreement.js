const path = require("node:path");
const fs = require("node:fs");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { loadWordSourceManifest } = require("../src/datasets/wordSourceManifest");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const {
    buildWordCandidateAgreementReport,
    formatWordCandidateAgreementReport,
} = require("../src/services/wordCandidateAgreementService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_WORD_SOURCE_MANIFEST = "templates/word_source_manifest.json";

function parseArgs(argv) {
    const options = {
        json: false,
        levels: [5, 4],
        limit: 40,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
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
        } else if (arg.startsWith("--triage=")) {
            options.triage = String(arg.slice("--triage=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveManifestPath(manifestPath = DEFAULT_WORD_SOURCE_MANIFEST) {
    return path.resolve(process.cwd(), manifestPath || DEFAULT_WORD_SOURCE_MANIFEST);
}

function loadTriageDecisionsByLevelSource(triagePath = "") {
    const normalizedPath = String(triagePath || "").trim();
    if (!normalizedPath) {
        return {};
    }
    const resolvedPath = path.resolve(process.cwd(), normalizedPath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Word inventory expansion triage file does not exist: ${resolvedPath}`);
    }
    return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

function loadSharedInputs() {
    return {
        jlptLevelContract: loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json")),
        jlptWordLevelContract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
        starterEntries: loadWordStudyData({
            starterPath: path.join(process.cwd(), "templates", "starter_word_study_data.json"),
            localPath: null,
        }),
        wordPitchAccentData: loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json")),
    };
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
