const fs = require("node:fs");
const path = require("node:path");

const {
    assertNoUnknownArgs,
    collectUnknownArg,
    invokeCliMain,
    parseCsvOption,
    parseStringOption,
} = require("../src/utils/cliArgs");
const {
    buildWorkspaceSideEffectSnapshot,
    compareWorkspaceSideEffectSnapshots,
} = require("../src/services/workspaceSideEffectAuditService");
const {
    isPathInside,
    removeGeneratedPathSync,
} = require("../src/utils/fs");

function parseArgs(argv = []) {
    const options = {
        allowedPrefixes: [],
        baselinePath: "",
        json: false,
        unknownArgs: [],
        writeBaselinePath: "",
    };
    for (const arg of argv) {
        if (arg === "--json") {
            options.json = true;
        } else if (arg.startsWith("--allow=")) {
            options.allowedPrefixes.push(...parseCsvOption(arg, "allow"));
        } else if (arg.startsWith("--baseline=")) {
            options.baselinePath = parseStringOption(arg, "baseline").trim();
        } else if (arg.startsWith("--write-baseline=")) {
            options.writeBaselinePath = parseStringOption(arg, "write-baseline").trim();
        } else {
            collectUnknownArg(options, arg);
        }
    }
    return options;
}

function resolveSnapshotPath(value, rootDir = process.cwd()) {
    const outputRoot = path.join(path.resolve(rootDir), "out", "workspace-side-effects");
    const resolved = path.resolve(rootDir, value);
    if (!isPathInside(resolved, outputRoot)) {
        throw new Error(`Workspace side-effect snapshots must stay under ${outputRoot}: ${resolved}`);
    }
    return resolved;
}

function writeSnapshot(filePath, snapshot) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
        throw new Error(`Refusing to overwrite an existing workspace side-effect baseline: ${filePath}`);
    }
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "wx" });
        fs.renameSync(tempPath, filePath);
    } finally {
        try {
            removeGeneratedPathSync(tempPath, {
                force: true,
                label: "workspace side-effect baseline temporary file",
                allowedRoots: [path.dirname(filePath)],
            });
        } catch {
            // Preserve the original write error.
        }
    }
}

function formatReport(report = {}) {
    const lines = [
        "Workspace side-effect audit",
        `Status: ${report.passed === false ? "fail" : report.coverageComplete === false ? "pass-with-limitations" : "pass"}`,
        `Files: ${report.fileCountBefore ?? report.files?.length ?? 0} -> ${report.fileCountAfter ?? report.files?.length ?? 0}`,
        `Changes: ${report.changeCount ?? 0}`,
        `Unexpected changes: ${report.unexpectedChangeCount ?? 0}`,
    ];
    for (const change of report.changes || []) {
        lines.push(`- ${change.kind}: ${change.path}${change.allowed ? " (allowed)" : " (unexpected)"}`);
    }
    if ((report.skippedSymlinks || []).length > 0) {
        lines.push(`Skipped symlinks: ${report.skippedSymlinks.length}`);
    }
    if ((report.missingRoots || []).length > 0) {
        lines.push(`Missing governed roots: ${report.missingRoots.join(", ")}`);
    }
    if ((report.unreadableFiles || []).length > 0) {
        lines.push(`Unreadable files recorded: ${report.unreadableFiles.length}`);
        for (const entry of report.unreadableFiles) {
            lines.push(`- unreadable: ${entry.path} (${entry.error})`);
        }
    }
    if ((report.unreadableDirectories || []).length > 0) {
        lines.push(`Unreadable directories recorded: ${report.unreadableDirectories.length}`);
        for (const entry of report.unreadableDirectories) {
            lines.push(`- unreadable directory: ${entry.path} (${entry.error})`);
        }
    }
    lines.push(`Authority: ${report.authority || ""}`);
    return `${lines.join("\n")}\n`;
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    assertNoUnknownArgs("audit:workspace-side-effects", options.unknownArgs);
    if (Boolean(options.baselinePath) === Boolean(options.writeBaselinePath)) {
        throw new Error("Choose exactly one of --write-baseline=<out/workspace-side-effects/*.json> or --baseline=<...>.");
    }
    const current = buildWorkspaceSideEffectSnapshot();
    if (options.writeBaselinePath) {
        const outputPath = resolveSnapshotPath(options.writeBaselinePath);
        writeSnapshot(outputPath, current);
        const report = {
            ...current,
            passed: true,
            coverageComplete: current.files.every((entry) => !entry.readError && !entry.statError)
                && current.unreadableDirectories.length === 0
                && current.skippedSymlinks.length === 0
                && current.missingRoots.length === 0,
            fileCountBefore: current.files.length,
            fileCountAfter: current.files.length,
            changeCount: 0,
            unexpectedChangeCount: 0,
            changes: [],
            unreadableFiles: current.files
                .filter((entry) => entry.readError || entry.statError)
                .map((entry) => ({ path: entry.path, error: entry.readError || entry.statError })),
            unreadableDirectories: current.unreadableDirectories,
            snapshotPath: outputPath,
        };
        process.stdout.write(options.json
            ? `${JSON.stringify(report, null, 2)}\n`
            : formatReport(report));
        return;
    }
    const baselinePath = resolveSnapshotPath(options.baselinePath);
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const report = compareWorkspaceSideEffectSnapshots(baseline, current, {
        allowedPrefixes: options.allowedPrefixes,
    });
    process.stdout.write(options.json
        ? `${JSON.stringify(report, null, 2)}\n`
        : formatReport(report));
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
    formatReport,
    main,
    parseArgs,
    resolveSnapshotPath,
    writeSnapshot,
};
