const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseStringOption,
} = require("../src/utils/cliArgs");
const { parseLevelsArgument } = require("../src/services/buildPipeline");
const { buildDatabricksSnapshot } = require("../src/services/databricksSnapshotExportService");

function parseArgs(argv = []) {
    const options = {
        json: false,
        levels: [5, 4, 3, 2, 1],
        snapshotId: "",
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--snapshot-id=")) {
            options.snapshotId = parseStringOption(arg, "snapshot-id").trim();
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--level=")) {
            options.levels = parseLevelsArgument(parseStringOption(arg, "level"));
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function formatSnapshotResult(result = {}) {
    const counts = result.manifest?.counts || {};
    const files = result.files || [];
    return [
        "Databricks Snapshot Export",
        "",
        `Snapshot: ${result.snapshotId}`,
        `Output: ${result.manifest?.outputs?.directory || result.outputDir}`,
        `Completeness: ${result.manifest?.snapshotCompletenessStatus || "unknown"}`,
        "",
        "Counts:",
        `- kanji generated: ${counts.kanjiGenerated ?? "unknown"}`,
        `- word generated: ${counts.wordGenerated ?? "unknown"}`,
        `- kanji proof events: ${counts.kanjiProofEvents ?? "unknown"}`,
        `- word proof events: ${counts.wordProofEvents ?? "unknown"}`,
        `- total proof events: ${counts.totalProofEvents ?? "unknown"}`,
        `- kanji current Obsidian targets: ${counts.kanjiCurrentObsidianTargets ?? "unknown"}`,
        `- word current Obsidian v2.5 targets: ${counts.wordCurrentObsidianV25Targets ?? "unknown"}`,
        `- word legacy Obsidian proof events: ${counts.wordLegacyObsidianProofEvents ?? "unknown"}`,
        "",
        "Files:",
        ...files.map((file) => `- ${file}`),
        "",
    ].join("\n");
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    assertNoUnknownArgs("databricks:snapshot", options.unknownArgs);
    if (!options.snapshotId) {
        throw new Error("databricks:snapshot requires --snapshot-id=<id>.");
    }

    const result = buildDatabricksSnapshot({
        snapshotId: options.snapshotId,
        levels: options.levels,
    });

    if (options.json) {
        process.stdout.write(`${JSON.stringify(result.manifest, null, 2)}\n`);
        return;
    }
    process.stdout.write(formatSnapshotResult(result));
}

if (require.main === module) {
    invokeCliMain(() => main()).catch((error) => {
        console.error(error.stack || error);
        process.exit(1);
    });
}

module.exports = {
    formatSnapshotResult,
    main,
    parseArgs,
};
