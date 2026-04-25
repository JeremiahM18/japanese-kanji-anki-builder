const { invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const {
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceWordArtifact,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiPreflightReport,
} = require("../src/services/trackedSourceArtifactService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        outDir: null,
        requireCertifiable: false,
        surface: "word",
    };

    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg === "--require-certifiable") {
            options.requireCertifiable = true;
        } else if (arg.startsWith("--level=")) {
            options.level = Number(parseStringOption(arg, "level"));
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--surface=")) {
            options.surface = parseStringOption(arg, "surface");
        } else {
            throw new Error(`Unknown argument for trackedSourceArtifacts: ${arg}`);
        }
    }

    if (!["word", "kanji-preflight"].includes(options.surface)) {
        throw new Error(`Unsupported tracked-source artifact surface: ${options.surface}`);
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const report = options.surface === "kanji-preflight"
        ? buildTrackedSourceKanjiPreflight({
            level: options.level,
        })
        : await buildTrackedSourceWordArtifact({
            level: options.level,
            outDir: options.outDir || undefined,
        });

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else if (options.surface === "kanji-preflight") {
        process.stdout.write(formatTrackedSourceKanjiPreflightReport(report));
    } else {
        process.stdout.write(formatTrackedSourceArtifactReport(report));
    }

    if (options.requireCertifiable && report.certifiable === false) {
        process.exit(1);
    }

    process.exit(report.passed ? 0 : 1);
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
