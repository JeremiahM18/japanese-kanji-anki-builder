const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDatabricksSnapshot,
    parseSnapshotId,
} = require("../src/services/databricksSnapshotExportService");
const {
    CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
} = require("../src/services/platinumKanjiReviewService");
const {
    CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
} = require("../src/services/platinumReviewService");
const {
    CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireKanjiReviewService");
const {
    CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
} = require("../src/services/sapphireWordReviewService");
const { parseArgs } = require("../scripts/exportDatabricksSnapshot");

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, value, "utf8");
}

function evidence(type) {
    return {
        type,
        source: "fixture",
        detail: `${type} fixture`,
    };
}

function kanjiSapphireEntry(kanji) {
    return {
        kanji,
        status: "sapphire",
        reviewStandard: CURRENT_KANJI_SAPPHIRE_REVIEW_STANDARD,
        reviewedAt: "2026-06-09",
        reviewer: "fixture",
        sapphireReviewAudit: {},
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("stroke-order-review"),
        ],
        reviewEvidence: [
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function kanjiPlatinumEntry(kanji) {
    return {
        kanji,
        status: "platinum",
        reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-06-09",
        revalidationSummary: [
            "evidence lanes",
            "generated surface",
            "Japanese source evidence",
            "example sentence",
            "notes support surface",
            "audio",
            "stroke-order media",
            "verification limitations",
        ].join("; "),
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("stroke-order-review"),
        ],
        reviewEvidence: [
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function wordSapphireEntry(word, reading) {
    return {
        word,
        status: "sapphire",
        readingIncludes: [reading],
        reviewStandard: CURRENT_WORD_SAPPHIRE_REVIEW_STANDARD,
        reviewedAt: "2026-06-09",
        revalidatedAt: "2026-06-09",
        reviewer: "fixture",
        revalidationSummary: "structural fixture",
        migrationProvenance: {},
        sourceEvidence: [evidence("japanese-source")],
        internalChecks: [
            evidence("generated-surface"),
            evidence("golden-regression"),
            evidence("level-contract"),
            evidence("media-audit"),
            evidence("audio-review"),
            evidence("pitch-accent-review"),
            evidence("label-review"),
        ],
        reviewEvidence: [
            evidence("example-review"),
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function wordPlatinumEntry(word, reading) {
    return {
        word,
        status: "platinum",
        readingIncludes: [reading],
        notesIncludes: ["fixture"],
        reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
        revalidatedAt: "2026-06-09",
        revalidationSummary: [
            "evidence lanes",
            "generated surface",
            "Japanese source evidence",
            "example sentence",
            "notes support surface",
            "reading breakdown",
            "labels",
            "audio",
            "pitch accent",
            "media provenance",
            "verification limitations",
        ].join("; "),
        reviewEvidence: [
            evidence("example-review"),
            evidence("manual-review"),
            evidence("current-standard-review"),
        ],
    };
}

function proofEvent({ deckKind, written, reading, reviewStandard }) {
    return {
        proofId: `${deckKind}-proof-1`,
        target: {
            deckKind,
            level: 1,
            written,
            reading,
            cardReviewed: `${written}|${reading}`,
        },
        batch: {
            id: "fixture-batch",
        },
        proof: {
            reviewedAt: "2026-06-09",
            reviewer: "fixture",
            reviewStandard,
            result: "approved",
            evidenceChecked: [
                "generated surface",
                "review set",
                "source evidence",
                "example sentence",
                "reading",
                "meaning",
                "audio",
                "media",
            ],
        },
        ledger: {
            sourceReviewSetPath: `templates/platinum_n1${deckKind === "word" ? "_word" : ""}_review_set.json`,
            sourceCommit: "abc1234",
        },
    };
}

function createFixtureRepo({
    duplicateGenerated = false,
    omitPlatinum = false,
    closeoutGeneratedOverride = null,
} = {}) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "databricks-snapshot-"));
    writeJson(path.join(rootDir, "templates", "jlpt_level_contract.json"), {
        version: 1,
        inventoryCounts: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
        kanjiLevels: { 日: 1 },
    });
    writeJson(path.join(rootDir, "templates", "jlpt_word_level_contract.json"), {
        version: 1,
        inventoryCounts: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 },
        excludedCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        wordLevels: {
            "日本|にほん": { written: "日本", reading: "にほん", jlpt: 1 },
        },
        excludedWordLevels: {},
    });
    writeJson(path.join(rootDir, "templates", "golden_n1_review_set.json"), [{ kanji: "日" }]);
    writeJson(path.join(rootDir, "templates", "golden_n1_word_review_set.json"), [
        { word: "日本", readingIncludes: ["にほん"] },
    ]);
    writeJson(path.join(rootDir, "templates", "sapphire_n1_review_set.json"), [kanjiSapphireEntry("日")]);
    writeJson(path.join(rootDir, "templates", "sapphire_n1_word_review_set.json"), [wordSapphireEntry("日本", "にほん")]);
    writeJson(path.join(rootDir, "templates", "platinum_n1_review_set.json"), omitPlatinum ? [] : [kanjiPlatinumEntry("日")]);
    writeJson(path.join(rootDir, "templates", "platinum_n1_word_review_set.json"), omitPlatinum ? [] : [wordPlatinumEntry("日本", "にほん")]);
    writeText(
        path.join(rootDir, "out", "build", "exports", "jlpt-n1.tsv"),
        [
            "Kanji\tPrimaryReading\tAudio\tStrokeOrder",
            "日\tにち\t[sound:65E5_日-kanji-reading-日-にち.wav]\t<img src=\"65E5_日-stroke-order.gif\" />",
            duplicateGenerated ? "日\tにち\t[sound:65E5_日-kanji-reading-日-にち.wav]\t<img src=\"65E5_日-stroke-order.gif\" />" : "",
        ].filter(Boolean).join("\n") + "\n"
    );
    writeText(
        path.join(rootDir, "out", "word-build", "exports", "jlpt-n1-words.tsv"),
        "Word\tReading\tAudio\n日本\tにほん\t[sound:65E5_日-word-reading-日本-にほん.wav]\n"
    );
    writeText(path.join(rootDir, "data", "media", "fixture", "65E5_日-kanji-reading-日-にち.wav"), "audio bytes");
    writeText(path.join(rootDir, "data", "media", "fixture", "65E5_日-stroke-order.gif"), "gif bytes");
    writeText(path.join(rootDir, "package.json"), "{}\n");
    writeText(path.join(rootDir, "package-lock.json"), "{}\n");

    const generatedCount = closeoutGeneratedOverride ?? (duplicateGenerated ? 2 : 1);
    const laneRows = [
        {
            deckKind: "kanji",
            level: 1,
            levelLabel: "N1",
            denominator: 1,
            denominatorSource: "templates/jlpt_level_contract.json",
            generated: { exists: true, count: generatedCount, path: path.join(rootDir, "out", "build", "exports", "jlpt-n1.tsv") },
            lanes: {
                silver: { count: generatedCount, missing: 0, ratio: `${generatedCount}/1`, complete: generatedCount === 1 },
                gold: { count: 1, missing: 0, ratio: "1/1", complete: true },
                sapphire: { count: 1, missing: 0, ratio: "1/1", complete: true },
                platinum: { count: omitPlatinum ? 0 : 1, missing: omitPlatinum ? 1 : 0, ratio: `${omitPlatinum ? 0 : 1}/1`, complete: !omitPlatinum },
            },
        },
        {
            deckKind: "word",
            level: 1,
            levelLabel: "N1",
            denominator: 1,
            denominatorSource: "templates/jlpt_word_level_contract.json",
            generated: { exists: true, count: 1, path: path.join(rootDir, "out", "word-build", "exports", "jlpt-n1-words.tsv") },
            lanes: {
                silver: { count: 1, missing: 0, ratio: "1/1", complete: true },
                gold: { count: 1, missing: 0, ratio: "1/1", complete: true },
                sapphire: { count: 1, missing: 0, ratio: "1/1", complete: true },
                platinum: { count: omitPlatinum ? 0 : 1, missing: omitPlatinum ? 1 : 0, ratio: `${omitPlatinum ? 0 : 1}/1`, complete: !omitPlatinum },
            },
        },
    ];
    return { rootDir, closeoutReport: { laneRows, expectedGates: [] } };
}

function createGitStub(rootDir) {
    return (command, args) => {
        assert.equal(command, "git");
        const key = args.join(" ");
        if (key === "status --short --branch") {
            return "## databricks-snapshot-export\n";
        }
        if (key === "rev-parse HEAD") {
            return "abc1234567890\n";
        }
        if (key === "branch --show-current") {
            return "databricks-snapshot-export\n";
        }
        if (key === "ls-remote --heads origin") {
            return "abc1234567890\trefs/heads/main\n";
        }
        throw new Error(`unexpected git command from ${rootDir}: ${key}`);
    };
}

function stubCommandEvidence() {
    return [
        {
            id: "docs_status_audit",
            label: "Documentation status audit",
            command: "npm run docs:status-audit",
            exitCode: 0,
            status: "passed",
            passed: true,
            stdoutSha256: "a",
            stderrSha256: "b",
            stdoutLineCount: 1,
            stderrLineCount: 0,
        },
        {
            id: "deck_closeout_all_levels",
            label: "Deck closeout all levels",
            command: "npm run deck:closeout -- --levels=5,4,3,2,1",
            exitCode: 0,
            status: "passed",
            passed: true,
            stdoutSha256: "c",
            stderrSha256: "d",
            stdoutLineCount: 1,
            stderrLineCount: 0,
        },
        {
            id: "obsidian_proof_validate",
            label: "Obsidian proof validation",
            command: "npm run data:obsidian:proof:validate -- --json",
            exitCode: 0,
            status: "passed",
            passed: true,
            stdoutSha256: "e",
            stderrSha256: "f",
            stdoutLineCount: 1,
            stderrLineCount: 0,
        },
    ];
}

function readNdjson(filePath) {
    return fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

test("databricks snapshot writes required metadata files without granting certification authority", () => {
    const { rootDir, closeoutReport } = createFixtureRepo();
    const result = buildDatabricksSnapshot({
        rootDir,
        snapshotId: "fixture-proof",
        levels: [1],
        now: () => "2026-06-30T12:00:00.000Z",
        execFileSync: createGitStub(rootDir),
        runCommandEvidenceFn: stubCommandEvidence,
        buildCloseoutReportFn: () => closeoutReport,
        buildSourceEvidenceSummaryRowsFn: () => [],
        loadProofLedgerFn: () => ({
            files: [],
            events: [
                proofEvent({
                    deckKind: "kanji",
                    written: "日",
                    reading: "にち",
                    reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
                }),
                proofEvent({
                    deckKind: "word",
                    written: "日本",
                    reading: "にほん",
                    reviewStandard: CURRENT_WORD_PLATINUM_REVIEW_STANDARD,
                }),
            ],
        }),
    });

    assert.equal(result.manifest.counts.kanjiGenerated, 1);
    assert.equal(result.manifest.counts.wordGenerated, 1);
    assert.equal(result.manifest.counts.totalProofEvents, 2);
    assert.equal(result.manifest.snapshotCompletenessStatus, "complete");
    assert.match(result.manifest.authorityBoundary, /analytics\/reporting artifacts only/);
    assert.deepEqual(result.files, [
        "manifest.json",
        "card_surfaces.ndjson",
        "lane_coverage.ndjson",
        "review_decisions.ndjson",
        "obsidian_proof_events.ndjson",
        "source_evidence_summary.ndjson",
        "media_assets.ndjson",
        "expected_backlog.ndjson",
        "data_quality_findings.ndjson",
    ]);

    const outputDir = result.outputDir;
    for (const fileName of result.files) {
        assert.equal(fs.existsSync(path.join(outputDir, fileName)), true, `${fileName} should exist`);
    }
    const mediaRows = readNdjson(path.join(outputDir, "media_assets.ndjson"));
    assert.equal(mediaRows.some((row) => Object.prototype.hasOwnProperty.call(row, "content")), false);
    assert.equal(mediaRows.every((row) => row.binaryMediaExported === false), true);
    assert.equal(mediaRows.some((row) => row.sha256), true);
    const laneRows = readNdjson(path.join(outputDir, "lane_coverage.ndjson"));
    assert.equal(laneRows.find((row) => row.deckKind === "word" && row.lane === "obsidian").count, 1);
});

test("databricks snapshot rejects duplicate generated card identities", () => {
    const { rootDir, closeoutReport } = createFixtureRepo({ duplicateGenerated: true });
    assert.throws(() => buildDatabricksSnapshot({
        rootDir,
        snapshotId: "dupe-proof",
        levels: [1],
        execFileSync: createGitStub(rootDir),
        runCommandEvidenceFn: stubCommandEvidence,
        buildCloseoutReportFn: () => closeoutReport,
        buildSourceEvidenceSummaryRowsFn: () => [],
        loadProofLedgerFn: () => ({ files: [], events: [] }),
    }), /Duplicate generated card identity/u);
});

test("databricks snapshot rejects proof events without active Platinum binding", () => {
    const { rootDir, closeoutReport } = createFixtureRepo({ omitPlatinum: true });
    assert.throws(() => buildDatabricksSnapshot({
        rootDir,
        snapshotId: "proof-without-platinum",
        levels: [1],
        execFileSync: createGitStub(rootDir),
        runCommandEvidenceFn: stubCommandEvidence,
        buildCloseoutReportFn: () => closeoutReport,
        buildSourceEvidenceSummaryRowsFn: () => [],
        loadProofLedgerFn: () => ({
            files: [],
            events: [proofEvent({
                deckKind: "kanji",
                written: "日",
                reading: "にち",
                reviewStandard: CURRENT_KANJI_PLATINUM_REVIEW_STANDARD,
            })],
        }),
    }), /not bound to active current-standard Platinum/u);
});

test("databricks snapshot rejects generated count mismatches", () => {
    const { rootDir, closeoutReport } = createFixtureRepo({ closeoutGeneratedOverride: 2 });
    assert.throws(() => buildDatabricksSnapshot({
        rootDir,
        snapshotId: "count-mismatch",
        levels: [1],
        execFileSync: createGitStub(rootDir),
        runCommandEvidenceFn: stubCommandEvidence,
        buildCloseoutReportFn: () => closeoutReport,
        buildSourceEvidenceSummaryRowsFn: () => [],
        loadProofLedgerFn: () => ({ files: [], events: [] }),
    }), /generated-count-preserved/u);
});

test("databricks snapshot id parsing keeps output under the governed snapshot root", () => {
    assert.equal(parseSnapshotId("local-proof"), "local-proof");
    assert.throws(() => parseSnapshotId("../outside"), /Invalid snapshot id|path traversal/u);
});

test("databricks snapshot CLI parseArgs accepts snapshot id and levels", () => {
    assert.deepEqual(parseArgs(["--snapshot-id=local-proof", "--levels=5,4", "--json"]), {
        json: true,
        levels: [5, 4],
        snapshotId: "local-proof",
        unknownArgs: [],
    });
});
