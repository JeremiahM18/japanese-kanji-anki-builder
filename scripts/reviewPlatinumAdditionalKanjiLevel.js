const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { buildAdditionalKanjiExportPath } = require("../src/services/additionalKanjiDeckService");
const {
    evaluatePlatinumKanjiReviewSet,
    formatPlatinumKanjiReviewReport,
} = require("../src/services/platinumKanjiReviewService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain } = require("../src/utils/cliArgs");
const { parseKanjiTsvForPlatinum } = require("../src/services/kanjiGeneratedRowsService");

function parseArgs(argv) {
    const options = {
        allowEmpty: false,
        json: false,
        level: null,
        outDir: null,
        requireCurrentReviewStandard: true,
        requireAllRows: false,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--allow-legacy-standard") {
            options.requireCurrentReviewStandard = false;
        } else if (arg === "--allow-empty") {
            options.allowEmpty = true;
        } else if (arg === "--json") {
            options.json = true;
        } else if (arg === "--require-all") {
            options.requireAllRows = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(arg.split("=")[1]);
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = arg.slice("--out-dir=".length);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:kanji:additional:platinum", options.unknownArgs);

    const level = options.level;
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error("Additional platinum kanji review level must be 1-5.");
    }

    const config = loadConfig();
    const outDir = path.resolve(options.outDir || path.join(config.buildOutDir, "additional_unverified"));
    const exportPath = buildAdditionalKanjiExportPath(outDir, level);
    const reviewSetPath = path.join(
        process.cwd(),
        "templates",
        `platinum_additional_unverified_n${level}_review_set.json`
    );

    if (!fs.existsSync(exportPath)) {
        throw new Error(`Missing generated additional kanji TSV: ${exportPath}`);
    }
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing additional platinum review set: ${reviewSetPath}`);
    }

    const rows = parseKanjiTsvForPlatinum(fs.readFileSync(exportPath, "utf8"), { level });
    const entries = JSON.parse(fs.readFileSync(reviewSetPath, "utf8"));
    const report = evaluatePlatinumKanjiReviewSet({
        rows,
        entries,
        requireCurrentReviewStandard: options.requireCurrentReviewStandard,
        requireAllRows: options.requireAllRows,
        allowEmpty: options.allowEmpty,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify({ report, rows }, null, 2)}\n`);
    } else {
        process.stdout.write(formatPlatinumKanjiReviewReport(report, {
            title: `Japanese Kanji Builder Additional Platinum N${level} Kanji Review`,
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
    main,
    parseArgs,
};
