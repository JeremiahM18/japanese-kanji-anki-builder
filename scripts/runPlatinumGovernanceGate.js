const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");
const { loadWordPitchAccentData } = require("../src/datasets/wordPitchAccentData");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { buildKanjiRowsForLevel } = require("./reviewPlatinumKanjiLevel");
const { buildWordRowsForLevel } = require("./reviewPlatinumWordLevel");
const {
    buildPlatinumKanjiRereviewStatusReport,
} = require("../src/services/platinumKanjiRereviewStatusService");
const {
    buildPlatinumWordRereviewStatusReport,
} = require("../src/services/platinumWordRereviewStatusService");
const {
    buildPlatinumWordSourcePostureReport,
    buildPlatinumWordSourcePostureSummary,
} = require("../src/services/platinumWordSourcePostureService");
const {
    buildManifestGovernancePosture,
    evaluatePlatinumGovernanceGate,
    formatPlatinumGovernanceGateReport,
} = require("../src/services/platinumGovernanceGateService");

function parseArgs(argv) {
    const options = {
        json: false,
        kanjiLevels: [5, 4],
        wordLevels: [5, 4],
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--kanji-levels=")) {
            options.kanjiLevels = parseLevelsArgument(parseStringOption(arg, "kanji-levels"));
        } else if (arg.startsWith("--word-levels=")) {
            options.wordLevels = parseLevelsArgument(parseStringOption(arg, "word-levels"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function readReviewSet({ kind, level }) {
    const fileName = kind === "word"
        ? `platinum_n${level}_word_review_set.json`
        : `platinum_n${level}_review_set.json`;
    const reviewSetPath = path.join(process.cwd(), "templates", fileName);
    if (!fs.existsSync(reviewSetPath)) {
        throw new Error(`Missing platinum ${kind} review set at ${reviewSetPath}`);
    }

    return JSON.parse(fs.readFileSync(reviewSetPath, "utf-8"));
}

async function buildGateReport({ options, config }) {
    const kanjiRereviewReports = [];
    const wordRereviewReports = [];
    const wordSourcePostureReports = [];
    const manifestPostures = [];
    const wordPitchAccentData = loadWordPitchAccentData(path.join(process.cwd(), "templates", "word_pitch_accent_data.json"));
    const kanjiLevelData = loadJlptOnlyJson(config.jlptJsonPath);

    for (const level of options.kanjiLevels) {
        const entries = readReviewSet({ kind: "kanji", level });
        const rows = await buildKanjiRowsForLevel({ level, config });
        kanjiRereviewReports.push(buildPlatinumKanjiRereviewStatusReport({
            rows,
            entries,
            level,
        }));
        manifestPostures.push(buildManifestGovernancePosture({
            kind: "kanji",
            level,
            entries,
        }));
    }

    for (const level of options.wordLevels) {
        const entries = readReviewSet({ kind: "word", level });
        const rows = await buildWordRowsForLevel({ level, config });
        wordRereviewReports.push(buildPlatinumWordRereviewStatusReport({
            rows,
            entries,
            level,
            wordPitchAccentData,
            kanjiLevelData,
        }));
        wordSourcePostureReports.push(buildPlatinumWordSourcePostureReport({
            entries,
            level,
        }));
        manifestPostures.push(buildManifestGovernancePosture({
            kind: "word",
            level,
            entries,
        }));
    }

    return evaluatePlatinumGovernanceGate({
        kanjiRereviewReports,
        wordRereviewReports,
        wordSourcePostureSummary: buildPlatinumWordSourcePostureSummary(wordSourcePostureReports),
        manifestPostures,
    });
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("deck:platinum:governance-gate", options.unknownArgs);

    const config = loadConfig();
    const requiredLocalInputs = [
        config.jlptJsonPath,
        config.curatedStudyDataPath,
        config.wordStudyDataPath,
    ];
    const missingLocalInputs = requiredLocalInputs.filter((filePath) => !fs.existsSync(filePath));
    if (missingLocalInputs.length > 0) {
        throw new Error(`Platinum governance gate requires local generated-row inputs that are not tracked in git: ${missingLocalInputs.join(", ")}`);
    }

    const report = await buildGateReport({ options, config });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(formatPlatinumGovernanceGateReport(report));
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
    buildGateReport,
    main,
    parseArgs,
    readReviewSet,
};
