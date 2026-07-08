const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    CANDIDATE_SCOPES,
} = require("../src/services/kanjiDeckPartitionPlanService");
const {
    buildKanjiDeckReviewStatus,
    formatKanjiDeckReviewStatus,
} = require("../src/services/kanjiDeckReviewStatusService");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildSourceLevelDeltaReportFromPaths,
} = require("../src/services/jlptKanjiSourceLevelDeltaCommandService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        additionalOutDir: null,
        candidateScope: CANDIDATE_SCOPES.ALL_SOURCE_CLAIMS,
        contract: DEFAULT_CONTRACT,
        coreOutDir: null,
        evidence: DEFAULT_EVIDENCE,
        includeDisputed: false,
        json: false,
        levels: [5, 4, 3, 2, 1],
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-disputed") {
            options.includeDisputed = true;
        } else if (arg.startsWith("--additional-out-dir=")) {
            options.additionalOutDir = parseStringOption(arg, "additional-out-dir");
        } else if (arg.startsWith("--candidate-scope=")) {
            options.candidateScope = parseStringOption(arg, "candidate-scope");
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--core-out-dir=")) {
            options.coreOutDir = parseStringOption(arg, "core-out-dir");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--source-inputs=")) {
            options.sourceInputs = parseStringOption(arg, "source-inputs");
        } else if (arg === "--no-source-inputs") {
            options.sourceInputs = null;
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolveExistingPath(filePath, label) {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Missing ${label}: ${resolvedPath}`);
    }
    return resolvedPath;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:review-status", options.unknownArgs);

    const config = loadConfig();
    const contractPath = resolveExistingPath(options.contract, "JLPT level contract");
    const evidencePath = resolveExistingPath(options.evidence, "JLPT kanji source evidence file");
    const sourceInputsPath = options.sourceInputs
        ? resolveExistingPath(options.sourceInputs, "JLPT kanji source input config")
        : null;
    const { contract, report: deltaReport } = buildSourceLevelDeltaReportFromPaths({
        contractPath,
        evidencePath,
        sourceInputsPath,
    });
    const report = buildKanjiDeckReviewStatus({
        contract,
        deltaReport,
        levels: options.levels,
        includeDisputed: options.includeDisputed,
        candidateScope: options.candidateScope,
        coreOutDir: options.coreOutDir || config.buildOutDir,
        additionalOutDir: options.additionalOutDir || path.join(config.buildOutDir, "additional_unverified"),
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatKanjiDeckReviewStatus(report));
    }

    if (!report.passed) {
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
};
