const path = require("node:path");

const { loadJlptWordSourceEvidence } = require("../src/datasets/jlptWordSourceEvidence");
const { buildSourceAccessReport } = require("../src/services/jlptWordSourceEvidenceService");
const { assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");

const DEFAULT_EVIDENCE = "templates/jlpt_word_source_evidence.json";

function parseArgs(argv) {
    const options = {
        evidence: DEFAULT_EVIDENCE,
        json: false,
        unknownArgs: [],
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--evidence=")) {
            options.evidence = arg.slice("--evidence=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function formatReport(result = {}) {
    const lines = [
        "JLPT Word Source Access Posture",
        "",
        `Sources: ${result.sourceCount || 0}`,
        "No deck mutation: yes",
        "",
        "Action counts:",
        ...Object.entries(result.actionCounts || {}).map(([action, count]) => `- ${action}: ${count}`),
        "",
        "Sources:",
    ];
    for (const source of result.sources || []) {
        lines.push(`- ${source.sourceId}: ${source.status}; license ${source.licenseStatus}; reviewed ${source.reviewedAssignmentCount}/${source.assignmentCount}; action ${source.recommendedAction}`);
    }
    return `${lines.join("\n")}\n`;
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("deck:words:source-access", options.unknownArgs);
    const evidencePath = path.resolve(process.cwd(), options.evidence || DEFAULT_EVIDENCE);
    const result = buildSourceAccessReport({
        evidence: loadJlptWordSourceEvidence(evidencePath),
    });
    const output = {
        evidencePath,
        ...result,
    };
    if (options.json) {
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    } else {
        process.stdout.write(formatReport(output));
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_EVIDENCE,
    formatReport,
    main,
    parseArgs,
};
