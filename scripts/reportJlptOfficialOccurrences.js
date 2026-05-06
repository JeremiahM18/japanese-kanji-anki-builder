const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const {
    formatJlptOfficialOccurrenceEvidenceJson,
    loadJlptOfficialOccurrenceEvidence,
} = require("../src/datasets/jlptOfficialOccurrenceEvidence");
const {
    buildOccurrenceManifest,
    buildOfficialOccurrenceExtraction,
    buildOfficialOccurrenceReport,
    formatOfficialOccurrenceTsv,
    parseOccurrenceSourceRows,
} = require("../src/services/jlptOfficialOccurrenceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    parseNumericOption,
} = require("../src/utils/cliArgs");

const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const DEFAULT_OCCURRENCES = "templates/jlpt_official_kanji_occurrences.json";
const DEFAULT_OUT = "downloads/jlpt-official-kanji-occurrences.json";

function parseArgs(argv) {
    const options = {
        contract: DEFAULT_CONTRACT,
        occurrences: DEFAULT_OCCURRENCES,
        source: null,
        format: "tsv",
        out: DEFAULT_OUT,
        outputFormat: "json",
        write: false,
        json: false,
        strict: false,
        limit: 25,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--write") {
            options.write = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
        } else if (arg.startsWith("--occurrences=")) {
            options.occurrences = arg.slice("--occurrences=".length);
        } else if (arg.startsWith("--source=")) {
            options.source = arg.slice("--source=".length);
        } else if (arg.startsWith("--format=")) {
            options.format = arg.slice("--format=".length);
        } else if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        } else if (arg.startsWith("--output-format=")) {
            options.outputFormat = arg.slice("--output-format=".length);
        } else if (arg.startsWith("--limit=")) {
            options.limit = parseNumericOption(arg, "limit");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function loadStoredRows(occurrencesPath) {
    if (!fs.existsSync(occurrencesPath)) {
        return [];
    }
    return loadJlptOfficialOccurrenceEvidence(occurrencesPath).occurrences;
}

function writeOccurrenceOutput({ outPath, outputFormat, rows }) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (outputFormat === "tsv") {
        fs.writeFileSync(outPath, formatOfficialOccurrenceTsv(rows), "utf8");
        return;
    }
    fs.writeFileSync(outPath, formatJlptOfficialOccurrenceEvidenceJson(buildOccurrenceManifest(rows)), "utf8");
}

function run(options = {}) {
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const occurrencesPath = path.resolve(process.cwd(), options.occurrences || DEFAULT_OCCURRENCES);
    const outPath = path.resolve(process.cwd(), options.out || DEFAULT_OUT);
    const contract = loadJlptLevelContract(contractPath);
    const blockers = [];
    let extraction = null;
    let rows;
    let mode = "report";
    let sourcePath = null;

    if (options.source) {
        mode = options.write ? "extract-write" : "extract-dry-run";
        sourcePath = path.resolve(process.cwd(), options.source);
        if (!fs.existsSync(sourcePath)) {
            blockers.push(`source file is missing: ${sourcePath}`);
            rows = [];
        } else {
            const sourceText = fs.readFileSync(sourcePath, "utf8");
            const sourceRows = parseOccurrenceSourceRows(sourceText, options.format || "tsv");
            extraction = buildOfficialOccurrenceExtraction({ sourceRows });
            rows = extraction.rows;
            if (!extraction.valid) {
                blockers.push("official occurrence extraction has rejected rows");
            }
            if (options.write && extraction.valid) {
                writeOccurrenceOutput({
                    outPath,
                    outputFormat: options.outputFormat || "json",
                    rows,
                });
            }
        }
    } else {
        rows = loadStoredRows(occurrencesPath);
    }

    const report = buildOfficialOccurrenceReport({ rows, contract });
    const valid = blockers.length === 0 && (!extraction || extraction.valid);

    return {
        valid,
        mode,
        contractPath,
        occurrencesPath,
        sourcePath,
        outPath: options.write ? outPath : null,
        blockers,
        extraction,
        report,
    };
}

function formatByLevel(byLevel = {}) {
    return Object.entries(byLevel)
        .map(([level, counts]) => `- ${level}: ${counts.occurrenceRows} occurrence rows; ${counts.uniqueKanji} unique kanji`)
        .join("\n");
}

function formatJlptOfficialOccurrenceReport(result = {}, limit = 25) {
    const lines = [
        "JLPT Official Kanji Occurrence Report",
        "",
        `Overall result: ${result.valid ? "passing" : "blocked"}`,
        `Mode: ${result.mode}`,
        `Contract: ${result.contractPath}`,
        `Stored occurrences: ${result.occurrencesPath}`,
    ];
    if (result.sourcePath) {
        lines.push(`Source input: ${result.sourcePath}`);
    }
    if (result.outPath) {
        lines.push(`Output: ${result.outPath}`);
    }
    lines.push(
        "",
        "This command extracts or reports occurrence evidence only. It does not assign JLPT levels, move kanji, move words, update decks, or change readiness.",
        "",
        `Stored fields: ${result.report.storedFields.join(", ")}`,
        `No assignment truth: ${result.report.noAssignmentTruth ? "yes" : "no"}`,
        `No question text stored: ${result.report.storeQuestionText === false ? "yes" : "no"}`,
        `Occurrence rows: ${result.report.occurrenceRowCount}`,
        `Unique observed kanji: ${result.report.uniqueKanjiCount}`,
        `Source PDFs represented: ${result.report.sourcePdfCount}`,
        "",
        "By level:",
        formatByLevel(result.report.byLevel),
        "",
        `Observed kanji outside current contract: ${result.report.outsideContractCount}`
    );

    if (result.blockers?.length > 0) {
        lines.push("", "Blockers:");
        for (const blocker of result.blockers.slice(0, Math.max(1, limit))) {
            lines.push(`- ${blocker}`);
        }
    }

    if (result.extraction?.rejectedRows?.length > 0) {
        lines.push("", "Rejected row samples:");
        for (const row of result.extraction.rejectedRows.slice(0, Math.max(1, limit))) {
            lines.push(`- row ${row.rowNumber}: ${row.issues.join("; ")}`);
        }
    }

    if (result.report.outsideContract?.length > 0) {
        lines.push("", "Outside-contract samples:");
        for (const row of result.report.outsideContract.slice(0, Math.max(1, limit))) {
            lines.push(`- ${row.observedKanji}: ${row.level} ${row.sourcePdf} p.${row.page} ${row.questionRef}`);
        }
    }

    return lines.join("\n");
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:audit:jlpt:official-occurrences", options.unknownArgs);
    const result = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatJlptOfficialOccurrenceReport(result, options.limit)}\n`);
    }
    if (options.strict && !result.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_OCCURRENCES,
    DEFAULT_OUT,
    formatJlptOfficialOccurrenceReport,
    main,
    parseArgs,
    run,
};
