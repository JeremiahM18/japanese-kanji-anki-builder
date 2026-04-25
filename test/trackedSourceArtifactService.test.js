const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const {
    N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceWordArtifact,
    evaluateWordArtifact,
    formatTrackedSourceArtifactReport,
} = require("../src/services/trackedSourceArtifactService");

test("buildJlptOnlyJsonFromContract creates deterministic in-memory JLPT input", () => {
    const jlptOnlyJson = buildJlptOnlyJsonFromContract({
        kanjiLevels: {
            本: 5,
            日: 5,
            海: 4,
        },
    });

    assert.deepEqual(jlptOnlyJson, {
        海: { jlpt: 4 },
        日: { jlpt: 5 },
        本: { jlpt: 5 },
    });
});

test("evaluateWordArtifact enforces schema, governance, and deterministic output", () => {
    const header = loadAnkiNoteSchema("word").fieldNames;
    const tsv = [
        header.join("\t"),
        ["今日", "きょう", "<ruby>今<rt>きょう</rt></ruby>", "", "", "today"].join("\t"),
    ].join("\n");

    const report = evaluateWordArtifact({
        tsv,
        repeatTsv: `${tsv}\nchanged`,
        governance: {
            rowCount: 1,
            canonicalRows: 0,
            curatedOnlyRows: 1,
            inferredOnlyRows: 0,
        },
        expectedHeader: header,
        expectedCanonicalRows: 1,
    });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("canonical row count")), true);
    assert.equal(report.failures.some((failure) => failure.includes("curated-only rows")), true);
    assert.equal(report.failures.some((failure) => failure.includes("not deterministic")), true);
});

test("buildTrackedSourceWordArtifact builds N5 word TSV without local workspace data", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-tracked-source-word-"));

    try {
        const report = await buildTrackedSourceWordArtifact({
            outDir: tempRoot,
        });

        assert.equal(report.passed, true);
        assert.equal(report.scope, N5_TRACKED_SOURCE_ARTIFACT_SCOPE);
        assert.equal(report.word.rowCount, 339);
        assert.equal(report.word.governance.canonicalRows, 339);
        assert.equal(report.word.governance.curatedOnlyRows, 0);
        assert.equal(report.word.governance.inferredOnlyRows, 0);
        assert.equal(report.word.deterministic, true);
        assert.equal(fs.existsSync(path.join(tempRoot, "exports", "jlpt-n5-words.tsv")), true);
        assert.equal(fs.existsSync(path.join(tempRoot, "reports", "tracked-source-artifact-summary.json")), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("formatTrackedSourceArtifactReport states source boundary and exclusions", () => {
    const text = formatTrackedSourceArtifactReport({
        passed: true,
        scope: N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
        artifacts: {
            wordTsvPath: "out/product-readiness/n5-tracked-source/exports/jlpt-n5-words.tsv",
        },
        word: {
            rowCount: 339,
            deterministic: true,
            sha256: "abc",
            governance: {
                canonicalRows: 339,
                curatedOnlyRows: 0,
                inferredOnlyRows: 0,
            },
        },
    });

    assert.match(text, /Tracked-Source Artifact Checkpoint/);
    assert.match(text, /ignored local data\/ word, sentence, JLPT, cache, and media inputs are not read/);
    assert.match(text, /tracked-source kanji TSV artifacts/);
});
