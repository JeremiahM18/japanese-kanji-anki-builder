const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const {
    DEFAULT_CHECKED_AT,
    DEFAULT_SOURCE_PATH,
    buildKanjidic2ReadingReferenceContract,
} = require("../src/services/kanjidic2ReadingReferenceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_OUT = "templates/kanji_reading_reference_contract.json";
const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";

function parseArgs(argv) {
    const options = {
        input: DEFAULT_SOURCE_PATH,
        out: DEFAULT_OUT,
        contract: DEFAULT_CONTRACT,
        checkedAt: DEFAULT_CHECKED_AT,
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
        } else if (arg.startsWith("--checked-at=")) {
            options.checkedAt = arg.slice("--checked-at=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatBuildReport({ inputPath, outPath, contractPath, contract } = {}) {
    return [
        "KANJIDIC2 Kanji Reading Reference Contract",
        "",
        `Input: ${inputPath}`,
        `Output: ${outPath}`,
        `JLPT contract: ${contractPath}`,
        `Source file SHA-256: ${contract.sourceFile.sha256}`,
        `Source file byte size: ${contract.sourceFile.byteSize}`,
        `KANJIDIC2 database version: ${contract.sourceFile.header.databaseVersion}`,
        `Source characters parsed: ${contract.coverage.sourceCharacterCount}`,
        `JLPT contract kanji: ${contract.coverage.contractKanjiCount}`,
        `Reading reference entries: ${contract.coverage.entryCount}`,
        `Missing reference entries: ${contract.coverage.missingEntryCount}`,
        `Entries without on-yomi: ${contract.coverage.missingOnReading}`,
        `Entries without kun-yomi: ${contract.coverage.missingKunReading}`,
        "",
        "Source-use boundary:",
        "- allowed: kanji-reading-reference",
        "- disallowed: kanji-field-verification, word-field-verification, placement-claim-origin, level-truth",
        "",
        "This command writes a tracked reading-reference contract from an approved KANJIDIC2/EDRDG source. It does not move JLPT levels, verify full card fields, certify cards, or change release readiness.",
    ].join("\n");
}

function run(options = {}) {
    const inputPath = path.resolve(process.cwd(), options.input || DEFAULT_SOURCE_PATH);
    const outPath = path.resolve(process.cwd(), options.out || DEFAULT_OUT);
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing KANJIDIC2 source file: ${inputPath}`);
    }

    const jlptLevelContract = loadJlptLevelContract(contractPath);
    const contract = buildKanjidic2ReadingReferenceContract({
        sourceBuffer: fs.readFileSync(inputPath),
        jlptLevelContract,
        sourcePath: options.input || DEFAULT_SOURCE_PATH,
        checkedAt: options.checkedAt || DEFAULT_CHECKED_AT,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");

    return {
        inputPath,
        outPath,
        contractPath,
        contract,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:build:kanji-reading-reference", options.unknownArgs);
    const report = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatBuildReport(report)}\n`);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    DEFAULT_CONTRACT,
    DEFAULT_OUT,
    formatBuildReport,
    main,
    parseArgs,
    run,
};
