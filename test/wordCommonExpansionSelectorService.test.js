const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    SOURCE_UNIVERSE_WARNING,
    buildWordCommonExpansionSelectorReport,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
} = require("../src/services/wordCommonExpansionSelectorService");

function writeFixtureSource(dir, fileName, text) {
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, text);
    return {
        path: filePath,
        byteSize: Buffer.byteLength(text),
        rowCount: text.trim().split(/\r?\n/u).length - 1,
    };
}

function buildCandidateSourceManifestEntry({ name, sourceId, candidateSource, levels }) {
    return {
        name,
        tier: 4,
        status: "active",
        sourceType: "community_web_list",
        origin: {
            url: `https://example.com/${sourceId}`,
            localPath: candidateSource.path,
        },
        licenseUse: {
            status: "needs_review",
            notes: "Fixture discovery source.",
        },
        checkedAt: "2026-06-21",
        local: {
            path: candidateSource.path,
            format: "tsv",
            byteSize: candidateSource.byteSize,
            rowCount: candidateSource.rowCount,
            columns: ["written", "reading", "meaning", "jlpt"],
        },
        intendedUse: ["candidate-discovery", "level-hint"],
        allowedUse: ["candidate-discovery", "level-hint"],
        disallowedUse: ["card-approval"],
        candidatePolicy: {
            levels,
            kanjiScope: "known-jlpt",
            requireSourceLevel: true,
        },
    };
}

function buildManifest({
    candidateSource,
    n3CandidateSource = null,
    candidateSourcesByLevel = {},
    dictionarySource,
    frequencySource,
}) {
    const candidateSources = {};

    if (candidateSource) {
        candidateSources["fixture-n5"] = buildCandidateSourceManifestEntry({
            name: "Fixture N5 vocabulary list",
            sourceId: "n5",
            candidateSource,
            levels: [5],
        });
    }

    if (n3CandidateSource) {
        candidateSources["fixture-n3"] = buildCandidateSourceManifestEntry({
            name: "Fixture N3 vocabulary list",
            sourceId: "n3",
            candidateSource: n3CandidateSource,
            levels: [3],
        });
    }

    for (const [levelLabel, source] of Object.entries(candidateSourcesByLevel || {})) {
        const level = Number(levelLabel);
        candidateSources[`fixture-n${level}`] = buildCandidateSourceManifestEntry({
            name: `Fixture N${level} vocabulary list`,
            sourceId: `n${level}`,
            candidateSource: source,
            levels: [level],
        });
    }

    return {
        version: 1,
        checkedAt: "2026-06-21",
        sources: {
            ...candidateSources,
            "fixture-dictionary": {
                name: "Fixture dictionary",
                tier: 2,
                status: "active",
                sourceType: "dictionary",
                origin: {
                    url: "https://example.com/dict",
                    localPath: dictionarySource.path,
                },
                licenseUse: {
                    status: "approved",
                    notes: "Fixture dictionary source.",
                },
                checkedAt: "2026-06-21",
                local: {
                    path: dictionarySource.path,
                    format: "tsv",
                    byteSize: dictionarySource.byteSize,
                    rowCount: dictionarySource.rowCount,
                    columns: ["written", "reading", "meaning"],
                },
                intendedUse: ["dictionary-verification"],
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                disallowedUse: ["level-truth"],
            },
            "fixture-priority": {
                name: "Fixture JMdict priority",
                tier: 3,
                status: "active",
                sourceType: "dictionary_priority",
                origin: {
                    url: "https://example.com/priority",
                    localPath: frequencySource.path,
                },
                licenseUse: {
                    status: "approved",
                    notes: "Fixture commonness source.",
                },
                checkedAt: "2026-06-21",
                local: {
                    path: frequencySource.path,
                    format: "tsv",
                    byteSize: frequencySource.byteSize,
                    rowCount: frequencySource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
                intendedUse: ["frequency-sanity", "usefulness-support"],
                allowedUse: ["frequency-sanity", "usefulness-support"],
                disallowedUse: ["level-truth"],
            },
        },
    };
}

function buildExhaustedReadingSignal(level) {
    return {
        level,
        levelLabel: `N${level}`,
        fullyExpanded: true,
        reading: {
            status: "exhausted",
            activeItems: 0,
            editorialReviewItems: 0,
            promoteCuratedExampleItems: 0,
            deferVariantItems: 0,
            totalItems: 0,
            reason: "No active reading-gap triage items remain.",
            blockers: [],
        },
        enhancement: {
            status: "exhausted",
            keepCandidates: 0,
            untriagedCandidateRows: 0,
            moveCandidates: 0,
            crossLevelRoutingRows: 0,
            blockers: [],
        },
        placement: {
            status: "resolved",
            violationCount: 0,
            blockers: [],
        },
    };
}

test("buildWordCommonExpansionSelectorReport classifies governed common-word source rows without promotion", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "山川\tさんせん\tmountains and rivers\tN5",
            "茶山\tちゃやま\ttea mountain\tN5",
            "悪行\tあくぎょう\tbad act\tN5",
            "手紙\tてがみ\tletter\tN5",
            "かな\tかな\tkana\tN5",
            "既存\tきそん\texisting\tN5",
            "～山\t～やま\tmountain suffix\tN5",
            "山\t～やま\tmountain suffix standalone kanji\tN5",
            "小山\tこやま\tsmall mountain\tN5",
            "山行\tさんこう\tmountain trip\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "山川\tさんせん\tmountains and rivers",
            "茶山\tちゃやま\ttea mountain",
            "手紙\tてがみ\tletter",
            "小山\tこやま\tsmall mountain",
            "山行\tさんこう\tmountain trip",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "山川\tさんせん\tmountains and rivers\t100",
            "手紙\tてがみ\tletter\t100",
            "小山\tこやま\tsmall mountain\t120",
            "山行\tさんこう\tmountain trip\t120",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        limit: 20,
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                山: 5,
                川: 5,
                茶: 5,
                悪: 5,
                行: 5,
                手: 4,
                紙: 4,
                既: 5,
                存: 5,
                小: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "既存|きそん": { written: "既存", reading: "きそん", jlpt: 5 },
            },
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "山川|さんせん": {
                        decision: "keep_candidate",
                        priority: "high",
                        reason: "Common, useful fixture word.",
                    },
                    "手紙|てがみ": {
                        decision: "move_candidate",
                        targetLevel: "N4",
                        reason: "All known anchors are N4.",
                    },
                    "小山|こやま": {
                        decision: "defer_candidate",
                        reason: "Lower learner value.",
                    },
                    "山行|さんこう": {
                        decision: "reject_candidate",
                        reason: "Wrong learner fit.",
                    },
                },
            },
        },
    });

    assert.equal(report.blockers.length, 0);
    assert.equal(report.configuredSourceOnly, true);
    assert.equal(report.levelReports[0].sourceUniverse.configuredSourceOnly, true);
    assert.equal(report.levelReports[0].sourceUniverse.warning, SOURCE_UNIVERSE_WARNING);

    const rowsByKey = new Map(report.levelReports[0].rows.map((row) => [row.key, row]));
    assert.equal(rowsByKey.get("山川|さんせん").selectorStatus, "ready_for_editorial_review");
    assert.equal(rowsByKey.get("茶山|ちゃやま").selectorStatus, "blocked_missing_commonness");
    assert.equal(rowsByKey.get("悪行|あくぎょう").selectorStatus, "blocked_missing_dictionary");
    assert.equal(rowsByKey.get("手紙|てがみ").selectorStatus, "move_candidate");
    assert.equal(rowsByKey.get("かな|かな").selectorStatus, "kana_only_out_of_scope");
    assert.equal(rowsByKey.get("既存|きそん").selectorStatus, "already_governed");
    assert.equal(rowsByKey.get("～山|～やま").selectorStatus, "blocked_identity");
    assert.equal(rowsByKey.get("山|～やま").selectorStatus, "needs_triage");
    assert.equal(rowsByKey.get("小山|こやま").selectorStatus, "triaged_defer");
    assert.equal(rowsByKey.get("山行|さんこう").selectorStatus, "triaged_reject");

    const counts = report.levelReports[0].summary.selectorStatusCounts;
    assert.equal(counts.ready_for_editorial_review, 1);
    assert.equal(counts.blocked_missing_commonness, 1);
    assert.equal(counts.blocked_missing_dictionary, 1);
    assert.equal(counts.move_candidate, 1);
    assert.equal(counts.needs_triage, 1);
    assert.equal(counts.kana_only_out_of_scope, 1);
    assert.equal(counts.already_governed, 1);

    const formatted = formatWordCommonExpansionSelectorReport(report);
    assert.match(formatted, /Read-only report/);
    assert.match(formatted, /Configured-source selector only/);
    assert.match(formatted, /ready_for_editorial_review/);
});

test("buildWordCommonExpansionSelectorReport keeps move_candidate authoritative in vocabulary-level mode", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "手紙\tてがみ\tletter\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "手紙\tてがみ\tletter",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "手紙\tてがみ\tletter\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                手: 4,
                紙: 4,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "手紙|てがみ": {
                        decision: "move_candidate",
                        targetLevel: "N4",
                        priority: "normal",
                        reason: "Anchor-mode routing belongs in N4.",
                    },
                },
            },
        },
    });

    const row = report.levelReports[0].rows.find((candidate) => candidate.key === "手紙|てがみ");
    assert.equal(report.placementMode, "vocabulary-level");
    assert.equal(row.selectorStatus, "move_candidate");
    assert.equal(row.sourceDisposition, "review_candidate");
    assert.equal(row.triageDecision.decision, "move_candidate");
    assert.equal(row.triageDecision.targetLevel, 4);
    assert.equal(row.sourceTriageDecision, null);
});

test("buildWordCommonExpansionSelectorReport routes missing move_candidate rows into target level queue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "手紙\tてがみ\tletter\tN5",
        ].join("\n")
    );
    const n3CandidateSource = writeFixtureSource(
        dir,
        "n3.tsv",
        [
            "written\treading\tmeaning\tjlpt",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "手紙\tてがみ\tletter",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "手紙\tてがみ\tletter\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [3],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            3: {
                level: 3,
                levelLabel: "N3",
                fullyExpanded: true,
                reading: {
                    status: "exhausted",
                    activeItems: 0,
                    editorialReviewItems: 0,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 0,
                    totalItems: 0,
                    reason: "No active reading-gap triage items remain.",
                    blockers: [],
                },
                enhancement: {
                    status: "exhausted",
                    keepCandidates: 0,
                    untriagedCandidateRows: 0,
                    moveCandidates: 0,
                    crossLevelRoutingRows: 0,
                    blockers: [],
                },
                placement: {
                    status: "resolved",
                    violationCount: 0,
                    blockers: [],
                },
            },
        },
        manifest: buildManifest({ candidateSource, n3CandidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                手: 3,
                紙: 3,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "手紙|てがみ": {
                        decision: "move_candidate",
                        targetLevel: "N3",
                        priority: "high",
                        reason: "N5 source row belongs in the N3 word deck.",
                    },
                },
            },
        },
    });

    assert.deepEqual(report.levels, [3]);
    assert.deepEqual(report.routingSupportLevels, [5]);
    assert.equal(report.blockers.length, 0);
    assert.equal(report.summary.routedMoveCandidateRows, 1);
    assert.equal(report.levelReports[0].summary.routedMoveCandidateRows, 1);
    assert.equal(report.levelReports[0].routedMoveCandidateSummary.totalMoveCandidatesToTarget, 1);
    assert.equal(report.levelReports[0].routedMoveCandidateSummary.targetQueueRows, 1);
    assert.equal(report.levelReports[0].routedMoveCandidateSummary.addedTargetQueueRows, 1);

    const row = report.levelReports[0].rows.find((candidate) => candidate.key === "手紙|てがみ");
    assert.equal(row.selectorStatus, "needs_triage");
    assert.equal(row.sourceDisposition, "routed_move_candidate");
    assert.equal(row.targetLevel, 3);
    assert.equal(row.sourceTriageDecision.decision, "move_candidate");
    assert.equal(row.sourceTriageDecision.targetLevel, 3);
    assert.equal(row.routing.sourceLevel, 5);
    assert.equal(row.routing.targetLevel, 3);
});

test("buildWordCommonExpansionSelectorReport routes lower-source move candidates into all requested target levels", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const n5CandidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "鏡\tかがみ\tmirror\tN5",
        ].join("\n")
    );
    const n4CandidateSource = writeFixtureSource(
        dir,
        "n4.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "髪\tかみ\thair\tN4",
        ].join("\n")
    );
    const n2CandidateSource = writeFixtureSource(
        dir,
        "n2.tsv",
        [
            "written\treading\tmeaning\tjlpt",
        ].join("\n")
    );
    const n1CandidateSource = writeFixtureSource(
        dir,
        "n1.tsv",
        [
            "written\treading\tmeaning\tjlpt",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "鏡\tかがみ\tmirror",
            "髪\tかみ\thair",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "鏡\tかがみ\tmirror\t100",
            "髪\tかみ\thair\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [2, 1],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            2: buildExhaustedReadingSignal(2),
            1: buildExhaustedReadingSignal(1),
        },
        manifest: buildManifest({
            candidateSource: n5CandidateSource,
            candidateSourcesByLevel: {
                4: n4CandidateSource,
                2: n2CandidateSource,
                1: n1CandidateSource,
            },
            dictionarySource,
            frequencySource,
        }),
        jlptLevelContract: {
            kanjiLevels: {
                鏡: 1,
                髪: 2,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "鏡|かがみ": {
                        decision: "move_candidate",
                        targetLevel: "N1",
                        priority: "high",
                        reason: "N5 source row belongs in the N1 word deck.",
                    },
                },
            },
            N4: {
                "fixture-n4": {
                    "髪|かみ": {
                        decision: "move_candidate",
                        targetLevel: "N2",
                        priority: "high",
                        reason: "N4 source row belongs in the N2 word deck.",
                    },
                },
            },
        },
    });

    assert.deepEqual(report.levels, [2, 1]);
    assert.deepEqual(report.routingSupportLevels, [5, 4]);
    assert.equal(report.summary.routedMoveCandidateRows, 2);

    const reportsByLevel = new Map(report.levelReports.map((levelReport) => [levelReport.level, levelReport]));
    const n2Row = reportsByLevel.get(2).rows.find((row) => row.key === "髪|かみ");
    const n1Row = reportsByLevel.get(1).rows.find((row) => row.key === "鏡|かがみ");

    assert.equal(n2Row.selectorStatus, "needs_triage");
    assert.equal(n2Row.sourceDisposition, "routed_move_candidate");
    assert.equal(n2Row.sourceTriageDecision.decision, "move_candidate");
    assert.equal(n2Row.routing.sourceLevel, 4);
    assert.equal(n2Row.routing.targetLevel, 2);

    assert.equal(n1Row.selectorStatus, "needs_triage");
    assert.equal(n1Row.sourceDisposition, "routed_move_candidate");
    assert.equal(n1Row.sourceTriageDecision.decision, "move_candidate");
    assert.equal(n1Row.routing.sourceLevel, 5);
    assert.equal(n1Row.routing.targetLevel, 1);
});

test("buildWordCommonExpansionSelectorReport marks candidates inactive until reading expansion is exhausted", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "山川\tさんせん\tmountains and rivers\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "山川\tさんせん\tmountains and rivers",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "山川\tさんせん\tmountains and rivers\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: {
                level: 5,
                levelLabel: "N5",
                fullyExpanded: false,
                reading: {
                    status: "active",
                    activeItems: 2,
                    editorialReviewItems: 1,
                    promoteCuratedExampleItems: 1,
                    deferVariantItems: 0,
                    totalItems: 2,
                    reason: "Active reading-gap triage remains.",
                    blockers: [],
                },
                enhancement: {
                    status: "exhausted",
                    keepCandidates: 0,
                    untriagedCandidateRows: 0,
                    moveCandidates: 0,
                    crossLevelRoutingRows: 0,
                    blockers: [],
                },
                placement: {
                    status: "resolved",
                    violationCount: 0,
                    blockers: [],
                },
            },
        },
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                山: 5,
                川: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "山川|さんせん": {
                        decision: "keep_candidate",
                        priority: "high",
                        reason: "Common, useful fixture word.",
                    },
                },
            },
        },
    });

    const row = report.levelReports[0].rows.find((candidate) => candidate.key === "山川|さんせん");
    assert.equal(report.levelReports[0].commonWordQueue.active, false);
    assert.equal(report.summary.inactiveReadingExpansionLevels, 1);
    assert.equal(row.selectorStatus, "queue_inactive_reading_expansion");
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.ready_for_editorial_review, 0);
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.queue_inactive_reading_expansion, 1);
});

test("buildWordCommonExpansionSelectorReport does not block common-word queue on enhancement backlog", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "手紙\tてがみ\tletter\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "手紙\tてがみ\tletter",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "手紙\tてがみ\tletter\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: {
                level: 5,
                levelLabel: "N5",
                fullyExpanded: false,
                reading: {
                    status: "exhausted",
                    activeItems: 0,
                    editorialReviewItems: 0,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 0,
                    totalItems: 0,
                    reason: "No active reading-gap triage items remain.",
                    blockers: [],
                },
                enhancement: {
                    status: "needs_triage",
                    keepCandidates: 0,
                    untriagedCandidateRows: 1,
                    moveCandidates: 0,
                    crossLevelRoutingRows: 0,
                    reason: "Configured source-list enhancement review still has untriaged candidates.",
                    blockers: [],
                },
                placement: {
                    status: "resolved",
                    violationCount: 0,
                    blockers: [],
                },
            },
        },
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                手: 4,
                紙: 4,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "手紙|てがみ": {
                        decision: "move_candidate",
                        targetLevel: "N4",
                        priority: "normal",
                        reason: "Protect learner-fit routing.",
                    },
                },
            },
        },
    });

    const row = report.levelReports[0].rows.find((candidate) => candidate.key === "手紙|てがみ");
    assert.equal(report.levelReports[0].commonWordQueue.active, true);
    assert.equal(report.levelReports[0].commonWordQueue.readingExhausted, true);
    assert.equal(report.levelReports[0].commonWordQueue.fullyExpanded, false);
    assert.equal(report.levelReports[0].commonWordQueue.enhancementStatus, "needs_triage");
    assert.equal(row.selectorStatus, "move_candidate");
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.queue_inactive_reading_expansion, 0);
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.move_candidate, 1);
});

test("buildWordCommonExpansionSelectorReport keeps move_candidate visible while reading queue is inactive", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "手紙\tてがみ\tletter\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "手紙\tてがみ\tletter",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "手紙\tてがみ\tletter\t100",
        ].join("\n")
    );

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: {
                level: 5,
                levelLabel: "N5",
                fullyExpanded: false,
                reading: {
                    status: "active",
                    activeItems: 1,
                    editorialReviewItems: 1,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 0,
                    totalItems: 1,
                    reason: "Active reading-gap triage remains.",
                    blockers: [],
                },
                enhancement: {
                    status: "exhausted",
                    keepCandidates: 0,
                    untriagedCandidateRows: 0,
                    moveCandidates: 0,
                    crossLevelRoutingRows: 0,
                    blockers: [],
                },
                placement: {
                    status: "resolved",
                    violationCount: 0,
                    blockers: [],
                },
            },
        },
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                手: 4,
                紙: 4,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                "fixture-n5": {
                    "手紙|てがみ": {
                        decision: "move_candidate",
                        targetLevel: "N4",
                        priority: "normal",
                        reason: "Protect learner-fit routing.",
                    },
                },
            },
        },
    });

    const row = report.levelReports[0].rows.find((candidate) => candidate.key === "手紙|てがみ");
    assert.equal(report.levelReports[0].commonWordQueue.active, false);
    assert.equal(report.levelReports[0].commonWordQueue.readingExhausted, false);
    assert.equal(row.selectorStatus, "move_candidate");
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.queue_inactive_reading_expansion, 0);
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.move_candidate, 1);
});

test("classifyCommonExpansionSelectorRow treats triage as pre-trust routing", () => {
    assert.equal(classifyCommonExpansionSelectorRow({
        expansionRow: {
            disposition: "review_candidate",
            triageDecision: { decision: "reject_candidate" },
        },
        agreementRow: {
            dictionaryVerified: true,
            frequencySupported: true,
            cleanIdentity: true,
        },
    }), "triaged_reject");

    assert.equal(classifyCommonExpansionSelectorRow({
        expansionRow: {
            disposition: "review_candidate",
        },
        agreementRow: {
            dictionaryVerified: true,
            frequencySupported: true,
            cleanIdentity: true,
        },
    }), "needs_triage");
});
