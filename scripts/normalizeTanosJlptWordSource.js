const fs = require("node:fs");
const path = require("node:path");

const {
    TANOS_WORD_LEVEL_SOURCES,
    buildTanosJlptWordSource,
    normalizeLevel,
} = require("../src/services/tanosJlptWordSourceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        level: 3,
        input: "",
        out: "",
        json: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--level=")) {
            options.level = normalizeLevel(arg.slice("--level=".length));
        } else if (arg.startsWith("--input=")) {
            options.input = parseStringOption(arg, "input");
        } else if (arg.startsWith("--out=")) {
            options.out = parseStringOption(arg, "out");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    options.level = normalizeLevel(options.level);
    return options;
}

function resolveLevelConfig(level) {
    return TANOS_WORD_LEVEL_SOURCES[normalizeLevel(level)];
}

function formatNormalizeReport({ inputPath, outPath, result } = {}) {
    return [
        "Tanos JLPT Word Source Normalization",
        "",
        `Level: N${String(result.rows[0]?.jlpt || "").replace(/^N/i, "") || "unknown"}`,
        `Source: ${result.sourceLabel}`,
        `Source URL: ${result.sourceUrl}`,
        `Input: ${inputPath}`,
        `Output: ${outPath}`,
        "",
        `Source lines parsed: ${result.sourceLineCount}`,
        `Rows written: ${result.rowCount}`,
        `Skipped non-row lines: ${result.skippedLines.length}`,
        "",
        "This command only normalizes an ignored local vocabulary source file. It does not approve cards, verify dictionary identity, move words, generate decks, or change readiness.",
    ].join("\n");
}

function run(options = {}) {
    const level = normalizeLevel(options.level || 3);
    const levelConfig = resolveLevelConfig(level);
    const inputPath = path.resolve(process.cwd(), options.input || levelConfig.defaultInput);
    const outPath = path.resolve(process.cwd(), options.out || levelConfig.defaultOutput);

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing Tanos N${level} extracted vocabulary text file: ${inputPath}`);
    }

    const result = buildTanosJlptWordSource({
        sourceText: fs.readFileSync(inputPath, "utf8"),
        level,
        sourceId: levelConfig.sourceId,
        sourceLabel: levelConfig.sourceLabel,
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.tsv, "utf8");

    return {
        inputPath,
        outPath,
        result,
    };
}

function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:normalize:tanos-jlpt-words", options.unknownArgs);
    const report = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatNormalizeReport(report)}\n`);
    }
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatNormalizeReport,
    main,
    parseArgs,
    run,
};
