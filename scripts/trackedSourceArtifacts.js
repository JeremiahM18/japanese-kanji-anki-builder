const { invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const {
    buildTrackedSourceKanjiArtifact,
    buildTrackedSourceKanjiArtifacts,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceKanjiReleaseQaGate,
    buildTrackedSourceWordArtifact,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiArtifactReport,
    formatTrackedSourceKanjiArtifactsReport,
    formatTrackedSourceKanjiPreflightReport,
    formatTrackedSourceKanjiReleaseQaReport,
    normalizeTrackedSourceLevels,
} = require("../src/services/trackedSourceArtifactService");

function parseArgs(argv) {
    const options = {
        json: false,
        level: 5,
        levels: null,
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
        } else if (arg.startsWith("--levels=")) {
            const parsedLevels = parseStringOption(arg, "levels")
                .split(",")
                .map((value) => Number(value.trim()))
                .filter((value) => Number.isFinite(value));
            if (parsedLevels.length === 0) {
                throw new Error("--levels must include at least one numeric JLPT level.");
            }
            options.levels = parsedLevels;
        } else if (arg.startsWith("--out-dir=")) {
            options.outDir = parseStringOption(arg, "out-dir");
        } else if (arg.startsWith("--surface=")) {
            options.surface = parseStringOption(arg, "surface");
        } else {
            throw new Error(`Unknown argument for trackedSourceArtifacts: ${arg}`);
        }
    }

    if (!["word", "kanji-preflight", "kanji", "kanji-release-qa"].includes(options.surface)) {
        throw new Error(`Unsupported tracked-source artifact surface: ${options.surface}`);
    }

    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const levels = normalizeTrackedSourceLevels({
        level: options.level,
        levels: options.levels,
    });
    const report = await (async () => {
        if (options.surface === "kanji-preflight") {
            if (levels.length === 1) {
                return buildTrackedSourceKanjiPreflight({
                    level: levels[0],
                });
            }
            const levelReports = levels.map((level) => buildTrackedSourceKanjiPreflight({ level }));
            return {
                generatedAt: new Date().toISOString(),
                passed: levelReports.every((levelReport) => levelReport.passed),
                certifiable: levelReports.every((levelReport) => levelReport.certifiable),
                scope: {
                    type: "tracked-source-kanji-preflight-multi-level",
                    levels,
                    sourceBoundary: "Runs each selected kanji level through tracked-source preflight without ignored local data inputs.",
                },
                levels: levelReports,
            };
        }

        if (options.surface === "kanji") {
            if (levels.length === 1) {
                return buildTrackedSourceKanjiArtifact({
                    level: levels[0],
                    outDir: options.outDir || undefined,
                });
            }
            return buildTrackedSourceKanjiArtifacts({
                levels,
                outDir: options.outDir || undefined,
            });
        }

        if (options.surface === "kanji-release-qa") {
            return buildTrackedSourceKanjiReleaseQaGate({
                levels,
            });
        }

        return buildTrackedSourceWordArtifact({
            level: options.level,
            outDir: options.outDir || undefined,
        });
    })();

    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else if (options.surface === "kanji-preflight") {
        if (Array.isArray(report.levels)) {
            process.stdout.write(formatTrackedSourceKanjiArtifactsReport(report));
        } else {
            process.stdout.write(formatTrackedSourceKanjiPreflightReport(report));
        }
    } else if (options.surface === "kanji") {
        if (Array.isArray(report.levels)) {
            process.stdout.write(formatTrackedSourceKanjiArtifactsReport(report));
        } else {
            process.stdout.write(formatTrackedSourceKanjiArtifactReport(report));
        }
    } else if (options.surface === "kanji-release-qa") {
        process.stdout.write(formatTrackedSourceKanjiReleaseQaReport(report));
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
