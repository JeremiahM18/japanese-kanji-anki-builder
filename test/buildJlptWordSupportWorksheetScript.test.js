const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    parseArgs,
    resolveDefaultPath,
    resolveGovernedOutputPath,
    resolveGovernedOutputPaths,
} = require("../scripts/buildJlptWordSupportWorksheet");

test("typed support worksheet CLI keeps source, level, outputs, and write authority explicit", () => {
    assert.deepEqual(parseArgs([
        "--source=jmdict",
        "--level=4",
        "--out=downloads/review.tsv",
        "--batch-out=downloads/batch.tsv",
        "--write",
        "--json",
        "--oops",
    ]), {
        contract: "templates/jlpt_word_level_contract.json",
        evidence: "templates/jlpt_word_source_evidence.json",
        source: "jmdict",
        level: 4,
        levels: null,
        out: "downloads/review.tsv",
        batchOut: "downloads/batch.tsv",
        write: true,
        json: true,
        unknownArgs: ["--oops"],
    });
});

test("typed support worksheet default paths remain level-aware", () => {
    assert.equal(
        resolveDefaultPath("fixture", 3, "review"),
        path.join("downloads", "word-source-support", "fixture-n3-review.tsv")
    );
});

test("typed support worksheet CLI accepts one explicit multi-level operational scope", () => {
    assert.deepEqual(parseArgs([
        "--source=jmdict",
        "--levels=5,4,3,2,1",
        "--dry-run",
        "--json",
    ]), {
        contract: "templates/jlpt_word_level_contract.json",
        evidence: "templates/jlpt_word_source_evidence.json",
        source: "jmdict",
        level: null,
        levels: [5, 4, 3, 2, 1],
        out: "",
        batchOut: "",
        write: false,
        json: true,
        unknownArgs: [],
    });
    assert.equal(
        resolveDefaultPath("fixture", [5, 4, 3, 2, 1], "review"),
        path.join("downloads", "word-source-support", "fixture-all-review.tsv")
    );
});

test("typed support worksheet outputs stay inside the governed downloads surface", () => {
    const cwd = process.cwd();
    assert.equal(
        resolveGovernedOutputPath("downloads/word-source-support/dictionary-n4-review.tsv", { cwd }),
        path.join(cwd, "downloads", "word-source-support", "dictionary-n4-review.tsv")
    );
    assert.throws(
        () => resolveGovernedOutputPath("../package.json", { cwd }),
        /noncanonical path segment|outside governed|direct child/i
    );
    assert.throws(
        () => resolveGovernedOutputPath("downloads/word-source-support/review.json", { cwd }),
        /\.tsv extension/i
    );
    for (const outputPath of [
        "downloads/word-source-support/nested/review.tsv",
        "downloads/word-source-support/review.TSV",
        "downloads/word-source-support/CON.tsv",
        "downloads/word-source-support/review.tsv:ads",
        "downloads/word-source-support-escape/review.tsv",
        "C:outside\\review.tsv",
        "\\\\server\\share\\review.tsv",
        "\\\\?\\C:\\outside\\review.tsv",
    ]) {
        assert.throws(
            () => resolveGovernedOutputPath(outputPath, { cwd }),
            /outside governed|direct child|lowercase \.tsv|reserved|alternate data stream/i,
            outputPath
        );
    }
    assert.throws(() => resolveGovernedOutputPaths({
        cwd,
        outPath: "downloads/word-source-support/review.tsv",
        batchOutPath: "downloads/word-source-support/REVIEW.tsv",
        sourcePath: path.join(cwd, "downloads", "word-source-support", "normalized.tsv"),
    }), /distinct governed paths/i);
    assert.throws(() => resolveGovernedOutputPaths({
        cwd,
        outPath: "downloads/word-source-support/normalized.tsv",
        batchOutPath: "downloads/word-source-support/reviewed.tsv",
        sourcePath: path.join(cwd, "downloads", "word-source-support", "normalized.tsv"),
    }), /must not overwrite the normalized source/i);
});

test("typed support worksheet rejects a governed-root junction without touching its target", (t) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "word-support-output-path-"));
    t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
    const outsideDirectory = path.join(cwd, "outside");
    const downloadsDirectory = path.join(cwd, "downloads");
    const governedDirectory = path.join(downloadsDirectory, "word-source-support");
    fs.mkdirSync(outsideDirectory, { recursive: true });
    fs.mkdirSync(downloadsDirectory, { recursive: true });
    const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
    fs.writeFileSync(sentinelPath, "unchanged", "utf8");
    fs.symlinkSync(outsideDirectory, governedDirectory, process.platform === "win32" ? "junction" : "dir");

    assert.throws(
        () => resolveGovernedOutputPath("downloads/word-source-support/review.tsv", { cwd }),
        /symbolic link|junction|redirected directory/i
    );
    assert.equal(fs.readFileSync(sentinelPath, "utf8"), "unchanged");
});
