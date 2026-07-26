const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseNumericOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildKanjiBuilderVaultValidationReport,
    formatKanjiBuilderVaultValidationReport,
} = require("../src/services/kanjiBuilderVaultValidationService");

function parseArgs(argv = []) {
    const options = {
        json: false,
        maxAgeDays: 14,
        unknownArgs: [],
        vaultRoot: "",
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--max-age-days=")) {
            options.maxAgeDays = parseNumericOption(arg, "max-age-days");
        } else if (arg.startsWith("--vault=")) {
            options.vaultRoot = parseStringOption(arg, "vault").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("vault:validate", options.unknownArgs);
    if (!options.vaultRoot) {
        throw new Error("Missing required --vault=<Kanji Builder vault project path>.");
    }
    const report = buildKanjiBuilderVaultValidationReport({
        vaultRoot: options.vaultRoot,
        maxAgeDays: options.maxAgeDays,
    });
    process.stdout.write(options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatKanjiBuilderVaultValidationReport(report));
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
