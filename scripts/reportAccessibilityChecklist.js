const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { buildAccessibilityReviewReport, formatAccessibilityReviewReport } = require("../src/services/accessibilityReviewService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");

function parseArgs(argv) {
    const options = {
        deckKind: "kanji",
        json: argv.includes("--json"),
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            continue;
        }
        if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim().toLowerCase();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolvePackageSummaryPath(config, deckKind) {
    if (deckKind === "kanji") {
        return path.join(config.buildOutDir, "package", "package-summary.json");
    }
    if (deckKind === "word") {
        return path.join(path.dirname(config.buildOutDir), "word-build", "package", "package-summary.json");
    }
    throw new Error(`Unsupported deck kind: ${deckKind}`);
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("reportAccessibilityChecklist", options.unknownArgs);

    const config = loadConfig();
    const schema = loadAnkiNoteSchema(options.deckKind);
    const packageSummaryPath = resolvePackageSummaryPath(config, options.deckKind);
    if (!fs.existsSync(packageSummaryPath)) {
        throw new Error(`Missing package summary at ${packageSummaryPath}. Build the ${options.deckKind} deck first.`);
    }

    const packageSummary = JSON.parse(fs.readFileSync(packageSummaryPath, "utf-8"));
    const report = buildAccessibilityReviewReport({
        deckKind: options.deckKind,
        schema,
        packageSummary,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return;
    }

    process.stdout.write(formatAccessibilityReviewReport(report));
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    main,
    parseArgs,
    resolvePackageSummaryPath,
};
