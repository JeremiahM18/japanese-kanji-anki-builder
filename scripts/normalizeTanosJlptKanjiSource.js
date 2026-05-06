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

const DEFAULT_LEGACY_INPUTS = Object.freeze({
    1: "downloads/tanos/n1/jlpt_kanji_level_1_base.txt",
    4: "downloads/tanos/n4/jlpt_kanji_level_3_base.txt",
    5: "downloads/tanos/n5/jlpt_kanji_level_4_base.txt",
});
const DEFAULT_ESTIMATED_SPLIT_INPUTS = Object.freeze({
    2: "downloads/tanos/n2/KanjiList.N2.txt",
    3: "downloads/tanos/n3/KanjiList.N3.txt",
});
const DEFAULT_INPUTS = DEFAULT_LEGACY_INPUTS;
const DEFAULT_LEGACY_OUT = "downloads/tanos-jlpt-kanji-normalized.tsv";
const DEFAULT_ESTIMATED_SPLIT_OUT = "downloads/tanos-jlpt-kanji-estimated-split-normalized.tsv";
const DEFAULT_CONTRACT = "templates/jlpt_level_contract.json";
const SOURCE_LANES = Object.freeze(["legacy-direct", "estimated-split"]);

function normalizeSourceLane(value) {
    const lane = String(value || "legacy-direct").trim();
    if (!SOURCE_LANES.includes(lane)) {
        throw new Error(`Invalid Tanos source lane: ${lane}`);
    }
    return lane;
}

function getDefaultInputsForLane(lane) {
    return normalizeSourceLane(lane) === "estimated-split"
        ? DEFAULT_ESTIMATED_SPLIT_INPUTS
        : DEFAULT_LEGACY_INPUTS;
}

function getDefaultOutForLane(lane) {
    return normalizeSourceLane(lane) === "estimated-split"
        ? DEFAULT_ESTIMATED_SPLIT_OUT
        : DEFAULT_LEGACY_OUT;
}

function getLevelsForLane(lane) {
    return normalizeSourceLane(lane) === "estimated-split" ? [2, 3] : [1, 4, 5];
}

function parseArgs(argv) {
    const options = {
        lane: "legacy-direct",
        inputs: { ...DEFAULT_LEGACY_INPUTS },
        out: null,
        contract: DEFAULT_CONTRACT,
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--lane=")) {
            options.lane = normalizeSourceLane(arg.slice("--lane=".length));
        } else if (arg.startsWith("--n1=")) {
            options.inputs[1] = arg.slice("--n1=".length);
        } else if (arg.startsWith("--n2=")) {
            options.inputs[2] = arg.slice("--n2=".length);
        } else if (arg.startsWith("--n3=")) {
            options.inputs[3] = arg.slice("--n3=".length);
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
    const lane = result.sourceMode || "legacy-direct";
    const levels = Object.keys(inputPaths || {})
        .map(Number)
        .sort((a, b) => a - b);
    const sourceRows = levels.map((level) => `- N${level}: ${result.sourceRowCounts[`N${level}`] || 0}`);
    const writtenRows = levels.map((level) => `- N${level}: ${result.levelCounts[`N${level}`] || 0}`);
    const laneNote = lane === "estimated-split"
        ? "N2 and N3 rows are lower-weight estimated split evidence. They do not represent direct legacy JLPT truth and must not move decks or words by themselves."
        : "N2 and N3 Tanos rows are intentionally not normalized in the direct legacy lane. Use --lane=estimated-split for the separate lower-weight estimated source.";

    return [
        "Tanos JLPT Kanji Source Normalization",
        "",
        `Lane: ${lane}`,
        "Inputs:",
        ...levels.map((level) => `- N${level}: ${inputPaths[level]}`),
        `Output: ${outPath}`,
        `Contract: ${contractPath}`,
        "",
        "Source rows parsed:",
        ...sourceRows,
        "",
        "Rows written inside current contract:",
        ...writtenRows,
        `- total: ${result.rowCount}`,
        "",
        "Rows intentionally skipped:",
        `- outside current contract: ${result.skippedCount}`,
        "",
        laneNote,
        "This command only normalizes an ignored local source file. It does not update tracked evidence, move kanji, move words, or change readiness.",
    ].join("\n");
}

function run(options = {}) {
    const lane = normalizeSourceLane(options.lane || "legacy-direct");
    const levels = getLevelsForLane(lane);
    const inputs = {
        ...getDefaultInputsForLane(lane),
        ...(options.inputs || {}),
    };
    const contractPath = path.resolve(process.cwd(), options.contract || DEFAULT_CONTRACT);
    const outPath = path.resolve(process.cwd(), options.out || getDefaultOutForLane(lane));
    const inputSources = levels.map((level) => readLevelSource(inputs[level], level));
    const contract = loadJlptLevelContract(contractPath);
    const result = buildTanosJlptKanjiSource({
        levelSources: inputSources,
        contract,
        sourceMode: lane,
    });
    result.sourceMode = lane;

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
    DEFAULT_ESTIMATED_SPLIT_INPUTS,
    DEFAULT_ESTIMATED_SPLIT_OUT,
    DEFAULT_LEGACY_INPUTS,
    DEFAULT_LEGACY_OUT,
    formatNormalizeReport,
    getDefaultInputsForLane,
    getDefaultOutForLane,
    getLevelsForLane,
    main,
    normalizeSourceLane,
    parseArgs,
    run,
};
