const fs = require("node:fs");
const path = require("node:path");

const { loadConfig } = require("../src/config");
const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { buildAccessibilityReviewReport, formatAccessibilityReviewReport } = require("../src/services/accessibilityReviewService");
const { resolveIsolatedOutputDir } = require("../src/services/outputIsolationService");
const { assertNoUnknownArgs, collectUnknownArg, invokeCliMain, parseStringOption } = require("../src/utils/cliArgs");
const { isPathInside, openVerifiedRegularFileSync } = require("../src/utils/fs");

function parseScopedLevels(value) {
    const entries = String(value || "")
        .split(",")
        .map((entry) => entry.trim().toUpperCase().replace(/^N/u, ""));
    if (entries.length === 0 || entries.some((entry) => !/^[1-5]$/u.test(entry))) {
        throw new Error("--levels must contain comma-separated JLPT levels from 1 through 5.");
    }
    const levels = [...new Set(entries.map(Number))].sort((left, right) => right - left);
    if (levels.length !== entries.length) {
        throw new Error("--levels must not contain duplicate JLPT levels.");
    }
    return levels;
}

function pathsEqual(leftPath, rightPath) {
    if (typeof leftPath !== "string" || !leftPath.trim() || typeof rightPath !== "string" || !rightPath.trim()) {
        return false;
    }
    const left = path.resolve(leftPath);
    const right = path.resolve(rightPath);
    return process.platform === "win32"
        ? left.toLowerCase() === right.toLowerCase()
        : left === right;
}

function resolveAccessibilityLevels(deckKind, levels = null) {
    return levels || (deckKind === "kanji" ? [5, 4, 3, 2, 1] : [5]);
}

function parseArgs(argv) {
    const options = {
        deckKind: "kanji",
        json: argv.includes("--json"),
        levels: null,
        outDirBase: null,
        runId: null,
        unknownArgs: [],
    };

    for (const arg of argv) {
        if (arg === "--json") {
            continue;
        }
        if (arg.startsWith("--deck-kind=")) {
            options.deckKind = parseStringOption(arg, "deck-kind").trim().toLowerCase();
        } else if (arg.startsWith("--levels=")) {
            options.levels = parseScopedLevels(parseStringOption(arg, "levels"));
        } else if (arg.startsWith("--out-dir-base=")) {
            options.outDirBase = parseStringOption(arg, "out-dir-base").trim();
        } else if (arg.startsWith("--run-id=")) {
            options.runId = parseStringOption(arg, "run-id").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }

    return options;
}

function resolvePackageSummaryPath(config, deckKind, {
    cwd = process.cwd(),
    levels = null,
    outDirBase = null,
    runId = null,
} = {}) {
    if (runId) {
        const selectedLevels = resolveAccessibilityLevels(deckKind, levels);
        const outputDir = resolveIsolatedOutputDir({
            cwd,
            runId,
            outDirBase,
            deckKind,
            levels: selectedLevels,
        });
        return path.join(outputDir, "package", "package-summary.json");
    }
    if (levels || outDirBase) {
        throw new Error("--levels and --out-dir-base may only be used with --run-id.");
    }
    if (deckKind === "kanji") {
        return path.join(config.buildOutDir, "package", "package-summary.json");
    }
    if (deckKind === "word") {
        return path.join(path.dirname(config.buildOutDir), "word-build", "package", "package-summary.json");
    }
    throw new Error(`Unsupported deck kind: ${deckKind}`);
}

function loadAccessibilityPackageSummary(packageSummaryPath) {
    const resolvedSummaryPath = path.resolve(packageSummaryPath);
    const packageRoot = path.dirname(resolvedSummaryPath);
    const expectedExportsDir = path.join(packageRoot, "exports");
    const packageRootStats = fs.lstatSync(packageRoot);
    if (packageRootStats.isSymbolicLink() || !packageRootStats.isDirectory()) {
        throw new Error(`Accessibility package root must be a regular directory: ${packageRoot}`);
    }

    const summaryHandle = openVerifiedRegularFileSync(
        resolvedSummaryPath,
        { label: "Accessibility package summary" }
    );
    let summary;
    try {
        summary = JSON.parse(fs.readFileSync(summaryHandle, "utf-8"));
    } finally {
        fs.closeSync(summaryHandle);
    }
    if (!pathsEqual(summary?.rootDir, packageRoot)) {
        throw new Error(
            `Package summary rootDir must match the selected package root: expected ${packageRoot}, found ${summary?.rootDir || "(missing)"}.`
        );
    }
    if (!pathsEqual(summary?.exportsDir, expectedExportsDir)) {
        throw new Error(
            `Package summary exportsDir must match the selected package exports directory: expected ${expectedExportsDir}, found ${summary?.exportsDir || "(missing)"}.`
        );
    }

    const exportsStats = fs.lstatSync(expectedExportsDir);
    if (exportsStats.isSymbolicLink() || !exportsStats.isDirectory()) {
        throw new Error(`Accessibility exports directory must be a regular directory: ${expectedExportsDir}`);
    }

    const realPackageRoot = fs.realpathSync(packageRoot);
    const realSummaryPath = fs.realpathSync(resolvedSummaryPath);
    const realExportsDir = fs.realpathSync(expectedExportsDir);
    if (
        !pathsEqual(realPackageRoot, packageRoot)
        || !isPathInside(realSummaryPath, realPackageRoot)
        || !pathsEqual(realExportsDir, expectedExportsDir)
        || !isPathInside(realExportsDir, realPackageRoot)
    ) {
        throw new Error("Accessibility package summary or exports directory resolves through an untrusted symbolic-link path.");
    }
    return summary;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("reportAccessibilityChecklist", options.unknownArgs);

    const config = loadConfig();
    const schema = loadAnkiNoteSchema(options.deckKind);
    const packageSummaryPath = resolvePackageSummaryPath(config, options.deckKind, options);
    if (!fs.existsSync(packageSummaryPath)) {
        const selectedLevels = resolveAccessibilityLevels(options.deckKind, options.levels);
        const rebuildArgs = options.runId
            ? ` -- --levels=${selectedLevels.join(",")} --run-id=${options.runId}`
            : "";
        throw new Error(
            `Missing package summary at ${packageSummaryPath}. `
            + `Build the ${options.deckKind} deck first${rebuildArgs ? ` with${rebuildArgs}` : ""}.`
        );
    }

    const packageSummary = loadAccessibilityPackageSummary(packageSummaryPath);
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
    if (!report.summary.valid) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    invokeCliMain(main).catch((err) => {
        console.error(err.stack || err);
        process.exit(1);
    });
}

module.exports = {
    loadAccessibilityPackageSummary,
    main,
    parseArgs,
    parseScopedLevels,
    resolvePackageSummaryPath,
};
