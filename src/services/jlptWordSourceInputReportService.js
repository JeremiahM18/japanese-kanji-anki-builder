const fs = require("node:fs");
const path = require("node:path");

const { loadJlptWordSourceEvidence } = require("../datasets/jlptWordSourceEvidence");
const { loadJlptWordSourceInputs } = require("../datasets/jlptWordSourceInputs");
const { loadJlptWordLevelContract } = require("../datasets/jlptWordLevelContract");
const { buildJlptWordSourceInputReport } = require("./jlptWordSourceInputService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_word_source_inputs.json";
const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";
const DEFAULT_CONTRACT = "templates/jlpt_word_level_contract.json";

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        evidence: DEFAULT_EVIDENCE,
        source: null,
        json: false,
        strict: false,
        limit: 25,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--config=")) {
            options.config = arg.slice("--config=".length);
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = arg.slice("--evidence=".length);
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function readOptionalBuffer(filePath) {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

function buildReports(options = {}) {
    const configPath = path.resolve(process.cwd(), options.config || DEFAULT_CONFIG);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const inputManifest = options.inputManifest || loadJlptWordSourceInputs(configPath);
    const evidence = options.evidenceData || loadJlptWordSourceEvidence(evidencePath);
    const contract = options.contractData || loadJlptWordLevelContract(options.contract || DEFAULT_CONTRACT);
    const contractEntries = Object.entries(contract.wordLevels || {})
        .map(([key, entry]) => ({ key, ...entry }));
    const sourceIds = options.source ? [options.source] : Object.keys(inputManifest.inputs || {});
    const reports = sourceIds.map((sourceId) => {
        const sourceConfig = inputManifest.inputs?.[sourceId];
        if (!sourceConfig) {
            return {
                valid: false,
                noDeckMutation: inputManifest.policy.noDeckMutation !== false,
                sourceId,
                blockers: [`unknown word source input: ${sourceId}`],
                rowCount: 0,
                reviewedAssignmentCount: 0,
                pendingRowCount: 0,
                rejectedRowCount: 0,
                rejectedRows: [],
                assignments: {},
            };
        }
        const sourcePath = path.resolve(process.cwd(), sourceConfig.sourcePath);
        return buildJlptWordSourceInputReport({
            sourceId,
            sourceConfig,
            sourceBuffer: readOptionalBuffer(sourcePath),
            evidence,
            policy: inputManifest.policy,
            contractEntries,
        });
    });

    return {
        valid: reports.every((report) => report.valid),
        configPath,
        evidencePath,
        policy: inputManifest.policy,
        reports,
    };
}

function formatSourceInputReport(report = {}, limit = 25) {
    const lines = [
        `Source: ${report.sourceId}`,
        `- result: ${report.valid ? "passing" : "blocked"}`,
        `- source file: ${report.sourcePath || ""}`,
        `- rows parsed: ${report.rowCount || 0}`,
        `- resolved rows: ${report.resolvedRowCount || 0}`,
        `- reviewed assignments ready: ${report.reviewedAssignmentCount || 0}`,
        `- reviewed typed support facts ready: ${report.reviewedSupportFactCount || 0}`,
        `- pending rows: ${report.pendingRowCount || 0}`,
        `- blocked rows: ${report.blockedRowCount || 0}`,
        `- source access gap rows: ${report.sourceAccessGapRowCount || 0}`,
        `- license blocked rows: ${report.licenseBlockedRowCount || 0}`,
        `- rejected rows: ${report.rejectedRowCount || 0}`,
        `- no deck mutation: ${report.noDeckMutation === false ? "no" : "yes"}`,
    ];
    if (report.integrity) {
        lines.push(
            `- sha256: ${report.integrity.sha256 || ""}`,
            `- byte size: ${report.integrity.byteSize}`,
            `- integrity row count: ${report.integrity.rowCount}`
        );
    }
    if (report.blockers?.length > 0) {
        lines.push("Blockers:");
        for (const blocker of report.blockers.slice(0, Math.max(1, limit))) {
            lines.push(`- ${blocker}`);
        }
    }
    if (report.rejectedRows?.length > 0) {
        lines.push("Rejected row samples:");
        for (const row of report.rejectedRows.slice(0, Math.max(1, limit))) {
            lines.push(`- row ${row.rowNumber}: ${row.identity || "?"}; ${row.issues.join("; ")}`);
        }
    }
    return lines.join("\n");
}

function formatJlptWordSourceInputsReport(result = {}, limit = 25) {
    return [
        "JLPT Word Source Input Preflight",
        "",
        `Overall result: ${result.valid ? "passing" : "blocked"}`,
        `Config: ${result.configPath}`,
        `Evidence: ${result.evidencePath}`,
        "",
        "This command is read-only: it does not add words, move words, update decks, certify queues, or touch kanji lanes.",
        "",
        ...result.reports.flatMap((report) => [
            formatSourceInputReport(report, limit),
            "",
        ]),
    ].join("\n").trimEnd();
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:word-source-inputs", options.unknownArgs);
    const result = buildReports(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatJlptWordSourceInputsReport(result, options.limit)}\n`);
    }
    if (options.strict && !result.valid) {
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_CONFIG,
    DEFAULT_EVIDENCE,
    DEFAULT_CONTRACT,
    buildReports,
    formatJlptWordSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
    readOptionalBuffer,
};
