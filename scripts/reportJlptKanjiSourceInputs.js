const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { loadJlptKanjiSourceEvidence } = require("../src/datasets/jlptKanjiSourceEvidence");
const { loadJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");
const { buildJlptKanjiSourceInputReport } = require("../src/services/jlptKanjiSourceInputService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONFIG = "templates/jlpt_kanji_source_inputs.json";
const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_EVIDENCE = "templates/jlpt_kanji_source_evidence.json";

function parseArgs(argv) {
    const options = {
        config: DEFAULT_CONFIG,
        contract: DEFAULT_CONTRACT,
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
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
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
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const inputManifest = options.inputManifest || loadJlptKanjiSourceInputs(configPath);
    const contract = options.contractData || loadJlptLevelContract(contractPath);
    const evidence = options.evidenceData || loadJlptKanjiSourceEvidence(evidencePath);
    const sourceIds = options.source ? [options.source] : Object.keys(inputManifest.inputs || {});
    const reports = sourceIds.map((sourceId) => {
        const sourceConfig = inputManifest.inputs?.[sourceId];
        if (!sourceConfig) {
            return {
                valid: false,
                noDeckMutation: inputManifest.policy.noDeckMutation !== false,
                sourceId,
                blockers: [`unknown source input: ${sourceId}`],
                rowCount: 0,
                reviewedAssignmentCount: 0,
                pendingRowCount: 0,
                blockedRowCount: 0,
                sourceAccessGapRowCount: 0,
                rejectedRowCount: 0,
                rejectedRows: [],
                assignments: {},
            };
        }
        const sourcePath = path.resolve(process.cwd(), sourceConfig.sourcePath);
        return buildJlptKanjiSourceInputReport({
            sourceId,
            sourceConfig,
            sourceBuffer: readOptionalBuffer(sourcePath),
            contract,
            evidence,
            policy: inputManifest.policy,
        });
    });

    return {
        valid: reports.every((report) => report.valid),
        configPath,
        contractPath,
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
        `- source label: ${report.sourceLabel || ""}`,
        `- format: ${report.format || ""}`,
        `- level mapping: ${report.levelMapping || ""}`,
        `- rows parsed: ${report.rowCount || 0}`,
        `- resolved rows: ${report.resolvedRowCount || 0}`,
        `- reviewed assignments ready: ${report.reviewedAssignmentCount || 0}`,
        `- pending rows: ${report.pendingRowCount || 0}`,
        `- blocked rows: ${report.blockedRowCount || 0}`,
        `- source access gap rows: ${report.sourceAccessGapRowCount || 0}`,
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
            lines.push(`- row ${row.rowNumber}: ${row.kanji || "?"}; ${row.issues.join("; ")}`);
        }
    }

    return lines.join("\n");
}

function formatJlptKanjiSourceInputsReport(result = {}, limit = 25) {
    return [
        "JLPT Kanji Source Input Preflight",
        "",
        `Overall result: ${result.valid ? "passing" : "blocked"}`,
        `Config: ${result.configPath}`,
        `Contract: ${result.contractPath}`,
        `Evidence: ${result.evidencePath}`,
        "",
        "This command is read-only: it does not move kanji, move words, update decks, or change readiness.",
        "",
        ...result.reports.flatMap((report) => [
            formatSourceInputReport(report, limit),
            "",
        ]),
    ].join("\n").trimEnd();
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:source-inputs", options.unknownArgs);
    const result = buildReports(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatJlptKanjiSourceInputsReport(result, options.limit)}\n`);
    }
    if (options.strict && !result.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    buildReports,
    formatJlptKanjiSourceInputsReport,
    formatSourceInputReport,
    main,
    parseArgs,
};
