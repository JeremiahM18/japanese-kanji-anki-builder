const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_SOURCE_ID,
    SOURCE_LANE_CONFIGURED_LABEL,
    SOURCE_LANE_EXTRA_LABEL,
    SOURCE_POOL_DICTIONARY_COMMON_LABEL,
    SOURCE_LEVEL_CLAIM_LABEL,
    SOURCE_LEVEL_CLAIM_STATUS,
    SOURCE_UNIVERSE_WARNING,
    buildExpansionWorkOrder,
    buildExtraSourceAccessByLevel,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    classifyCommonExpansionSelectorRow,
    formatWordCommonExpansionSelectorReport,
} = require("../src/services/wordCommonExpansionSelectorService");
const {
    buildSelectorManifestForSource,
    normalizeSelectorSourceId,
    parseArgs,
} = require("../scripts/reportWordCommonExpansionSelector");

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

function assertAllSelectorRowsCarrySourceLevelLabels(report) {
    for (const levelReport of report.levelReports) {
        assert.ok(levelReport.fallbackSourceGate, `N${levelReport.level} missing fallback source gate`);
        assert.equal(levelReport.sourceUniverse.sourceLaneLabel, SOURCE_LANE_CONFIGURED_LABEL);
        assert.equal(levelReport.sourceUniverse.levelClaimStatus, SOURCE_LEVEL_CLAIM_STATUS);
        assert.equal(levelReport.sourceUniverse.levelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);

        for (const row of levelReport.rows) {
            assert.equal(row.sourceLaneLabel, SOURCE_LANE_CONFIGURED_LABEL, `${row.key} missing configured-source lane label`);
            assert.equal(row.sourceLevelClaimStatus, SOURCE_LEVEL_CLAIM_STATUS, `${row.key} missing source claim status`);
            assert.equal(row.sourceLevelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL, `${row.key} missing source claim label`);
        }
    }
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
    assert.equal(report.levelReports[0].sourceUniverse.levelClaimStatus, SOURCE_LEVEL_CLAIM_STATUS);
    assert.equal(report.levelReports[0].sourceUniverse.levelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
    assertAllSelectorRowsCarrySourceLevelLabels(report);

    const rowsByKey = new Map(report.levelReports[0].rows.map((row) => [row.key, row]));
    assert.equal(rowsByKey.get("山川|さんせん").selectorStatus, "ready_for_editorial_review");
    assert.equal(rowsByKey.get("山川|さんせん").sourceLevelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
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
    assert.match(formatted, /Source level claim unverified/);
    assert.match(formatted, /Fallback\/free-source gate/);
    assert.match(formatted, /Expansion work order/);
    assert.match(formatted, /ready_for_editorial_review/);
});

test("expansion work order makes extra source lane readiness explicit after current selector exhaustion", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const candidateSource = writeFixtureSource(
        dir,
        "n5.tsv",
        [
            "written\treading\tmeaning\tjlpt",
            "水\tみず\twater\tN5",
        ].join("\n")
    );
    const dictionarySource = writeFixtureSource(
        dir,
        "dict.tsv",
        [
            "written\treading\tmeaning",
            "水\tみず\twater",
        ].join("\n")
    );
    const frequencySource = writeFixtureSource(
        dir,
        "priority.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "水\tみず\twater\t100",
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
                fullyExpanded: true,
                reading: {
                    status: "exhausted",
                    activeItems: 0,
                    editorialReviewItems: 0,
                    promoteCuratedExampleItems: 0,
                    deferVariantItems: 12,
                    totalItems: 12,
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
        manifest: buildManifest({ candidateSource, dictionarySource, frequencySource }),
        jlptLevelContract: {
            kanjiLevels: {
                水: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "水|みず": { written: "水", reading: "みず", jlpt: 5 },
            },
            excludedWordLevels: {},
        },
    });

    const levelReport = report.levelReports[0];
    assert.equal(levelReport.summary.selectorStatusCounts.ready_for_editorial_review, 0);
    assert.equal(levelReport.summary.selectorStatusCounts.needs_triage, 0);
    assert.equal(levelReport.summary.selectorStatusCounts.move_candidate, 0);
    assert.equal(levelReport.fallbackSourceGate.active, true);
    assert.equal(levelReport.expansionWorkOrder.status, "extra_source_family");
    assert.equal(levelReport.expansionWorkOrder.extraSourceLaneReady, true);
    assert.match(levelReport.expansionWorkOrder.nextAction, /READY/);
    assert.match(levelReport.expansionWorkOrder.nextAction, /work is not done/i);
    assert.match(levelReport.expansionWorkOrder.nextAction, /Source level claim unverified/);

    const formatted = formatWordCommonExpansionSelectorReport(report);
    assert.match(formatted, /Extra expansion lane/);
    assert.match(formatted, /READY - source input needed/);
    assert.match(formatted, /work is not done/i);
});

test("expansion work order avoids repeated source hunting when no actionable extra source is registered", () => {
    const manifest = {
        sources: {
            "current-n5": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                candidatePolicy: {
                    levels: [5],
                },
            },
        },
    };
    const sourceAccessReport = {
        sources: [
            {
                sourceId: "current-n5",
                status: "in_review",
                sourceKind: "candidate-discovery",
                levels: [5],
                allowedUse: ["candidate-discovery", "level-hint"],
                recommendedAction: "review_source_access_and_pin_input",
            },
            {
                sourceId: "future-textbook",
                status: "registered",
                sourceKind: "textbook-word-list",
                levels: [],
                allowedUse: [],
                recommendedAction: "registered_no_current_source_access",
            },
        ],
    };
    const extraSourceAccessByLevel = buildExtraSourceAccessByLevel({
        sourceAccessReport,
        manifest,
        levels: [5],
    });
    const workOrder = buildExpansionWorkOrder({
        level: 5,
        levelLabel: "N5",
        commonWordQueue: {
            active: true,
            promoteCuratedExampleItems: 0,
            editorialReviewItems: 0,
            deferVariantItems: 0,
        },
        fallbackSourceGate: {
            active: true,
            blockers: [],
        },
        extraSourceAccess: extraSourceAccessByLevel[5],
        summary: {
            selectorStatusCounts: {
                ready_for_editorial_review: 0,
                needs_triage: 0,
                move_candidate: 0,
                blocked_identity: 0,
                blocked_missing_dictionary: 0,
                blocked_missing_commonness: 0,
                triaged_defer: 0,
                triaged_reject: 0,
            },
        },
    });

    assert.equal(extraSourceAccessByLevel[5].actionableExtraSourceCount, 0);
    assert.deepEqual(extraSourceAccessByLevel[5].currentConfiguredSourcePendingIds, ["current-n5"]);
    assert.deepEqual(extraSourceAccessByLevel[5].registeredNoCurrentAccessSourceIds, ["future-textbook"]);
    assert.equal(workOrder.status, "extra_source_family");
    assert.equal(workOrder.extraSourceLaneReady, true);
    assert.equal(workOrder.extraSourceLaneActionable, false);
    assert.equal(workOrder.nextCommand, "");
    assert.match(workOrder.nextAction, /no actionable extra free\/permitted source family/);
    assert.match(workOrder.nextAction, /do not repeat source hunting/);
    assert.match(workOrder.nextAction, /Source level claim unverified/);
});

test("expansion work order surfaces already-reviewed extra source family with explicit extra command", () => {
    const manifest = {
        sources: {
            "current-n4": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                candidatePolicy: {
                    levels: [4],
                },
            },
        },
    };
    const sourceAccessReport = {
        sources: [
            {
                sourceId: "current-n4",
                status: "in_review",
                sourceKind: "candidate-discovery",
                levels: [4],
                allowedUse: ["candidate-discovery", "level-hint"],
                recommendedAction: "review_source_access_and_pin_input",
            },
            {
                sourceId: "tanos-n4-vocab",
                status: "active",
                sourceKind: "candidate-discovery",
                levels: [4],
                allowedUse: ["candidate-discovery", "level-hint"],
                licenseStatus: "approved",
                local: {
                    rowCount: 638,
                },
                reviewedAssignmentCount: 634,
                recommendedAction: "no_action",
            },
        ],
    };
    const extraSourceAccessByLevel = buildExtraSourceAccessByLevel({
        sourceAccessReport,
        manifest,
        levels: [4],
    });
    const workOrder = buildExpansionWorkOrder({
        level: 4,
        levelLabel: "N4",
        commonWordQueue: {
            active: true,
            promoteCuratedExampleItems: 0,
            editorialReviewItems: 0,
            deferVariantItems: 0,
        },
        fallbackSourceGate: {
            active: true,
            blockers: [],
        },
        extraSourceAccess: extraSourceAccessByLevel[4],
        summary: {
            selectorStatusCounts: {
                ready_for_editorial_review: 0,
                needs_triage: 0,
                move_candidate: 0,
                blocked_identity: 0,
                blocked_missing_dictionary: 0,
                blocked_missing_commonness: 0,
                triaged_defer: 0,
                triaged_reject: 0,
            },
        },
    });

    assert.equal(extraSourceAccessByLevel[4].availableReviewedExtraSourceCount, 1);
    assert.deepEqual(extraSourceAccessByLevel[4].availableReviewedExtraSourceIds, ["tanos-n4-vocab"]);
    assert.equal(extraSourceAccessByLevel[4].availableReviewedExtraSourceRowCount, 638);
    assert.equal(extraSourceAccessByLevel[4].availableReviewedExtraSourceAssignmentCount, 634);
    assert.equal(workOrder.status, "extra_source_family");
    assert.equal(workOrder.extraSourceLaneReady, true);
    assert.equal(workOrder.extraSourceLaneActionable, true);
    assert.equal(workOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=4 --source=tanos-n4-vocab --strict --limit=80");
    assert.match(workOrder.nextAction, /already-reviewed extra source family/);
    assert.match(workOrder.nextAction, /Source level claim unverified/);
});

test("extra expansion work order opens dictionary common pool after selected extra family is exhausted", () => {
    const manifest = {
        sources: {
            "current-n5": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                candidatePolicy: {
                    levels: [5],
                },
            },
        },
    };
    const sourceAccessReport = {
        sources: [
            {
                sourceId: "current-n5",
                status: "in_review",
                sourceKind: "candidate-discovery",
                levels: [5],
                allowedUse: ["candidate-discovery", "level-hint"],
                recommendedAction: "review_source_access_and_pin_input",
            },
            {
                sourceId: "jmdict",
                status: "active",
                licenseStatus: "approved",
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                recommendedAction: "no_action",
            },
            {
                sourceId: "jmdict-priority-commonness",
                status: "active",
                licenseStatus: "approved",
                allowedUse: ["frequency-sanity", "usefulness-support"],
                recommendedAction: "no_action",
            },
        ],
    };
    const extraSourceAccessByLevel = buildExtraSourceAccessByLevel({
        sourceAccessReport,
        manifest,
        levels: [5],
    });
    const workOrder = buildExpansionWorkOrder({
        level: 5,
        levelLabel: "N5",
        sourceUniverse: {
            sourceId: "tanos-n5-vocab",
            extraSource: true,
            sourceLaneLabel: SOURCE_LANE_EXTRA_LABEL,
            sourcePoolLabel: SOURCE_LANE_EXTRA_LABEL,
        },
        commonWordQueue: {
            active: true,
            promoteCuratedExampleItems: 0,
            editorialReviewItems: 0,
            deferVariantItems: 0,
        },
        fallbackSourceGate: {
            active: true,
            blockers: [],
        },
        extraSourceAccess: extraSourceAccessByLevel[5],
        summary: {
            selectorStatusCounts: {
                ready_for_editorial_review: 0,
                needs_triage: 0,
                move_candidate: 0,
                blocked_identity: 0,
                blocked_missing_dictionary: 13,
                blocked_missing_commonness: 0,
                triaged_defer: 14,
                triaged_reject: 8,
            },
        },
    });

    assert.equal(extraSourceAccessByLevel[5].dictionaryCommonPoolAvailable, true);
    assert.equal(workOrder.status, "extra_source_family");
    assert.equal(workOrder.extraSourceLaneReady, true);
    assert.equal(workOrder.extraSourceLaneActionable, true);
    assert.equal(workOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --strict --limit=80");
    assert.match(workOrder.nextAction, /DICTIONARY COMMON POOL/);
    assert.match(workOrder.nextAction, /same extra expansion lane/);
    assert.match(workOrder.nextAction, /exclude exact governed\/excluded duplicates and kana-only rows/);
});

test("source override manifest marks selected reviewed source as EXTRA", () => {
    const parsed = parseArgs(["--levels=4", "--source=tanos-n4-vocab", "--strict"]);
    assert.deepEqual(parsed.levels, [4]);
    assert.equal(parsed.source, "tanos-n4-vocab");

    const manifest = {
        sources: {
            "current-n4": {
                status: "active",
                allowedUse: ["candidate-discovery", "level-hint"],
                candidatePolicy: {
                    levels: [4],
                },
            },
        },
    };
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: {
            sources: {
                "tanos-n4-vocab": {
                    name: "Tanos N4",
                    status: "active",
                    sourceKind: "candidate-discovery",
                    sourceType: "jlpt_level_list",
                    url: "https://example.com/tanos-n4",
                    levels: [4],
                    allowedUse: ["candidate-discovery", "level-hint"],
                    licenseStatus: "approved",
                    local: {
                        path: "downloads/tanos-n4-vocab.tsv",
                        format: "tsv",
                        rowCount: 638,
                    },
                    checkedAt: "2026-06-21",
                },
            },
        },
        sourceId: "tanos-n4-vocab",
        levels: [4],
    });

    assert.equal(selectorManifest.sources["current-n4"].status, "inactive");
    assert.equal(selectorManifest.sources["tanos-n4-vocab"].status, "active");
    assert.equal(selectorManifest.sources["tanos-n4-vocab"].extraSourceLane, true);
    assert.deepEqual(selectorManifest.sources["tanos-n4-vocab"].candidatePolicy.levels, [4]);

    const sourceUniverse = buildSourceUniverse({
        sourceId: "tanos-n4-vocab",
        source: selectorManifest.sources["tanos-n4-vocab"],
    });

    assert.equal(sourceUniverse.sourceLaneLabel, SOURCE_LANE_EXTRA_LABEL);
    assert.equal(sourceUniverse.levelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
});

test("common-pool source override is an EXTRA expansion pool backed by pinned JMdict sources", () => {
    assert.equal(normalizeSelectorSourceId("common-pool"), DICTIONARY_COMMON_POOL_SOURCE_ID);
    assert.equal(normalizeSelectorSourceId("jmdict-common-pool"), DICTIONARY_COMMON_POOL_SOURCE_ID);

    const manifest = {
        sources: {
            "current-n5": {
                status: "active",
                allowedUse: ["candidate-discovery", "level-hint"],
                candidatePolicy: {
                    levels: [5],
                },
            },
            jmdict: {
                status: "active",
                origin: {
                    url: "https://example.com/jmdict",
                },
                licenseUse: {
                    status: "approved",
                    license: "CC BY-SA 4.0",
                },
                checkedAt: "2026-06-21",
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                local: {
                    path: "downloads/jmdict-word-verification.tsv",
                    format: "tsv",
                    sha256: "abc",
                    byteSize: 123,
                    rowCount: 5,
                },
            },
            "jmdict-priority-commonness": {
                status: "active",
                origin: {
                    url: "https://example.com/jmdict",
                },
                licenseUse: {
                    status: "approved",
                    license: "CC BY-SA 4.0",
                },
                checkedAt: "2026-06-21",
                allowedUse: ["frequency-sanity", "usefulness-support"],
                local: {
                    path: "downloads/jmdict-word-verification.tsv",
                    format: "tsv",
                    sha256: "abc",
                    byteSize: 123,
                    rowCount: 5,
                },
            },
        },
    };

    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: { sources: {} },
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels: [5],
    });

    const commonPool = selectorManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID];
    assert.equal(selectorManifest.sources["current-n5"].status, "inactive");
    assert.equal(commonPool.status, "active");
    assert.equal(commonPool.extraSourceLane, true);
    assert.equal(commonPool.extraSourcePoolLabel, SOURCE_POOL_DICTIONARY_COMMON_LABEL);
    assert.equal(commonPool.candidatePolicy.requireSourceLevel, false);
    assert.deepEqual(commonPool.candidatePolicy.levels, [5]);
    assert.ok(commonPool.allowedUse.includes("candidate-discovery"));
    assert.ok(commonPool.allowedUse.includes("dictionary-verification"));
    assert.ok(commonPool.allowedUse.includes("frequency-sanity"));
});

test("dictionary common pool filters to common non-duplicate kanji candidates inside the extra lane", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "本屋\tほんや\tbookstore\t100",
            "山川\tさんせん\tmountains and rivers\t120",
            "一月\tいちがつ\tJanuary\t100",
            "大社\tおおやしろ\tIzumo Grand Shrine\t90",
            "かな\tかな\tkana\t100",
            "既存\tきそん\texisting\t100",
            "珍語\tちんご\trare coined word\t",
            "東京\tとうきょう\tTokyo; place name\t100",
            "手紙\tてがみ\tletter\t100",
        ].join("\n")
    );

    const manifest = {
        version: 1,
        checkedAt: "2026-06-21",
        sources: {
            [DICTIONARY_COMMON_POOL_SOURCE_ID]: {
                name: "Fixture dictionary common pool",
                tier: 3,
                status: "active",
                sourceType: "dictionary_common_pool",
                origin: {
                    url: "https://example.com/jmdict",
                    localPath: commonPoolSource.path,
                },
                licenseUse: {
                    status: "approved",
                    license: "CC BY-SA 4.0",
                },
                checkedAt: "2026-06-21",
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
                intendedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
                allowedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
                disallowedUse: ["card-approval", "level-truth"],
                candidatePolicy: {
                    levels: [5],
                    kanjiScope: "known-jlpt",
                    requireSourceLevel: false,
                },
                extraSourceLane: true,
                extraSourcePool: "dictionary_common_pool",
                extraSourcePoolLabel: SOURCE_POOL_DICTIONARY_COMMON_LABEL,
                commonPool: {
                    type: "dictionary_common_pool",
                },
            },
        },
    };

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        manifest,
        jlptLevelContract: {
            kanjiLevels: {
                本: 5,
                屋: 4,
                一: 5,
                月: 5,
                大: 5,
                社: 4,
                山: 5,
                川: 5,
                既: 5,
                存: 5,
                珍: 5,
                語: 5,
                東: 5,
                京: 5,
                手: 4,
                紙: 4,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {
                "既存|きそん": { written: "既存", reading: "きそん", jlpt: 5 },
            },
            excludedWordLevels: {},
        },
    });

    const levelReport = report.levelReports[0];
    const rowsByKey = new Map(levelReport.rows.map((row) => [row.key, row]));

    assert.equal(levelReport.sourceUniverse.sourceLaneLabel, SOURCE_LANE_EXTRA_LABEL);
    assert.equal(levelReport.sourceUniverse.sourcePoolLabel, SOURCE_POOL_DICTIONARY_COMMON_LABEL);
    assert.equal(levelReport.sourceUniverse.rowCount, 4);
    assert.equal(levelReport.sourceUniverse.rawRowCount, 9);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.kanaOnly, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.alreadyGovernedOrExcluded, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.missingCommonness, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.meaningNoise, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.noTargetKanji, 1);
    assert.deepEqual([...rowsByKey.keys()], ["山川|さんせん", "本屋|ほんや", "一月|いちがつ", "大社|おおやしろ"]);

    for (const row of rowsByKey.values()) {
        assert.equal(row.selectorStatus, "needs_triage");
        assert.equal(row.sourceLaneLabel, SOURCE_LANE_EXTRA_LABEL);
        assert.equal(row.sourcePoolLabel, SOURCE_POOL_DICTIONARY_COMMON_LABEL);
        assert.equal(row.sourceLevelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
        assert.equal(row.dictionaryVerified, true);
        assert.equal(row.frequencySupported, true);
        assert.equal(Number.isInteger(row.frequencyRank), true);
    }
    assert.equal(rowsByKey.get("本屋|ほんや").frequencyRank, 100);
    assert.equal(rowsByKey.get("山川|さんせん").frequencyRank, 120);

    const formatted = formatWordCommonExpansionSelectorReport(report);
    assert.match(formatted, /pool DICTIONARY COMMON POOL/);
    assert.match(formatted, /source pool: DICTIONARY COMMON POOL/);
    assert.match(formatted, /commonness rank: 100/);
});

test("selected extra source work order labels triage as EXTRA work", () => {
    const workOrder = buildExpansionWorkOrder({
        level: 4,
        levelLabel: "N4",
        sourceUniverse: {
            sourceId: "tanos-n4-vocab",
            extraSource: true,
            sourceLaneLabel: SOURCE_LANE_EXTRA_LABEL,
        },
        commonWordQueue: {
            active: true,
            promoteCuratedExampleItems: 0,
            editorialReviewItems: 0,
            deferVariantItems: 0,
        },
        fallbackSourceGate: {
            active: false,
            blockers: ["Current new-word selector still has 171 needs-triage row(s)."],
        },
        extraSourceAccess: {
            hasSourceAccessContext: true,
        },
        summary: {
            selectorStatusCounts: {
                ready_for_editorial_review: 0,
                needs_triage: 171,
                move_candidate: 0,
                blocked_identity: 28,
                blocked_missing_dictionary: 2,
                blocked_missing_commonness: 4,
                triaged_defer: 0,
                triaged_reject: 0,
            },
        },
    });

    assert.equal(workOrder.status, "current_selector_triage");
    assert.equal(workOrder.nextAction, "EXTRA source triage: EXTRA source rows still need keep/defer/reject/move decisions before Silver.");
    assert.equal(workOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=4 --source=tanos-n4-vocab --strict --limit=80");
    const extraLane = workOrder.items.find((item) => item.lane === "extra_source_family");
    assert.equal(extraLane.status, "selected_extra_source");
    assert.match(extraLane.reason, /selected source is already the EXTRA source-family preview/);
});

test("expansion work order prioritizes active reading work before extra sources", () => {
    const workOrder = buildExpansionWorkOrder({
        level: 5,
        levelLabel: "N5",
        commonWordQueue: {
            active: false,
            promoteCuratedExampleItems: 2,
            editorialReviewItems: 3,
            deferVariantItems: 4,
        },
        fallbackSourceGate: {
            active: false,
            blockers: ["N5 reading expansion is not exhausted."],
        },
        summary: {
            selectorStatusCounts: {
                ready_for_editorial_review: 0,
                needs_triage: 0,
                move_candidate: 0,
                blocked_identity: 0,
                blocked_missing_dictionary: 0,
                blocked_missing_commonness: 0,
                triaged_defer: 0,
                triaged_reject: 0,
            },
        },
    });

    assert.equal(workOrder.status, "reading_fast_promotions");
    assert.equal(workOrder.activeBlockingLaneCount, 2);
    assert.equal(workOrder.extraSourceLaneReady, false);
    assert.match(workOrder.nextCommand, /deck:words:gap-plan:n5/);
    assert.match(workOrder.nextAction, /Fast\/easy reading work/);
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
    assertAllSelectorRowsCarrySourceLevelLabels(report);
    assert.equal(row.selectorStatus, "move_candidate");
    assert.equal(row.sourceDisposition, "review_candidate");
    assert.equal(row.triageDecision.decision, "move_candidate");
    assert.equal(row.triageDecision.targetLevel, 4);
    assert.equal(row.sourceTriageDecision, null);
});

test("source-level move candidates with target levels do not block the source fallback gate", () => {
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
            5: buildExhaustedReadingSignal(5),
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
                        reason: "This exact source row belongs in the N4 target queue.",
                    },
                },
            },
        },
    });

    const levelReport = report.levelReports[0];
    const row = levelReport.rows.find((candidate) => candidate.key === "手紙|てがみ");
    const moveWorkItem = levelReport.expansionWorkOrder.items.find((item) => item.lane === "move_candidate_routing");

    assert.equal(row.selectorStatus, "move_candidate");
    assert.equal(levelReport.summary.selectorStatusCounts.move_candidate, 1);
    assert.equal(levelReport.summary.sourceMoveCandidateRows, 1);
    assert.equal(levelReport.summary.routedSourceMoveCandidateRows, 1);
    assert.equal(levelReport.summary.unresolvedSourceMoveCandidateRows, 0);
    assert.equal(levelReport.fallbackSourceGate.active, true);
    assert.equal(levelReport.fallbackSourceGate.moveCandidateRows, 0);
    assert.equal(levelReport.fallbackSourceGate.routedSourceMoveCandidateRows, 1);
    assert.equal(moveWorkItem.count, 0);
    assert.equal(moveWorkItem.status, "clear");
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
    assertAllSelectorRowsCarrySourceLevelLabels(report);
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
    assertAllSelectorRowsCarrySourceLevelLabels(report);

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
    const manifest = buildManifest({ candidateSource, dictionarySource, frequencySource });
    manifest.sources["fixture-n5"].extraSourceLane = true;

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
        manifest,
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
    assert.equal(report.levelReports[0].sourceUniverse.sourceLaneLabel, SOURCE_LANE_EXTRA_LABEL);
    assert.equal(report.levelReports[0].sourceUniverse.levelClaimStatus, SOURCE_LEVEL_CLAIM_STATUS);
    assert.equal(report.levelReports[0].sourceUniverse.levelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
    assert.equal(row.sourceLaneLabel, SOURCE_LANE_EXTRA_LABEL);
    assert.equal(row.sourceLevelClaimStatus, SOURCE_LEVEL_CLAIM_STATUS);
    assert.equal(row.sourceLevelClaimLabel, SOURCE_LEVEL_CLAIM_LABEL);
    assert.equal(report.summary.inactiveReadingExpansionLevels, 1);
    assert.equal(row.selectorStatus, "queue_inactive_reading_expansion");
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.ready_for_editorial_review, 0);
    assert.equal(report.levelReports[0].summary.selectorStatusCounts.queue_inactive_reading_expansion, 1);
    assert.equal(report.levelReports[0].fallbackSourceGate.active, false);
    assert.match(report.levelReports[0].fallbackSourceGate.reason, /closed by prior gate blockers/);
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
    assertAllSelectorRowsCarrySourceLevelLabels(report);
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
    assertAllSelectorRowsCarrySourceLevelLabels(report);
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
