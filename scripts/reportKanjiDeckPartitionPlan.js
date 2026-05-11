const fs = require("node:fs");
const path = require("node:path");

const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const {
    CANDIDATE_SCOPES,
    buildKanjiDeckPartitionPlan,
    formatKanjiDeckPartitionPlan,
} = require("../src/services/kanjiDeckPartitionPlanService");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildSourceLevelDeltaReportFromPaths,
} = require("./auditJlptKanjiSourceLevelDeltas");

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        candidateScope: CANDIDATE_SCOPES.LEARNER_ADDITIONS_ONLY,
        evidence: DEFAULT_EVIDENCE,
        includeDisputed: false,
        json: false,
        levels: [5, 4, 3, 2, 1],
        limit: 20,
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--include-disputed") {
            options.includeDisputed = true;
        } else if (arg.startsWith("--candidate-scope=")) {
            options.candidateScope = parseStringOption(arg, "candidate-scope");
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
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

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:partition-plan", options.unknownArgs);

    const contractPath = resolveExistingPath(options.contract, "JLPT level contract");
    const evidencePath = resolveExistingPath(options.evidence, "JLPT kanji source evidence file");
    const sourceInputsPath = options.sourceInputs
        ? resolveExistingPath(options.sourceInputs, "JLPT kanji source input config")
        : null;
    const { contract, report: deltaReport } = buildSourceLevelDeltaReportFromPaths({
        contractPath,
        evidencePath,
        sourceInputsPath,
        limit: options.limit,
    });
    const plan = buildKanjiDeckPartitionPlan({
        contract,
        deltaReport,
        levels: options.levels,
        includeDisputed: options.includeDisputed,
        candidateScope: options.candidateScope,
    });

    const output = {
        contractPath,
        evidencePath,
        sourceInputsPath,
        ...plan,
    };

    if (options.json) {
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatKanjiDeckPartitionPlan(output, { limit: options.limit }));
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
