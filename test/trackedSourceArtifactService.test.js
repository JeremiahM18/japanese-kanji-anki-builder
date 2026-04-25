const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const {
    N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
    N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceWordArtifact,
    evaluateTrackedSourceKanjiPreflight,
    evaluateWordArtifact,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiPreflightReport,
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

test("evaluateTrackedSourceKanjiPreflight blocks certification without rich tracked kanji data", () => {
    const report = evaluateTrackedSourceKanjiPreflight({
        jlptLevelContract: {
            inventoryCounts: { "5": 2 },
            kanjiLevels: {
                公: 5,
                園: 5,
            },
        },
        curatedStudyData: {
            公: { englishMeaning: "public" },
            園: { englishMeaning: "garden" },
        },
        level: 5,
    });

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, false);
    assert.equal(report.counts.expectedKanji, 2);
    assert.equal(report.counts.contractKanji, 2);
    assert.equal(report.counts.curatedMeanings, 2);
    assert.deepEqual(
        report.blockers.map((blocker) => blocker.id),
        ["on-readings", "kun-readings", "components", "rich-source-provenance"]
    );
});

test("buildTrackedSourceKanjiPreflight reports N5 kanji source blockers without local data", () => {
    const report = buildTrackedSourceKanjiPreflight();

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, false);
    assert.equal(report.scope, N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE);
    assert.equal(report.kanji.counts.expectedKanji, 80);
    assert.equal(report.kanji.counts.contractKanji, 80);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "on-readings"), true);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "kun-readings"), true);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "components"), true);
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

test("formatTrackedSourceKanjiPreflightReport states blocked certification scope", () => {
    const text = formatTrackedSourceKanjiPreflightReport({
        passed: true,
        certifiable: false,
        scope: N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
        kanji: {
            counts: {
                expectedKanji: 80,
                contractKanji: 80,
                curatedMeanings: 80,
            },
            requirements: [
                {
                    label: "explicit on-yomi readings",
                    trackedToday: false,
                    source: "currently derived from local kanji input or API fallback",
                },
            ],
            blockers: [
                {
                    label: "explicit on-yomi readings",
                    currentSource: "currently derived from local kanji input or API fallback",
                },
            ],
        },
    });

    assert.match(text, /Tracked-Source Kanji Preflight/);
    assert.match(text, /Tracked-source kanji TSV certifiable: no/);
    assert.match(text, /explicit on-yomi readings/);
    assert.match(text, /ignored local data\/ kanji, KRAD, cache, and media inputs are not read/);
});
