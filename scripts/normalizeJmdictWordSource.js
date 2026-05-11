const fs = require("node:fs");
const path = require("node:path");

const {
    buildJmdictWordSource,
} = require("../src/services/jmdictWordSourceService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const DEFAULT_INPUT = "downloads/JMdict_e.gz";
const DEFAULT_OUT = "downloads/jmdict-word-verification.tsv";

function parseArgs(argv = []) {
    const options = {
        input: DEFAULT_INPUT,
        out: DEFAULT_OUT,
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
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatNormalizeReport({ inputPath, outPath, result } = {}) {
    return [
        "JMdict Word Source Normalization",
        "",
        `Input: ${inputPath}`,
        `Output: ${outPath}`,
        `Source entries parsed: ${result.sourceEntryCount}`,
        `Rows written: ${result.rowCount}`,
        `Rows with JMdict priority/commonness tags: ${result.priorityRowCount}`,
        `Rows intentionally skipped: ${result.skippedCount}`,
        "",
        "Input integrity:",
        `- sha256: ${result.inputIntegrity.sha256}`,
        `- byteSize: ${result.inputIntegrity.byteSize}`,
        "",
        "Output integrity:",
        `- sha256: ${result.outputIntegrity.sha256}`,
        `- byteSize: ${result.outputIntegrity.byteSize}`,
        `- rowCount: ${result.outputIntegrity.rowCount}`,
        "",
        "This command only normalizes ignored local dictionary data. It does not promote words, approve cards, mutate decks, or change level contracts.",
    ].join("\n");
}

function run(options = {}) {
    const inputPath = path.resolve(process.cwd(), options.input || DEFAULT_INPUT);
    const outPath = path.resolve(process.cwd(), options.out || DEFAULT_OUT);
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Missing JMdict source file: ${inputPath}`);
    }

    const result = buildJmdictWordSource({
        sourceBuffer: fs.readFileSync(inputPath),
    });

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, result.tsv, "utf8");

    return {
        inputPath,
        outPath,
        result,
    };
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("data:normalize:words:jmdict", options.unknownArgs);

    const report = run(options);
    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatNormalizeReport(report)}\n`);
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_INPUT,
    DEFAULT_OUT,
    formatNormalizeReport,
    main,
    parseArgs,
    run,
};
