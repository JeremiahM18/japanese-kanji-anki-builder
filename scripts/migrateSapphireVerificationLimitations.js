const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
} = require("../src/utils/cliArgs");
const {
    canonicalizeLegacyWordSapphireVerificationLimitation,
    wordSapphireVerificationLimitationSchema,
} = require("../src/datasets/sapphireVerificationLimitations");
const {
    readFileState,
    runGovernedFileTransactionSync,
} = require("../src/utils/governedFileTransaction");

function parseArgs(argv = []) {
    const options = {
        json: false,
        unknownArgs: [],
        write: false,
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--write") {
            options.write = true;
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function migrateEntry(entry = {}) {
    const limitations = Array.isArray(entry.verificationLimitations)
        ? entry.verificationLimitations
        : [];
    if (limitations.length === 0) {
        return { entry, changed: 0 };
    }
    const canonical = limitations.map((limitation) => {
        const migrated = canonicalizeLegacyWordSapphireVerificationLimitation(limitation);
        return wordSapphireVerificationLimitationSchema.parse(migrated);
    });
    const changed = canonical.filter((limitation, index) => (
        JSON.stringify(limitation) !== JSON.stringify(limitations[index])
    )).length;
    return {
        entry: {
            ...entry,
            verificationLimitations: canonical,
        },
        changed,
    };
}

function buildSapphireVerificationLimitationMigration({
    rootDir = process.cwd(),
} = {}) {
    const root = path.resolve(rootDir);
    const files = [];
    let limitationCount = 0;
    let changedLimitations = 0;
    let changedEntries = 0;
    for (const level of [1, 2, 3, 4, 5]) {
        const filePath = path.join(root, "templates", `sapphire_n${level}_word_review_set.json`);
        const before = readFileState(filePath);
        if (!before.exists) {
            throw new Error(`Missing tracked word Sapphire review set: ${filePath}`);
        }
        const entries = JSON.parse(before.bytes.toString("utf8"));
        let fileChangedEntries = 0;
        const migratedEntries = entries.map((entry) => {
            limitationCount += Array.isArray(entry.verificationLimitations)
                ? entry.verificationLimitations.length
                : 0;
            const migrated = migrateEntry(entry);
            changedLimitations += migrated.changed;
            if (migrated.changed > 0) {
                fileChangedEntries += 1;
                changedEntries += 1;
            }
            return migrated.entry;
        });
        files.push({
            level,
            filePath,
            beforeSha256: before.sha256,
            entries: migratedEntries,
            changedEntries: fileChangedEntries,
        });
    }
    return {
        rootDir: root,
        limitationCount,
        changedLimitations,
        changedEntries,
        files,
    };
}

function runSapphireVerificationLimitationMigration({
    rootDir = process.cwd(),
    write = false,
    runFileTransaction = runGovernedFileTransactionSync,
} = {}) {
    const report = buildSapphireVerificationLimitationMigration({ rootDir });
    if (write && report.changedLimitations > 0) {
        const transactionRoot = path.join(report.rootDir, "out", "file-transactions");
        runFileTransaction({
            workspaceRoot: report.rootDir,
            transactionRoot,
            transactionName: "word-sapphire-limitation-canonicalization",
            lockPath: path.join(transactionRoot, "word-sapphire-limitation-canonicalization.lock"),
            changes: report.files
                .filter((file) => file.changedEntries > 0)
                .map((file) => ({
                    filePath: file.filePath,
                    expectedBeforeSha256: file.beforeSha256,
                    data: `${JSON.stringify(file.entries, null, 2)}\n`,
                })),
        });
    }
    return {
        ...report,
        write,
        authority: "Mechanical schema canonicalization only; it does not promote rows, certify content, change denominators, or create Platinum/Obsidian proof.",
    };
}

function formatReport(report = {}) {
    return [
        "Sapphire verification-limitation canonicalization",
        `Mode: ${report.write ? "write" : "dry-run"}`,
        `Limitations inspected: ${report.limitationCount}`,
        `Limitations changed: ${report.changedLimitations}`,
        `Entries changed: ${report.changedEntries}`,
        ...report.files.map((file) => `- N${file.level}: ${file.changedEntries} entries`),
        `Authority: ${report.authority}`,
        "",
    ].join("\n");
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("data:migrate:sapphire-limitations", options.unknownArgs);
    const report = runSapphireVerificationLimitationMigration({
        write: options.write,
    });
    process.stdout.write(options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    buildSapphireVerificationLimitationMigration,
    formatReport,
    migrateEntry,
    parseArgs,
    runSapphireVerificationLimitationMigration,
};
