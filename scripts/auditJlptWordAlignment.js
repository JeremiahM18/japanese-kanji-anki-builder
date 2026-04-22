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
    const governance = audit.starterGovernance || {};
    const coverageContract = audit.readingCoverageContract || {};
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
        "",
        `Default-deck starter entries: ${governance.defaultDeckStarterCount || 0}`,
        `Canonical starter entries: ${governance.canonicalStarterCount || 0} (${governance.overallCoverage || 0}% of the default starter deck surface)`,
        `Curated-only starter entries: ${governance.curatedOnlyStarterCount || 0}`,
        `Starter mismatches: ${governance.mismatchStarterCount || 0}`,
        `Phrase-tagged starter exclusions: ${governance.excludedPhraseCount || 0}`,
        "",
        "Canonical starter coverage by level:",
        `- N5: ${governance.canonicalStarterCounts?.[5] || 0}/${governance.defaultDeckStarterCounts?.[5] || 0} (${governance.coverageByLevel?.[5] || 0}%)`,
        `- N4: ${governance.canonicalStarterCounts?.[4] || 0}/${governance.defaultDeckStarterCounts?.[4] || 0} (${governance.coverageByLevel?.[4] || 0}%)`,
        `- N3: ${governance.canonicalStarterCounts?.[3] || 0}/${governance.defaultDeckStarterCounts?.[3] || 0} (${governance.coverageByLevel?.[3] || 0}%)`,
        `- N2: ${governance.canonicalStarterCounts?.[2] || 0}/${governance.defaultDeckStarterCounts?.[2] || 0} (${governance.coverageByLevel?.[2] || 0}%)`,
        `- N1: ${governance.canonicalStarterCounts?.[1] || 0}/${governance.defaultDeckStarterCounts?.[1] || 0} (${governance.coverageByLevel?.[1] || 0}%)`,
        "",
        "Explicit reading-coverage contract on starter words:",
        `- N5: ${coverageContract.explicitCoverageEntriesByLevel?.[5] || 0}/${coverageContract.starterEntriesByLevel?.[5] || 0} entries (${coverageContract.explicitCoveragePercentByLevel?.[5] || 0}%), reading targets: ${coverageContract.explicitReadingTargetsByLevel?.[5] || 0}`,
        `- N4: ${coverageContract.explicitCoverageEntriesByLevel?.[4] || 0}/${coverageContract.starterEntriesByLevel?.[4] || 0} entries (${coverageContract.explicitCoveragePercentByLevel?.[4] || 0}%), reading targets: ${coverageContract.explicitReadingTargetsByLevel?.[4] || 0}`,
        `- N3: ${coverageContract.explicitCoverageEntriesByLevel?.[3] || 0}/${coverageContract.starterEntriesByLevel?.[3] || 0} entries (${coverageContract.explicitCoveragePercentByLevel?.[3] || 0}%), reading targets: ${coverageContract.explicitReadingTargetsByLevel?.[3] || 0}`,
        `- N2: ${coverageContract.explicitCoverageEntriesByLevel?.[2] || 0}/${coverageContract.starterEntriesByLevel?.[2] || 0} entries (${coverageContract.explicitCoveragePercentByLevel?.[2] || 0}%), reading targets: ${coverageContract.explicitReadingTargetsByLevel?.[2] || 0}`,
        `- N1: ${coverageContract.explicitCoverageEntriesByLevel?.[1] || 0}/${coverageContract.starterEntriesByLevel?.[1] || 0} entries (${coverageContract.explicitCoveragePercentByLevel?.[1] || 0}%), reading targets: ${coverageContract.explicitReadingTargetsByLevel?.[1] || 0}`,
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
