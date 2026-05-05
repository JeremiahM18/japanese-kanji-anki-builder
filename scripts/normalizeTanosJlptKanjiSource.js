const fs = require("node:fs");
const path = require("node:path");

const { loadJlptLevelContract } = require("../src/datasets/jlptLevelContract");
const {
    buildTanosJlptKanjiSource,
} = require("../src/services/tanosJlptKanjiSourceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
} = require("../src/utils/cliArgs");

const DEFAULT_INPUTS = Object.freeze({
    1: "downloads/tanos/n1/jlpt_kanji_level_1_base.txt",
    4: "downloads/tanos/n4/jlpt_kanji_level_3_base.txt",
    5: "downloads/tanos/n5/jlpt_kanji_level_4_base.txt",
});
const DEFAULT_OUT = "downloads/tanos-jlpt-kanji-normalized.tsv";
const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";

function parseArgs(argv) {
    const options = {
        inputs: { ...DEFAULT_INPUTS },
        out: DEFAULT_OUT,
        contract: DEFAULT_CONTRACT,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--n1=")) {
            options.inputs[1] = arg.slice("--n1=".length);
        } else if (arg.startsWith("--n4=")) {
            options.inputs[4] = arg.slice("--n4=".length);
        } else if (arg.startsWith("--n5=")) {
            options.inputs[5] = arg.slice("--n5=".length);
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

function readLevelSource(inputPath, tanosLevel) {
    const resolved = path.resolve(process.cwd(), inputPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Missing Tanos N${tanosLevel} source file: ${resolved}`);
    }
    return {
        tanosLevel,
        inputPath: resolved,
        sourceText: fs.readFileSync(resolved, "utf8"),
    };
}

function formatNormalizeReport({ inputPaths, outPath, contractPath, result } = {}) {
    return [
        "Tanos JLPT Kanji Source Normalization",
        "",
        "Inputs:",
        `- N1: ${inputPaths[1]}`,
        `- N4: ${inputPaths[4]}`,
        `- N5: ${inputPaths[5]}`,
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        "",
        "Source rows parsed:",
        `- N1: ${result.sourceRowCounts.N1 || 0}`,
        `- N4: ${result.sourceRowCounts.N4 || 0}`,
        `- N5: ${result.sourceRowCounts.N5 || 0}`,
        "",
        "Rows written inside current contract:",
        `- N1: ${result.levelCounts.N1 || 0}`,
        `- N4: ${result.levelCounts.N4 || 0}`,
        `- N5: ${result.levelCounts.N5 || 0}`,
        `- total: ${result.rowCount}`,
        "",
        "Rows intentionally skipped:",
        `- outside current contract: ${result.skippedCount}`,
        "",
        "N2 and N3 Tanos lanes are intentionally not normalized here. They need stronger governed evidence before automated import.",
        "This command only normalizes an ignored local source file. It does not update tracked evidence, move kanji, move words, or change readiness.",
    ].join("\n");
}

function run(options = {}) {
    const inputs = options.inputs || DEFAULT_INPUTS;
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const outPath = path.resolve(process.cwd(), options.out || DEFAULT_OUT);
    const inputSources = [1, 4, 5].map((level) => readLevelSource(inputs[level], level));
    const contract = loadJlptLevelContract(contractPath);
    const result = buildTanosJlptKanjiSource({
        levelSources: inputSources,
        contract,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.tsv, "utf8");

    return {
        inputPaths: Object.fromEntries(inputSources.map((source) => [source.tanosLevel, source.inputPath])),
        outPath,
        contractPath,
        result,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:normalize:tanos-jlpt-kanji", options.unknownArgs);
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
    DEFAULT_INPUTS,
    formatNormalizeReport,
    main,
    parseArgs,
    run,
};
