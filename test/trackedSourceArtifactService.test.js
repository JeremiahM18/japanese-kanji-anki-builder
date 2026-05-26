const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { loadAnkiNoteSchema } = require("../src/config/ankiNoteSchema");
const { loadJlptWordLevelContract } = require("../src/datasets/jlptWordLevelContract");
const {
    N5_TRACKED_SOURCE_ARTIFACT_SCOPE,
    N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceWordArtifact,
    countReadingReferenceEntriesForLevel,
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
    const jlptLevelContract = {
        inventoryCounts: { "5": 2 },
        kanjiLevels: {
            公: 5,
            園: 5,
        },
    };
    const report = evaluateTrackedSourceKanjiPreflight({
        jlptLevelContract,
        curatedStudyData: {
            公: { englishMeaning: "public" },
            園: { englishMeaning: "garden" },
        },
        componentContract: {
            components: {
                公: ["八", "ム"],
                園: ["囗", "袁"],
            },
        },
        readingReferenceContract: {
            entries: {
                公: { onReadings: ["コウ"], kunReadings: [] },
                園: { onReadings: ["エン"], kunReadings: ["その"] },
            },
        },
        readingReferenceAudit: {
            passed: true,
            failures: [],
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
        ["rich-source-provenance"]
    );
    assert.equal(report.counts.componentContractKanji, 2);
    assert.equal(report.counts.readingReferenceKanji, 2);
});

test("buildTrackedSourceKanjiPreflight reports N5 kanji source blockers without local data", () => {
    const report = buildTrackedSourceKanjiPreflight();

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, false);
    assert.equal(report.scope, N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE);
    assert.equal(report.kanji.counts.expectedKanji, 80);
    assert.equal(report.kanji.counts.contractKanji, 80);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "on-readings"), false);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "kun-readings"), false);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "components"), false);
    assert.equal(report.kanji.counts.componentContractKanji, 80);
    assert.equal(report.kanji.counts.readingReferenceKanji, 80);
});

test("countReadingReferenceEntriesForLevel scopes tracked reading coverage to the selected level", () => {
    const coverage = countReadingReferenceEntriesForLevel({
        kanjiLevels: {
            日: 5,
            本: 5,
            海: 4,
        },
    }, {
        entries: {
            日: { onReadings: ["ニチ"], kunReadings: ["ひ"] },
            海: { onReadings: ["カイ"], kunReadings: ["うみ"] },
        },
    }, 5);

    assert.deepEqual(coverage, {
        expected: 2,
        covered: 1,
        missing: 1,
        withOnReading: 1,
        withKunReading: 1,
    });
});

test("buildTrackedSourceWordArtifact builds N5 word TSV without local workspace data", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-tracked-source-word-"));
    const contract = loadJlptWordLevelContract(path.join(process.cwd(), "templates", "jlpt_word_level_contract.json"));
    const expectedN5Rows = contract.inventoryCounts["5"];

    try {
        const report = await buildTrackedSourceWordArtifact({
            outDir: tempRoot,
        });

        assert.equal(report.passed, true);
        assert.equal(report.scope, N5_TRACKED_SOURCE_ARTIFACT_SCOPE);
        assert.equal(report.word.rowCount, expectedN5Rows);
        assert.equal(report.word.governance.canonicalRows, expectedN5Rows);
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
            rowCount: 123,
            deterministic: true,
            sha256: "abc",
            governance: {
                canonicalRows: 123,
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
                componentContractKanji: 80,
                readingReferenceKanji: 80,
            },
            requirements: [
                {
                    label: "component/radical source data",
                    trackedToday: true,
                    source: "templates/kanji_component_contract.json",
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
    assert.match(text, /component\/radical source data/);
    assert.match(text, /component contract entries: 80/);
    assert.match(text, /reading reference entries: 80/);
    assert.match(text, /ignored local data\/ kanji, KRAD, cache, and media inputs are not read/);
});
