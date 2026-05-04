const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption } = require("../src/utils/cliArgs");
const {
    buildWordInventoryExpansionCandidateReport,
    formatWordInventoryExpansionCandidateReport,
    parseCandidateSourceText,
} = require("../src/services/wordInventoryExpansionCandidateService");

function parseArgs(argv) {
    const options = {
        format: "auto",
        json: false,
        kanjiScope: "at-or-below",
        level: 5,
        limit: 50,
        requireSourceLevel: false,
        source: "",
        sourceLabel: "",
        triage: "",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--require-source-level") {
            options.requireSourceLevel = true;
        } else if (arg.startsWith("--format=")) {
            options.format = String(arg.split("=")[1] || "").trim();
        } else if (arg.startsWith("--kanji-scope=")) {
            options.kanjiScope = String(arg.split("=")[1] || "").trim();
        } else if (arg.startsWith("--level=")) {
            options.level = parseNumericOption(arg, "level");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else if (arg.startsWith("--source=")) {
            options.source = String(arg.slice("--source=".length) || "").trim();
        } else if (arg.startsWith("--source-label=")) {
            options.sourceLabel = String(arg.slice("--source-label=".length) || "").trim();
        } else if (arg.startsWith("--triage=")) {
            options.triage = String(arg.slice("--triage=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveSourcePath(source) {
    if (!source) {
        throw new Error("Missing --source path. Provide a TSV, CSV, or JSON vocab source to inspect.");
    }
    return path.resolve(process.cwd(), source);
}

function resolveTriagePath(triagePath) {
    const explicitPath = String(triagePath || "").trim();
    if (explicitPath) {
        return path.resolve(process.cwd(), explicitPath);
    }

    const defaultPath = path.resolve(process.cwd(), "templates", "word_inventory_expansion_triage.json");
    return fs.existsSync(defaultPath) ? defaultPath : "";
}

function loadTriageDecisions({ triagePath, level, sourceLabel }) {
    const resolvedPath = resolveTriagePath(triagePath);
    if (!resolvedPath) {
        return {};
    }
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Expansion triage file does not exist: ${resolvedPath}`);
    }

    const triage = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
    const levelLabel = `N${level}`;
    return triage?.[levelLabel]?.[sourceLabel] || triage?.[levelLabel]?._default || {};
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:words:expansion-candidates", options.unknownArgs);

    const level = Number(options.level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Expansion candidate level must be 1-5.");
    }
    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("Expansion candidate limit must be a positive integer.");
    }

    const sourcePath = resolveSourcePath(options.source);
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Candidate source does not exist: ${sourcePath}`);
    }
    const sourceLabel = options.sourceLabel || path.basename(sourcePath);

    const sourceRows = parseCandidateSourceText(fs.readFileSync(sourcePath, "utf8"), {
        format: options.format,
    });
    const report = buildWordInventoryExpansionCandidateReport({
        sourceRows,
        targetLevel: level,
        kanjiScope: options.kanjiScope,
        limit,
        requireSourceLevel: options.requireSourceLevel,
        sourceLabel,
        triageDecisions: loadTriageDecisions({
            triagePath: options.triage,
            level,
            sourceLabel,
        }),
        jlptLevelContract: loadJlptLevelContract(path.join(process.cwd(), "templates", "jlpt_level_contract.json")),
        jlptWordLevelContract: loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json")),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatWordInventoryExpansionCandidateReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    loadTriageDecisions,
    main,
    parseArgs,
    resolveSourcePath,
    resolveTriagePath,
};
