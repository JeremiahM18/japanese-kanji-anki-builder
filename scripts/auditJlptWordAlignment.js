const fs = require("node:fs");
const path = require("node:path");

const { invokeCliMain, assertNoUnknownArgs, collectUnknownArg } = require("../src/utils/cliArgs");
const { loadWordStudyData } = require("../src/datasets/wordStudyData");
const {
    auditWordStudyEntriesAgainstContract,
    loadJlptWordLevelContract,
} = require("../src/datasets/jlptWordLevelContract");

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

function truncate(items, limit) {
    return (Array.isArray(items) ? items : []).slice(0, Math.max(1, limit || 25));
}

function formatWordAlignmentReport({ contractPath, starterPath, audit }) {
    const lines = [
        "JLPT Word Alignment Audit",
        "",
        `Contract: ${contractPath}`,
        `Starter word study data: ${starterPath}`,
        "",
        `Starter alignment: ${audit.valid ? "passing" : "failing"}`,
        `Tracked word entries: ${audit.entryCount}`,
        `Contract entries: ${audit.contractEntryCount}`,
        `Starter counts: N5=${audit.starterCounts[5] || 0}, N4=${audit.starterCounts[4] || 0}, N3=${audit.starterCounts[3] || 0}, N2=${audit.starterCounts[2] || 0}, N1=${audit.starterCounts[1] || 0}`,
        `Contract counts: N5=${audit.contractCounts["5"] || 0}, N4=${audit.contractCounts["4"] || 0}, N3=${audit.contractCounts["3"] || 0}, N2=${audit.contractCounts["2"] || 0}, N1=${audit.contractCounts["1"] || 0}`,
    ];

    if (!audit.valid) {
        lines.push(
            "",
            `Mismatches: ${audit.mismatchCount}`,
            `Missing contract entries: ${audit.missingContractEntryCount}`,
            `Unexpected contract entries: ${audit.unexpectedContractEntryCount}`
        );
    }

    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("auditJlptWordAlignment", options.unknownArgs);

    const templatesDir = path.join(process.cwd(), "templates");
    const contractPath = path.join(templatesDir, "jlpt_word_level_contract.json");
    const starterPath = path.join(templatesDir, "starter_word_study_data.json");

    if (!fs.existsSync(contractPath)) {
        throw new Error(`Missing JLPT word level contract at ${contractPath}`);
    }
    if (!fs.existsSync(starterPath)) {
        throw new Error(`Missing starter word study data at ${starterPath}`);
    }

    const contract = loadJlptWordLevelContract(contractPath);
    const starterEntries = loadWordStudyData({ starterPath });
    const audit = auditWordStudyEntriesAgainstContract(starterEntries, contract);

    const summary = {
        contractPath,
        starterPath,
        starterWordStudy: {
            ...audit,
            mismatches: truncate(audit.mismatches, options.limit),
            missingContractEntries: truncate(audit.missingContractEntries, options.limit),
            unexpectedContractEntries: truncate(audit.unexpectedContractEntries, options.limit),
        },
    };

    if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
    } else {
        process.stdout.write(formatWordAlignmentReport({ contractPath, starterPath, audit }));
    }

    if (options.strict && !audit.valid) {
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
    formatWordAlignmentReport,
    main,
    parseArgs,
};
