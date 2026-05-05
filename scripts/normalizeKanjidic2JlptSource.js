const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const { buildKanjidic2JlptSource } = require("../src/services/kanjidic2JlptSourceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_INPUT = "downloads/kanjidic2.xml.gz";
const DEFAULT_OUT = "downloads/kanjidic2-jlpt-normalized.tsv";
const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";

function parseArgs(argv) {
    const options = {
        input: DEFAULT_INPUT,
        out: DEFAULT_OUT,
        contract: DEFAULT_CONTRACT,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--input=")) {
            options.input = arg.slice("--input=".length);
        } else if (arg.startsWith("--out=")) {
            options.out = arg.slice("--out=".length);
        } else if (arg.startsWith("--contract=")) {
            options.contract = arg.slice("--contract=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatNormalizeReport({ inputPath, outPath, contractPath, result } = {}) {
    return [
        "KANJIDIC2 JLPT Source Normalization",
        "",
        `Input: ${inputPath}`,
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        `Source characters parsed: ${result.sourceCharacterCount}`,
        `Rows written: ${result.rowCount}`,
        `Rows intentionally skipped: ${result.skippedCount}`,
        "",
        "Written legacy levels:",
        `- old 1 -> N1: ${result.legacyLevelCounts["1"] || 0}`,
        `- old 2 -> N2/N3 range evidence: ${result.legacyLevelCounts["2"] || 0}`,
        `- old 3 -> N4: ${result.legacyLevelCounts["3"] || 0}`,
        `- old 4 -> N5: ${result.legacyLevelCounts["4"] || 0}`,
        "",
        "Skipped legacy levels:",
        `- outside current contract: ${result.skippedReasonCounts["outside the current JLPT kanji contract; excluded from source assignment import"] || 0}`,
        "",
        "This command only normalizes an ignored local source file. It does not update tracked evidence, move kanji, move words, or change readiness.",
    ].join("\n");
}

function run(options = {}) {
    const inputPath = path.resolve(process.cwd(), options.input || DEFAULT_INPUT);
    const outPath = path.resolve(process.cwd(), options.out || DEFAULT_OUT);
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing KANJIDIC2 source file: ${inputPath}`);
    }
    const contract = loadJlptLevelContract(contractPath);

    const result = buildKanjidic2JlptSource({
        sourceBuffer: fs.readFileSync(inputPath),
        contract,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.tsv, "utf8");

    return {
        inputPath,
        outPath,
        contractPath,
        result,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:normalize:kanjidic2-jlpt", options.unknownArgs);
    const report = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatNormalizeReport(report)}\n`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    formatNormalizeReport,
    main,
    parseArgs,
    run,
};
