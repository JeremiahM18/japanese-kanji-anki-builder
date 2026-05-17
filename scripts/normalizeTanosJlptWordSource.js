const fs = require("node:fs");
const path = require("node:path");

const {
    TANOS_WORD_LEVEL_SOURCES,
    buildTanosJlptWordSource,
    buildTanosJlptWordSourceFromMnemosyne,
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
        readingInput: "",
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
        } else if (arg.startsWith("--reading-input=")) {
            options.readingInput = parseStringOption(arg, "reading-input");
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
    const lines = [
        "Tanos JLPT Word Source Normalization",
        "",
        `Level: N${String(result.rows[0]?.jlpt || "").replace(/^N/i, "") || "unknown"}`,
        `Source: ${result.sourceLabel}`,
        `Source URL: ${result.sourceUrl}`,
        `Input: ${inputPath}`,
    ];
    if (result.readingInputPath) {
        lines.push(`Reading input: ${result.readingInputPath}`);
    }
    lines.push(
        `Output: ${outPath}`,
        "",
    );
    if (Number.isInteger(result.sourceRecordCount)) {
        lines.push(`Source records parsed: ${result.sourceRecordCount}`);
        lines.push(`English records: ${result.englishItemCount}`);
        lines.push(`Reading records: ${result.readingItemCount}`);
    } else {
        lines.push(`Source lines parsed: ${result.sourceLineCount}`);
    }
    lines.push(
        `Rows written: ${result.rowCount}`,
        `Skipped non-row lines: ${result.skippedLines.length}`,
        "",
        "This command only normalizes an ignored local vocabulary source file. It does not approve cards, verify dictionary identity, move words, generate decks, or change readiness.",
    );
    return lines.join("\n");
}

function run(options = {}) {
    const level = normalizeLevel(options.level || 3);
    const levelConfig = resolveLevelConfig(level);
    const inputPath = path.resolve(process.cwd(), options.input || levelConfig.defaultInput);
    const readingInputPath = options.readingInput || levelConfig.defaultReadingInput
        ? path.resolve(process.cwd(), options.readingInput || levelConfig.defaultReadingInput)
        : "";
    const outPath = path.resolve(process.cwd(), options.out || levelConfig.defaultOutput);

    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing Tanos N${level} extracted vocabulary text file: ${inputPath}`);
    }
    if (readingInputPath && !fs.existsSync(readingInputPath)) {
        throw new Error(`Missing Tanos N${level} reading vocabulary file: ${readingInputPath}`);
    }

    const result = levelConfig.defaultInputKind === "mnemosyne-pair" || readingInputPath
        ? buildTanosJlptWordSourceFromMnemosyne({
            englishMemText: fs.readFileSync(inputPath, "utf8"),
            readingMemText: fs.readFileSync(readingInputPath, "utf8"),
            level,
            sourceId: levelConfig.sourceId,
            sourceLabel: levelConfig.sourceLabel,
        })
        : buildTanosJlptWordSource({
            sourceText: fs.readFileSync(inputPath, "utf8"),
            level,
            sourceId: levelConfig.sourceId,
            sourceLabel: levelConfig.sourceLabel,
        });
    if (readingInputPath) {
        result.readingInputPath = readingInputPath;
    }

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
