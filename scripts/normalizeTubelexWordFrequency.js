const fs = require("node:fs");
const path = require("node:path");

const {
    DEFAULT_TUBELEX_SOURCE_ID,
    DEFAULT_TUBELEX_SOURCE_URL,
    buildTubelexOutputIntegrity,
    buildTubelexWordFrequencyRows,
    formatTubelexWordFrequencyTsv,
} = require("../src/services/tubelexWordFrequencyService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");

const DEFAULT_TUBELEX_INPUT = "downloads/tubelex-ja-310-lemma-pos.tsv";
const DEFAULT_JMDICT_INPUT = "downloads/jmdict-word-verification.tsv";
const DEFAULT_OUTPUT = "downloads/tubelex-ja-frequency.tsv";

function parseArgs(argv = []) {
    const options = {
        tubelex: DEFAULT_TUBELEX_INPUT,
        jmdict: DEFAULT_JMDICT_INPUT,
        out: DEFAULT_OUTPUT,
        sourceId: DEFAULT_TUBELEX_SOURCE_ID,
        sourceUrl: DEFAULT_TUBELEX_SOURCE_URL,
        json: false,
        strict: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--tubelex=")) {
            options.tubelex = String(arg.slice("--tubelex=".length) || "").trim();
        } else if (arg.startsWith("--jmdict=")) {
            options.jmdict = String(arg.slice("--jmdict=".length) || "").trim();
        } else if (arg.startsWith("--out=")) {
            options.out = String(arg.slice("--out=".length) || "").trim();
        } else if (arg.startsWith("--source-id=")) {
            options.sourceId = String(arg.slice("--source-id=".length) || "").trim();
        } else if (arg.startsWith("--source-url=")) {
            options.sourceUrl = String(arg.slice("--source-url=".length) || "").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function assertReadableInput(label, filePath) {
    const resolved = path.resolve(process.cwd(), filePath || "");
    if (!filePath || !fs.existsSync(resolved)) {
        throw new Error(`${label} input file not found: ${filePath || "(missing path)"}`);
    }
    if (/\.xz$/iu.test(filePath)) {
        throw new Error(`${label} input is still xz-compressed; extract it to TSV before normalization: ${filePath}`);
    }
    return resolved;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:normalize:words:tubelex", options.unknownArgs);
    const tubelexPath = assertReadableInput("TubeLex", options.tubelex);
    const jmdictPath = assertReadableInput("JMdict", options.jmdict);
    if (!options.out) {
        throw new Error("data:normalize:words:tubelex requires --out or the default output path.");
    }

    const tubelexText = fs.readFileSync(tubelexPath, "utf8");
    const jmdictText = fs.readFileSync(jmdictPath, "utf8");
    const result = buildTubelexWordFrequencyRows({
        tubelexText,
        jmdictText,
        sourceId: options.sourceId,
        sourceUrl: options.sourceUrl,
    });
    const outputText = formatTubelexWordFrequencyTsv(result.rows);
    const outputPath = path.resolve(process.cwd(), options.out);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, outputText);
    const integrity = buildTubelexOutputIntegrity(outputText, result.rows);
    const report = {
        command: "data:normalize:words:tubelex",
        sourceId: options.sourceId,
        tubelexInput: options.tubelex,
        jmdictInput: options.jmdict,
        output: options.out,
        sourceUrl: options.sourceUrl,
        ...result.summary,
        integrity,
        storagePolicy: "tracked derived exact-identity facts only; raw TubeLex files stay ignored; no raw subtitle text is stored.",
    };

    if (options.strict && result.rows.length === 0) {
        throw new Error("TubeLex normalization produced zero derived exact-identity rows.");
    }

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write([
            "TubeLex word frequency normalization",
            `source: ${report.sourceId}`,
            `TubeLex input: ${report.tubelexInput}`,
            `JMdict input: ${report.jmdictInput}`,
            `output: ${report.output}`,
            `TubeLex rows: ${report.tubelexRows}`,
            `JMdict rows: ${report.jmdictRows}`,
            `derived exact identities: ${report.derivedRows}`,
            `bands: ${Object.entries(report.bandCounts || {}).map(([band, count]) => `${band}=${count}`).join("; ")}`,
            `match statuses: ${Object.entries(report.matchStatusCounts || {}).map(([status, count]) => `${status}=${count}`).join("; ")}`,
            `sha256: ${report.integrity.sha256}`,
            `byteSize: ${report.integrity.byteSize}`,
            `rowCount: ${report.integrity.rowCount}`,
            `columns: ${report.integrity.columns.join(", ")}`,
            `policy: ${report.storagePolicy}`,
            "",
        ].join("\n"));
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    DEFAULT_JMDICT_INPUT,
    DEFAULT_OUTPUT,
    DEFAULT_TUBELEX_INPUT,
    main,
    parseArgs,
};
