const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { loadConfig } = require("../src/config");
const { resolveTrackedStarterPaths } = require("../src/datasets/curatedStudyData");
const {
    auditGoldenReviewSetsAgainstContract,
    auditJlptInventoryAgainstContract,
    auditStarterEntriesAgainstContract,
    loadJlptLevelContract,
} = require("../src/datasets/jlptLevelContract");
const { loadJlptOnlyJson } = require("../src/datasets/jlptOnlyJson");

function parseArgs(argv) {
    const options = {
        json: false,
        strict: false,
        limit: 25,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--strict") {
            options.strict = true;
        } else if (arg.startsWith("--limit=")) {
            options.limit = Number(arg.split("=")[1]);
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadTrackedStarterEntries(templatesDir) {
    const starterPaths = resolveTrackedStarterPaths({
        starterPath: path.join(templatesDir, "starter_curated_study_data.json"),
    });

    return starterPaths.reduce((merged, entryPath) => {
        return {
            ...merged,
            ...loadJson(entryPath),
        };
    }, {});
}

function loadGoldenReviewSets(templatesDir) {
    return Object.fromEntries(
        [2, 3, 4, 5].map((level) => [
            level,
            loadJson(path.join(templatesDir, `golden_n${level}_review_set.json`)),
        ])
    );
}

function truncate(items, limit) {
    return (Array.isArray(items) ? items : []).slice(0, Math.max(1, limit || 25));
}

function formatAlignmentReport({ contractPath, datasetPath, localDatasetAudit, starterAudit, goldenAudit }) {
    const lines = [
        "JLPT Alignment Audit",
        "",
        `Contract: ${contractPath}`,
        `Local dataset: ${datasetPath}`,
        "",
        `Local dataset alignment: ${localDatasetAudit.valid ? "passing" : "failing"}`,
        `Starter alignment: ${starterAudit.valid ? "passing" : "failing"}`,
        `Golden review alignment: ${goldenAudit.valid ? "passing" : "failing"}`,
    ];

    if (!localDatasetAudit.valid) {
        lines.push(
            "",
            `Local dataset mismatches: missing ${localDatasetAudit.missingKanji.length}, unexpected ${localDatasetAudit.unexpectedKanji.length}, wrong level ${localDatasetAudit.levelMismatches.length}, count mismatches ${localDatasetAudit.countMismatches.length}`
        );
    }

    if (!starterAudit.valid) {
        lines.push("", `Starter mismatches: ${starterAudit.mismatchCount}`);
    }

    if (!goldenAudit.valid) {
        lines.push("", `Golden review mismatches: ${goldenAudit.mismatchCount}`);
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("auditJlptAlignment", options.unknownArgs);

    const config = loadConfig();
    const templatesDir = path.join(process.cwd(), "templates");
    const contractPath = path.join(templatesDir, "jlpt_level_contract.json");

    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT level contract at ${contractPath}`);
    }
    if (!fs.existsSync(config.jlptJsonPath)) {
        throw new Error(`Missing JLPT JSON file at ${config.jlptJsonPath}`);
    }

    const contract = loadJlptLevelContract(contractPath);
    const localDatasetAudit = auditJlptInventoryAgainstContract(
        loadJlptOnlyJson(config.jlptJsonPath, { contractPath: null }),
        contract
    );
    const starterAudit = auditStarterEntriesAgainstContract(loadTrackedStarterEntries(templatesDir), contract);
    const goldenAudit = auditGoldenReviewSetsAgainstContract(loadGoldenReviewSets(templatesDir), contract);

    const summary = {
        contractPath,
        datasetPath: config.jlptJsonPath,
        localDataset: {
            ...localDatasetAudit,
            missingKanji: truncate(localDatasetAudit.missingKanji, options.limit),
            unexpectedKanji: truncate(localDatasetAudit.unexpectedKanji, options.limit),
            levelMismatches: truncate(localDatasetAudit.levelMismatches, options.limit),
            countMismatches: truncate(localDatasetAudit.countMismatches, options.limit),
        },
        starterCurated: {
            ...starterAudit,
            mismatches: truncate(starterAudit.mismatches, options.limit),
        },
        goldenReview: {
            ...goldenAudit,
            mismatches: truncate(goldenAudit.mismatches, options.limit),
        },
    };

    if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        process.stdout.write(formatAlignmentReport({
            contractPath,
            datasetPath: config.jlptJsonPath,
            localDatasetAudit,
            starterAudit,
            goldenAudit,
        }));
    }

    if (options.strict && (!localDatasetAudit.valid || !starterAudit.valid || !goldenAudit.valid)) {
        process.exit(1);
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatAlignmentReport,
    loadGoldenReviewSets,
    loadTrackedStarterEntries,
    main,
    parseArgs,
};
