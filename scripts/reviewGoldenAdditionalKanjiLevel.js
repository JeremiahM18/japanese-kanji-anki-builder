const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { buildAdditionalKanjiExportPath, parseTsv } = require("../src/services/additionalKanjiDeckService");
const { evaluateGoldenReviewSet, formatGoldenReviewReport } = require("../src/services/goldenReviewService");
const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        json: false,
        level: null,
        outDir: null,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--require-all") {
            options.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function mapTsvRows(tsv) {
    const parsed = parseTsv(tsv);
    return parsed.rows.map((row) => {
        const mapped = {};
        for (let index = 0; index < parsed.header.length; index += 1) {
            mapped[parsed.header[index]] = row[index] || "";
        }
        return {
            kanji: mapped.Kanji || "",
            displayWord: mapped.DisplayWord || "",
            meaningJP: mapped.MeaningJP || "",
            primaryReading: mapped.PrimaryReading || "",
            kanjiMeanings: mapped.KanjiMeanings || "",
            studyWordKanji: mapped.StudyWordKanji || "",
            onReading: mapped.OnReading || "",
            kunReading: mapped.KunReading || "",
            strokeOrder: mapped.StrokeOrder || "",
            audio: mapped.Audio || "",
            radical: mapped.Radical || "",
            notes: mapped.Notes || "",
            exampleSentence: mapped.ExampleSentence || "",
        };
    });
}

function findDuplicateKanji(values = []) {
    const seen = new Set();
    const duplicates = new Set();

    for (const value of values) {
        if (seen.has(value)) {
            duplicates.add(value);
        }
        seen.add(value);
    }

    return [...duplicates].sort((a, b) => a.localeCompare(b, "ja"));
}

function addCoverageFailures(report, { rows = [], expectations = [], requireAllRows = false } = {}) {
    const expectationKanji = expectations.map((entry) => entry.kanji).filter(Boolean);
    const rowKanji = rows.map((row) => row.kanji).filter(Boolean);
    const expectationSet = new Set(expectationKanji);
    const rowSet = new Set(rowKanji);
    const coverageFailures = [];
    const duplicateExpectations = findDuplicateKanji(expectationKanji);
    const extraExpectations = expectationKanji
        .filter((kanji) => !rowSet.has(kanji))
        .sort((a, b) => a.localeCompare(b, "ja"));
    const missingExpectations = requireAllRows
        ? rowKanji
            .filter((kanji) => !expectationSet.has(kanji))
            .sort((a, b) => a.localeCompare(b, "ja"))
        : [];
    const emptyAdditionalSurface = rowKanji.length === 0 && expectationKanji.length === 0;

    if (duplicateExpectations.length > 0) {
        coverageFailures.push(`duplicate expectations: ${duplicateExpectations.join(", ")}`);
    }
    if (extraExpectations.length > 0) {
        coverageFailures.push(`expectations for missing generated kanji: ${extraExpectations.join(", ")}`);
    }
    if (missingExpectations.length > 0) {
        coverageFailures.push(`missing expectations for generated kanji: ${missingExpectations.join(", ")}`);
    }

    return {
        ...report,
        coverageFailures,
        duplicateExpectations,
        extraExpectations,
        missingExpectations,
        passed: (report.passed || emptyAdditionalSurface) && coverageFailures.length === 0,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:additional:review", options.unknownArgs);

    const level = options.level;
    if (![1, 2, 3, 4, 5].includes(level)) {
        throw new Error("Additional golden review level must be N1, N2, N3, N4, or N5.");
    }

    const config = loadConfig();
    const outDir = path.resolve(options.outDir || path.join(config.buildOutDir, "additional_unverified"));
    const exportPath = buildAdditionalKanjiExportPath(outDir, level);
    const reviewSetPath = path.join(
        process.cwd(),
        "templates",
        `golden_additional_unverified_n${level}_review_set.json`
    );

    if (!fs.existsSync(exportPath)) {
        throw new Error(`Missing generated additional kanji TSV: ${exportPath}`);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing additional golden review set: ${reviewSetPath}`);
    }

    const rows = mapTsvRows(fs.readFileSync(exportPath, "utf8"));
    const expectations = JSON.parse(fs.readFileSync(reviewSetPath, "utf8"));
    const report = addCoverageFailures(evaluateGoldenReviewSet({
        cards: rows,
        expectations,
    }), {
        rows,
        expectations,
        requireAllRows: options.requireAllRows,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify({ report, rows }, null, 2)}\n`);
    } else {
        process.stdout.write(formatGoldenReviewReport(report, {
            title: `Japanese Kanji Builder Additional Golden N${level} Review`,
        }));
    }

    if (!report.passed) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    addCoverageFailures,
    main,
    mapTsvRows,
    parseArgs,
};
