const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const {
    buildJlptKanjiSourceAccessReport,
    countReviewStatuses,
    formatJlptKanjiSourceAccessReport,
} = require("../src/services/jlptKanjiSourceAccessService");
const { parseSourceAssignmentRows } = require("../src/services/jlptKanjiSourceInputService");
const { buildJlptKanjiSourceLevelDeltaReport } = require("../src/services/jlptKanjiSourceLevelDeltaService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseNumericOption, parseStringOption } = require("../src/utils/cliArgs");
const {
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_INPUTS,
    buildSourceInputReviews,
} = require("../src/services/jlptKanjiSourceLevelDeltaCommandService");

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        evidence: DEFAULT_EVIDENCE,
        sourceInputs: DEFAULT_SOURCE_INPUTS,
        source: null,
        limit: 12,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = parseStringOption(arg, "contract");
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = parseStringOption(arg, "evidence");
        } else if (arg.startsWith("--source-inputs=")) {
            options.sourceInputs = parseStringOption(arg, "source-inputs");
        } else if (arg.startsWith("--source=")) {
            options.source = parseStringOption(arg, "source");
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function buildSourceFileSummaries(sourceInputs = {}) {
    const sourceFiles = {};
    const statusCountsBySource = {};

    for (const [sourceId, sourceInput] of Object.entries(sourceInputs.inputs || {})) {
        const sourcePath = sourceInput.sourcePath
            ? path.resolve(process.cwd(), sourceInput.sourcePath)
            : "";
        if (!sourcePath || !fs.existsSync(sourcePath)) {
            sourceFiles[sourceId] = {
                exists: false,
                path: sourcePath,
                byteSize: 0,
                rowCount: 0,
            };
            statusCountsBySource[sourceId] = {};
            continue;
        }

        const buffer = fs.readFileSync(sourcePath);
        const rows = parseSourceAssignmentRows(buffer.toString("utf8"), sourceInput.format || "tsv");
        sourceFiles[sourceId] = {
            exists: true,
            path: sourcePath,
            byteSize: buffer.length,
            rowCount: rows.length,
        };
        statusCountsBySource[sourceId] = countReviewStatuses(rows, sourceInput);
    }

    return { sourceFiles, statusCountsBySource };
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const sourceInputsPath = path.resolve(process.cwd(), options.sourceInputs || DEFAULT_SOURCE_INPUTS);
    const contract = loadJlptLevelContract(contractPath);
    const evidence = loadJlptKanjiSourceEvidence(evidencePath);
    const sourceInputs = loadJlptKanjiSourceInputs(sourceInputsPath);
    const { sourceFiles, statusCountsBySource } = buildSourceFileSummaries(sourceInputs);
    const sourceInputReviews = buildSourceInputReviews({ sourceInputsPath, evidence });
    const levelDeltaReport = buildJlptKanjiSourceLevelDeltaReport({
        contract,
        evidence,
        limit: Number.MAX_SAFE_INTEGER,
        sourceInputReviews,
    });

    return {
        contractPath,
        evidencePath,
        sourceInputsPath,
        ...buildJlptKanjiSourceAccessReport({
            evidence,
            sourceInputs,
            sourceFiles,
            sourceInputStatusCountsBySource: statusCountsBySource,
            worklistRows: levelDeltaReport.reviewWorklist,
            sourceId: options.source || null,
        }),
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:source-access", options.unknownArgs);
    const report = run(options);

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(`${formatJlptKanjiSourceAccessReport(report, { limit: options.limit })}\n`);
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildSourceFileSummaries,
    main,
    parseArgs,
    run,
};
