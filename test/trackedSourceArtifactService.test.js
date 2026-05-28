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
    N5_TRACKED_SOURCE_KANJI_TSV_SCOPE,
    TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE,
    buildJlptOnlyJsonFromContract,
    buildTrackedSourceKanjiArtifact,
    buildTrackedSourceKanjiArtifacts,
    buildTrackedSourceKanjiPreflight,
    buildTrackedSourceKanjiReleaseQaGate,
    buildTrackedSourceWordArtifact,
    countCardFieldSourceEntriesForLevel,
    countReadingReferenceEntriesForLevel,
    evaluateKanjiTsvArtifact,
    evaluateTrackedSourceKanjiPreflight,
    evaluateWordArtifact,
    formatKanjiSourceDerivedTsv,
    formatTrackedSourceArtifactReport,
    formatTrackedSourceKanjiArtifactReport,
    formatTrackedSourceKanjiArtifactsReport,
    formatTrackedSourceKanjiPreflightReport,
    formatTrackedSourceKanjiReleaseQaReport,
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

test("evaluateTrackedSourceKanjiPreflight certifies when all tracked kanji source lanes pass", () => {
    const jlptLevelContract = {
        inventoryCounts: { "5": 1 },
        kanjiLevels: {
            公: 5,
        },
    };
    const report = evaluateTrackedSourceKanjiPreflight({
        jlptLevelContract,
        curatedStudyData: {
            公: { englishMeaning: "public" },
        },
        componentContract: {
            components: {
                公: ["八", "ム"],
            },
        },
        readingReferenceContract: {
            entries: {
                公: { onReadings: ["コウ"], kunReadings: [] },
            },
        },
        readingReferenceAudit: {
            passed: true,
            failures: [],
        },
        fieldSourceContract: {
            entries: {
                公: { fieldValues: { primaryReading: "こう" } },
            },
        },
        fieldSourceAudit: {
            passed: true,
            failures: [],
        },
        level: 5,
    });

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, true);
    assert.deepEqual(report.blockers, []);
    assert.equal(report.counts.cardFieldSourceKanji, 1);
    assert.equal(report.counts.missingTrackedRequirements, 0);
});

test("buildTrackedSourceKanjiPreflight certifies N5 source availability without local data", () => {
    const report = buildTrackedSourceKanjiPreflight();

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, true);
    assert.equal(report.scope, N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE);
    assert.equal(report.kanji.counts.expectedKanji, 80);
    assert.equal(report.kanji.counts.contractKanji, 80);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "on-readings"), false);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "kun-readings"), false);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "components"), false);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "rich-source-provenance"), false);
    assert.equal(report.kanji.counts.componentContractKanji, 80);
    assert.equal(report.kanji.counts.readingReferenceKanji, 80);
    assert.equal(report.kanji.counts.cardFieldSourceKanji, 80);
});

test("buildTrackedSourceKanjiPreflight certifies N4 source availability without local data", () => {
    const report = buildTrackedSourceKanjiPreflight({ level: 4 });

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, true);
    assert.equal(report.scope.type, "n4-tracked-source-kanji-preflight");
    assert.equal(report.kanji.counts.expectedKanji, 212);
    assert.equal(report.kanji.counts.readingReferenceKanji, 212);
    assert.equal(report.kanji.counts.cardFieldSourceKanji, 212);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "rich-source-provenance"), false);
    assert.equal(report.sourceFiles.kanjiCardFieldSourceContractPath.endsWith(path.join("templates", "kanji_card_field_source_contracts", "n4.json")), true);
});

test("buildTrackedSourceKanjiPreflight certifies N3 source availability without local data", () => {
    const report = buildTrackedSourceKanjiPreflight({ level: 3 });

    assert.equal(report.passed, true);
    assert.equal(report.certifiable, true);
    assert.equal(report.scope.type, "n3-tracked-source-kanji-preflight");
    assert.equal(report.kanji.counts.expectedKanji, 341);
    assert.equal(report.kanji.counts.readingReferenceKanji, 341);
    assert.equal(report.kanji.counts.cardFieldSourceKanji, 341);
    assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "rich-source-provenance"), false);
    assert.equal(report.sourceFiles.kanjiCardFieldSourceContractPath.endsWith(path.join("templates", "kanji_card_field_source_contracts", "n3.json")), true);
});

test("buildTrackedSourceKanjiPreflight fails closed for levels without field-source contracts", () => {
    for (const { level, expectedKanji } of [
        { level: 2, expectedKanji: 349 },
        { level: 1, expectedKanji: 1230 },
    ]) {
        const report = buildTrackedSourceKanjiPreflight({ level });

        assert.equal(report.passed, false, `N${level} should fail closed`);
        assert.equal(report.certifiable, false);
        assert.equal(report.scope.type, `n${level}-tracked-source-kanji-preflight`);
        assert.equal(report.kanji.counts.expectedKanji, expectedKanji);
        assert.equal(report.kanji.counts.cardFieldSourceKanji, 0);
        assert.equal(report.kanji.blockers.some((blocker) => blocker.id === "rich-source-provenance"), true);
        assert.equal(
            report.kanji.failures.some((failure) => failure.includes(`Missing governed N${level} kanji card field source contract`)),
            true
        );
    }
});

test("formatKanjiSourceDerivedTsv builds schema-aligned rows from tracked source contracts", () => {
    const header = loadAnkiNoteSchema("kanji").fieldNames;
    const tsv = formatKanjiSourceDerivedTsv({
        level: 5,
        expectedHeader: header,
        jlptLevelContract: {
            inventoryCounts: { "5": 1 },
            kanjiLevels: { 日: 5 },
        },
        componentContract: {
            components: { 日: ["日"] },
        },
        readingReferenceContract: {
            entries: {
                日: {
                    onReadings: ["ニチ"],
                    kunReadings: ["ひ"],
                    normalizedOnReadings: ["にち"],
                    normalizedKunReadings: ["ひ"],
                },
            },
        },
        fieldSourceContract: {
            entries: {
                日: {
                    fieldValues: {
                        primaryReading: "ひ",
                        primaryMeaning: "day",
                        kanjiMeanings: ["day", "sun"],
                        supportNotes: ["日"],
                        exampleSentences: ["今日はいい日です。"],
                    },
                },
            },
        },
    });

    const report = evaluateKanjiTsvArtifact({
        tsv,
        repeatTsv: tsv,
        expectedHeader: header,
        expectedRows: 1,
        preflight: { certifiable: true },
    });

    assert.equal(report.passed, true);
    assert.equal(report.rowCount, 1);
    assert.match(tsv, /^Kanji\tDisplayWord\tMeaningJP\tPrimaryReading/u);
    assert.match(tsv, /\n日\t日\tday\tひ\tday \/ sun\t\tニチ\tひ\t\t\t日\t日\t今日はいい日です。/u);
});

test("buildTrackedSourceKanjiArtifact builds source-derived kanji TSVs without local workspace data", async () => {
    const cases = [
        { level: 5, rows: 80, scope: N5_TRACKED_SOURCE_KANJI_TSV_SCOPE },
        { level: 4, rows: 212, scope: null },
        { level: 3, rows: 341, scope: null },
    ];

    for (const { level, rows, scope } of cases) {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `kanji-tracked-source-kanji-n${level}-`));

        try {
            const report = await buildTrackedSourceKanjiArtifact({
                level,
                outDir: tempRoot,
            });

            assert.equal(report.passed, true);
            assert.equal(report.certifiable, true);
            if (scope) {
                assert.equal(report.scope, scope);
            } else {
                assert.equal(report.scope.type, `n${level}-tracked-source-kanji-tsv`);
            }
            assert.equal(report.kanji.rowCount, rows);
            assert.equal(report.kanji.deterministic, true);
            assert.equal(report.preflight.certifiable, true);
            assert.equal(fs.existsSync(path.join(tempRoot, "exports", `jlpt-n${level}-kanji.tsv`)), true);
            assert.equal(fs.existsSync(path.join(tempRoot, "reports", "tracked-source-kanji-artifact-summary.json")), true);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    }
});

test("buildTrackedSourceKanjiArtifact fails closed for levels missing field-source contracts", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-tracked-source-kanji-n2-"));

    try {
        const report = await buildTrackedSourceKanjiArtifact({
            level: 2,
            outDir: tempRoot,
        });

        assert.equal(report.passed, false);
        assert.equal(report.certifiable, false);
        assert.equal(report.scope.type, "n2-tracked-source-kanji-tsv");
        assert.equal(report.kanji.rowCount, 0);
        assert.equal(report.artifacts.kanjiTsvPath, null);
        assert.equal(fs.existsSync(path.join(tempRoot, "exports", "jlpt-n2-kanji.tsv")), false);
        assert.equal(fs.existsSync(path.join(tempRoot, "reports", "tracked-source-kanji-artifact-summary.json")), true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildTrackedSourceKanjiArtifacts passes for selected N5 through N3 levels", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-tracked-source-kanji-all-"));

    try {
        const report = await buildTrackedSourceKanjiArtifacts({
            levels: [5, 4, 3],
            outDir: tempRoot,
        });

        assert.equal(report.passed, true);
        assert.equal(report.certifiable, true);
        assert.deepEqual(report.levels.map((levelReport) => levelReport.scope.level), [5, 4, 3]);
        assert.equal(report.levels[0].passed, true);
        assert.equal(report.levels[1].passed, true);
        assert.equal(report.levels[2].passed, true);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test("buildTrackedSourceKanjiArtifacts reports missing higher-level contracts fail-closed", async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanji-tracked-source-kanji-all-"));

    try {
        const report = await buildTrackedSourceKanjiArtifacts({
            levels: [5, 4, 3, 2],
            outDir: tempRoot,
        });

        assert.equal(report.passed, false);
        assert.equal(report.certifiable, false);
        assert.deepEqual(report.levels.map((levelReport) => levelReport.scope.level), [5, 4, 3, 2]);
        assert.equal(report.levels[0].passed, true);
        assert.equal(report.levels[1].passed, true);
        assert.equal(report.levels[2].passed, true);
        assert.equal(report.levels[3].passed, false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
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

test("countCardFieldSourceEntriesForLevel scopes tracked field-source coverage to the selected level", () => {
    const coverage = countCardFieldSourceEntriesForLevel({
        kanjiLevels: {
            日: 5,
            本: 5,
            海: 4,
        },
    }, {
        entries: {
            日: { fieldValues: { primaryReading: "にち" } },
            海: { fieldValues: { primaryReading: "うみ" } },
        },
    }, 5);

    assert.deepEqual(coverage, {
        expected: 2,
        covered: 1,
        missing: 1,
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

test("buildTrackedSourceKanjiReleaseQaGate keeps APKG/media/manual QA fail-closed", () => {
    const report = buildTrackedSourceKanjiReleaseQaGate({
        levels: [5],
        artifactSummaries: [
            {
                passed: true,
                scope: { level: 5 },
                artifacts: {
                    kanjiTsvPath: "out/product-readiness/n5-tracked-source-kanji/exports/jlpt-n5-kanji.tsv",
                },
                reports: {
                    summaryPath: "out/product-readiness/n5-tracked-source-kanji/reports/tracked-source-kanji-artifact-summary.json",
                },
            },
        ],
    });

    assert.equal(report.passed, false);
    assert.equal(report.certifiable, false);
    assert.equal(report.scope, TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE);
    assert.equal(report.levels[0].requirements.find((requirement) => requirement.id === "tracked-source-kanji-tsv").passed, true);
    assert.equal(report.levels[0].requirements.find((requirement) => requirement.id === "apkg-package").status, "manual-required");
    assert.equal(report.levels[0].requirements.find((requirement) => requirement.id === "managed-media-provenance").status, "manual-required");
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

test("formatTrackedSourceKanjiArtifactReport states generated TSV boundaries", () => {
    const text = formatTrackedSourceKanjiArtifactReport({
        passed: true,
        certifiable: true,
        scope: N5_TRACKED_SOURCE_KANJI_TSV_SCOPE,
        artifacts: {
            kanjiTsvPath: "out/product-readiness/n5-tracked-source-kanji/exports/jlpt-n5-kanji.tsv",
        },
        kanji: {
            rowCount: 80,
            deterministic: true,
            sha256: "abc",
            failures: [],
        },
        preflight: {
            passed: true,
            certifiable: true,
            kanji: {
                counts: {
                    cardFieldSourceKanji: 80,
                    readingReferenceKanji: 80,
                },
                blockers: [],
            },
        },
    });

    assert.match(text, /Tracked-Source Kanji TSV Artifact Gate/);
    assert.match(text, /rows: 80/);
    assert.match(text, /ignored local data\/ kanji, KRAD, cache, and media inputs are not read/);
    assert.match(text, /fresh \.apkg product artifacts/);
});

test("formatTrackedSourceKanjiArtifactsReport summarizes five-level blockers", () => {
    const text = formatTrackedSourceKanjiArtifactsReport({
        passed: false,
        certifiable: false,
        scope: {
            type: "tracked-source-kanji-tsv-multi-level",
            sourceBoundary: "tracked contracts only",
        },
        levels: [
            {
                passed: true,
                scope: { level: 5 },
                kanji: { rowCount: 80 },
                artifacts: { kanjiTsvPath: "out/n5.tsv" },
            },
            {
                passed: false,
                scope: { level: 3 },
                kanji: { rowCount: 0, failures: ["tracked-source kanji preflight is not certifiable"] },
                artifacts: { kanjiTsvPath: null },
                preflight: {
                    kanji: {
                        blockers: [{ id: "rich-source-provenance" }],
                    },
                },
            },
        ],
    });

    assert.match(text, /N5: passing/);
    assert.match(text, /N3: blocked/);
    assert.match(text, /rich-source-provenance/);
});

test("formatTrackedSourceKanjiReleaseQaReport states manual QA blockers", () => {
    const text = formatTrackedSourceKanjiReleaseQaReport({
        passed: false,
        certifiable: false,
        scope: TRACKED_SOURCE_KANJI_RELEASE_QA_SCOPE,
        levels: [
            {
                level: 5,
                passed: false,
                requirements: [
                    {
                        status: "manual-required",
                        label: "N5 governed APKG package approval",
                        blocker: "No governed tracked-source kanji APKG package approval is recorded.",
                    },
                ],
            },
        ],
    });

    assert.match(text, /APKG\/Media\/Manual QA Gate/);
    assert.match(text, /manual-required: N5 governed APKG package approval/);
    assert.match(text, /cannot be inferred from green unit tests|automatic APKG import success/);
});

test("formatTrackedSourceKanjiPreflightReport states certification scope", () => {
    const text = formatTrackedSourceKanjiPreflightReport({
        passed: true,
        certifiable: true,
        scope: N5_TRACKED_SOURCE_KANJI_PREFLIGHT_SCOPE,
        kanji: {
            counts: {
                expectedKanji: 80,
                contractKanji: 80,
                curatedMeanings: 80,
                componentContractKanji: 80,
                readingReferenceKanji: 80,
                cardFieldSourceKanji: 80,
            },
            requirements: [
                {
                    label: "component/radical source data",
                    trackedToday: true,
                    source: "templates/kanji_component_contract.json",
                },
            ],
            blockers: [],
        },
    });

    assert.match(text, /Tracked-Source Kanji Preflight/);
    assert.match(text, /Tracked-source kanji TSV certifiable: yes/);
    assert.match(text, /component\/radical source data/);
    assert.match(text, /component contract entries: 80/);
    assert.match(text, /reading reference entries: 80/);
    assert.match(text, /card field source entries: 80/);
    assert.match(text, /ignored local data\/ kanji, KRAD, cache, and media inputs are not read/);
});
