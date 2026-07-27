const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    loadAccessibilityPackageSummary,
    parseArgs,
    parseScopedLevels,
    resolvePackageSummaryPath,
} = require("../scripts/reportAccessibilityChecklist");

test("parseArgs defaults to the legacy kanji package and supports JSON output", () => {
    const options = parseArgs(["--json"]);
    assert.deepEqual(options, {
        deckKind: "kanji",
        json: true,
        levels: null,
        outDirBase: null,
        runId: null,
        unknownArgs: [],
    });
});

test("parseArgs accepts an exact isolated word build scope", () => {
    const options = parseArgs([
        "--deck-kind=word",
        "--levels=N5,4",
        "--run-id=release-candidate-001",
        "--out-dir-base=out/custom-runs",
    ]);
    assert.deepEqual(options, {
        deckKind: "word",
        json: false,
        levels: [5, 4],
        outDirBase: "out/custom-runs",
        runId: "release-candidate-001",
        unknownArgs: [],
    });
});

test("parseScopedLevels rejects invalid and duplicate JLPT levels", () => {
    assert.deepEqual(parseScopedLevels("1,3,5"), [5, 3, 1]);
    assert.throws(() => parseScopedLevels(""), /JLPT levels from 1 through 5/);
    assert.throws(() => parseScopedLevels("N5,N5"), /must not contain duplicate/);
    assert.throws(() => parseScopedLevels("N0"), /JLPT levels from 1 through 5/);
});

test("resolvePackageSummaryPath preserves legacy roots and resolves isolated run outputs", () => {
    const config = {
        buildOutDir: path.join("out", "build"),
    };
    const cwd = process.cwd();

    assert.equal(
        resolvePackageSummaryPath(config, "kanji"),
        path.join("out", "build", "package", "package-summary.json"),
    );
    assert.equal(
        resolvePackageSummaryPath(config, "word"),
        path.join("out", "word-build", "package", "package-summary.json"),
    );
    assert.equal(
        resolvePackageSummaryPath(config, "word", {
            cwd,
            levels: [5, 4],
            runId: "release-candidate-001",
        }),
        path.join(cwd, "out", "run-outputs", "release-candidate-001", "word-n5-n4", "package", "package-summary.json"),
    );
    assert.equal(
        resolvePackageSummaryPath(config, "kanji", {
            cwd,
            runId: "release-candidate-001",
        }),
        path.join(
            cwd,
            "out",
            "run-outputs",
            "release-candidate-001",
            "kanji-n5-n4-n3-n2-n1",
            "package",
            "package-summary.json"
        ),
    );
    assert.equal(
        resolvePackageSummaryPath(config, "word", {
            cwd,
            runId: "release-candidate-001",
        }),
        path.join(cwd, "out", "run-outputs", "release-candidate-001", "word-n5", "package", "package-summary.json"),
    );
    assert.throws(
        () => resolvePackageSummaryPath(config, "kanji", { cwd, levels: [5] }),
        /may only be used with --run-id/
    );
    assert.throws(
        () => resolvePackageSummaryPath(config, "kanji", { cwd, outDirBase: "out/custom-runs" }),
        /may only be used with --run-id/
    );
});

test("loadAccessibilityPackageSummary accepts only the selected package root and exports directory", (t) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "accessibility-output-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));

    const packageSummaryPath = resolvePackageSummaryPath({}, "word", {
        cwd,
        levels: [5],
        runId: "release-candidate-001",
    });
    const packageRoot = path.dirname(packageSummaryPath);
    const exportsDir = path.join(packageRoot, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    fs.writeFileSync(path.join(exportsDir, "word.tsv"), "Word\tReading\n日本\tにほん\n", "utf-8");

    const summary = {
        rootDir: packageRoot,
        exportsDir,
        mediaCounts: {
            audio: 0,
        },
    };
    fs.writeFileSync(packageSummaryPath, JSON.stringify(summary), "utf-8");
    assert.deepEqual(loadAccessibilityPackageSummary(packageSummaryPath), summary);

    fs.writeFileSync(packageSummaryPath, JSON.stringify({
        ...summary,
        rootDir: path.join(cwd, "other-package"),
    }), "utf-8");
    assert.throws(
        () => loadAccessibilityPackageSummary(packageSummaryPath),
        /rootDir must match the selected package root/
    );

    fs.writeFileSync(packageSummaryPath, JSON.stringify({
        ...summary,
        exportsDir: path.join(cwd, "other-exports"),
    }), "utf-8");
    assert.throws(
        () => loadAccessibilityPackageSummary(packageSummaryPath),
        /exportsDir must match the selected package exports directory/
    );

    fs.writeFileSync(packageSummaryPath, JSON.stringify({
        mediaCounts: {
            audio: 0,
        },
    }), "utf-8");
    assert.throws(
        () => loadAccessibilityPackageSummary(packageSummaryPath),
        /rootDir must match the selected package root/
    );
});
