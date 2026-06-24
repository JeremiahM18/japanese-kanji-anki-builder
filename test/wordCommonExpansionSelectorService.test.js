const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
    DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT,
    DICTIONARY_COMMON_POOL_SOURCE_ID,
    SOURCE_LANE_CONFIGURED_LABEL,
    SOURCE_LANE_EXTRA_LABEL,
    SOURCE_POOL_DICTIONARY_COMMON_LABEL,
    SOURCE_LEVEL_CLAIM_LABEL,
    SOURCE_LEVEL_CLAIM_STATUS,
    SOURCE_UNIVERSE_WARNING,
    WORD_EXPANSION_TARGET_MINIMUMS,
    WORD_EXPANSION_TARGET_POLICY,
    buildExpansionWorkOrder,
    buildExtraSourceAccessByLevel,
    buildLearnerUtilityScore,
    buildSourceUniverse,
    buildWordCommonExpansionSelectorReport,
    buildWordExpansionTargetProgressForLevel,
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
    assert.match(formatted, /Deck target progress/);
    assert.match(formatted, /\| N5 \| 1 \| 800 \| 799 \| below target floor by 799 \| useful minimum, not a hard cap or quota \|/);
    assert.match(formatted, /ready_for_editorial_review/);
});

test("word expansion target progress counts unique governed words without changing queue gates", () => {
    const progress = buildWordExpansionTargetProgressForLevel({
        level: 5,
        jlptWordLevelContract: {
            wordLevels: {
                "水|みず": { written: "水", reading: "みず", jlpt: 5 },
                "水|みず#duplicate-source-shape": { written: "水", reading: "みず", jlpt: 5 },
                "本|ほん": { written: "本", reading: "ほん", jlpt: 5 },
                "勉強|べんきょう": { written: "勉強", reading: "べんきょう", jlpt: 3 },
            },
            excludedWordLevels: {
                "火|ひ": { written: "火", reading: "ひ", jlpt: 5 },
            },
        },
    });

    assert.equal(WORD_EXPANSION_TARGET_MINIMUMS[5], 800);
    assert.equal(WORD_EXPANSION_TARGET_POLICY, "useful_minimum_not_hard_limit");
    assert.equal(progress.currentUniqueGovernedWords, 2);
    assert.equal(progress.targetMinimum, 800);
    assert.equal(progress.remainingToTarget, 798);
    assert.equal(progress.targetMet, false);
    assert.equal(progress.activationBoundary, "after_reading_expansion_exhausted");
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
    assert.equal(workOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --queue=discovery --frequency-source=tubelex-ja-frequency --strict --limit=80");
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
    assert.equal(commonPool.commonPool.qualityMode, "editorial");
    assert.equal(commonPool.commonPool.queueMode, "auto");
    assert.equal(commonPool.commonPool.editorialQueueLimit, DICTIONARY_COMMON_POOL_DEFAULT_EDITORIAL_QUEUE_LIMIT);
    assert.equal(commonPool.commonPool.outsideJlptSupportPolicy, "label_not_deprioritize");
});

test("common-pool source override accepts explicit raw audit mode", () => {
    const parsed = parseArgs([
        "--levels=5",
        "--source=common-pool",
        "--common-pool-mode=raw",
        "--common-pool-limit=25",
        "--queue=all",
        "--frequency-source=tubelex-ja-frequency",
    ]);
    assert.equal(parsed.commonPoolMode, "raw");
    assert.equal(parsed.commonPoolLimit, 25);
    assert.equal(parsed.queueMode, "all");
    assert.equal(parsed.frequencySource, "tubelex-ja-frequency");

    const manifest = {
        sources: {
            jmdict: {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["dictionary-verification"],
                local: {
                    path: "downloads/jmdict-word-verification.tsv",
                    format: "tsv",
                },
            },
            "jmdict-priority-commonness": {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["frequency-sanity"],
                local: {
                    path: "downloads/jmdict-word-verification.tsv",
                    format: "tsv",
                },
            },
        },
    };
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: { sources: {} },
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels: [5],
        commonPoolMode: parsed.commonPoolMode,
        commonPoolLimit: parsed.commonPoolLimit,
        frequencySource: parsed.frequencySource,
        queueMode: parsed.queueMode,
    });

    assert.equal(selectorManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.qualityMode, "raw");
    assert.equal(selectorManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.queueMode, "all");
    assert.equal(selectorManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.editorialQueueLimit, 25);
    assert.deepEqual(selectorManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.frequencySourceIds, ["tubelex-ja-frequency"]);
});

test("dictionary common-pool raw mode is audit-only, not an actionable triage queue", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "本屋\tほんや\tbookstore\t100",
            "本屋\tもとや\tfamily name\t120",
            "山川\tさんせん\tmountains and rivers\t130",
        ].join("\n")
    );
    const manifest = {
        sources: {
            jmdict: {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
            },
            "jmdict-priority-commonness": {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["frequency-sanity", "usefulness-support"],
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
            },
        },
    };
    const selectorManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: { sources: {} },
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels: [5],
        commonPoolMode: "raw",
    });

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        manifest: selectorManifest,
        placementMode: "vocabulary-level",
        limit: 5,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                本: 5,
                屋: 5,
                山: 5,
                川: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
    });
    const levelReport = report.levelReports[0];
    const workItems = new Map(levelReport.expansionWorkOrder.items.map((item) => [item.lane, item]));

    assert.equal(levelReport.fallbackSourceGate.status, "raw_mode_audit_only");
    assert.equal(levelReport.fallbackSourceGate.auditOnly, true);
    assert.equal(workItems.get("dictionary_common_pool_raw_audit").status, "audit_only");
    assert.equal(workItems.get("dictionary_common_pool_raw_audit").blocksExtraLane, false);
    assert.equal(workItems.get("current_selector_ready").count, 0);
    assert.equal(workItems.get("current_selector_triage").count, 0);
    assert.equal(levelReport.expansionWorkOrder.nextCommand.includes("--common-pool-mode=raw"), false);
    assert.match(
        formatWordCommonExpansionSelectorReport(report),
        /Raw dictionary common-pool mode is an audit denominator, not an actionable review lane/
    );
});

test("dictionary common pool uses learner-value buckets to keep redundant and narrow rows audit-only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "本屋\tほんや\tbookstore\t100",
            "本社\tほんしゃ\thead office\t101",
            "大社\tおおやしろ\tIzumo Grand Shrine\t102",
            "本甲\tほんこう\tmain item alpha\t103",
            "本乙\tほんおつ\tmain item beta\t104",
            "本丙\tほんへい\tmain item gamma\t105",
            "本丁\tほんてい\tmain item delta\t106",
            "本戊\tほんぼ\tmain item epsilon\t107",
            "本己\tほんき\tmain item zeta\t108",
            "本庚\tほんこう\tmain item eta\t109",
            "本辛\tほんしん\tmain item theta\t110",
            "本壬\tほんじん\tmain item iota\t111",
            "本癸\tほんき\tmain item kappa\t112",
        ].join("\n")
    );
    const manifest = {
        sources: {
            jmdict: {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["dictionary-verification", "reading-verification", "meaning-verification"],
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
            },
            "jmdict-priority-commonness": {
                status: "active",
                origin: { url: "https://example.com/jmdict" },
                licenseUse: { status: "approved", license: "CC BY-SA 4.0" },
                checkedAt: "2026-06-21",
                allowedUse: ["frequency-sanity", "usefulness-support"],
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
            },
        },
    };
    const baseArgs = {
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                本: 5,
                屋: 5,
                社: 4,
                大: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
    };
    const editorialManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: { sources: {} },
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels: [5],
    });
    const rawManifest = buildSelectorManifestForSource({
        manifest,
        wordSourceEvidence: { sources: {} },
        sourceId: DICTIONARY_COMMON_POOL_COMMAND_SOURCE,
        levels: [5],
        commonPoolMode: "raw",
    });

    const editorialReport = buildWordCommonExpansionSelectorReport({
        ...baseArgs,
        manifest: editorialManifest,
    });
    const rawReport = buildWordCommonExpansionSelectorReport({
        ...baseArgs,
        manifest: rawManifest,
    });
    const editorialLevel = editorialReport.levelReports[0];
    const rawLevel = rawReport.levelReports[0];

    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.eligibleRowsBeforeEditorialFilter, 13);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.learnerValueBucketCounts.domain_narrow, 1);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.learnerValueBucketCounts.redundant_family_member > 0, true);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.auditOnlyRowsBeforeEditorialFilter > 0, true);
    assert.equal(editorialLevel.rows.some((row) => row.learnerValueAuditOnly), false);
    assert.equal(rawLevel.rows.some((row) => row.learnerValueBucket === "domain_narrow"), true);
    assert.equal(rawLevel.rows.some((row) => row.learnerValueBucket === "redundant_family_member"), true);
    assert.match(formatWordCommonExpansionSelectorReport(editorialReport), /Learner-value buckets:/);
    assert.match(formatWordCommonExpansionSelectorReport(rawReport), /learner-value bucket: Redundant family member; audit-only by default/);
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
            "本棚\tほんだな\tbookshelf\t95",
            "本社\tほんしゃ\thead office; main office\t95",
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
                本: 5,
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
    assert.equal(levelReport.sourceUniverse.rowCount, 5);
    assert.equal(levelReport.sourceUniverse.rawRowCount, 11);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.qualityMode, "editorial");
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.eligibleRowsBeforeEditorialFilter, 6);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.editorialQueueRows, 5);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.deprioritizedByEditorialQueueLimit, 0);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.auditOnlyRowsBeforeEditorialFilter, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.auditOnlyRowsExcludedFromEditorialQueue, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.kanaOnly, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.alreadyGovernedOrExcluded, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.missingCommonness, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.meaningNoise, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.noTargetKanji, 1);
    assert.deepEqual(
        [...rowsByKey.keys()].sort(),
        ["一月|いちがつ", "山川|さんせん", "本屋|ほんや", "本棚|ほんだな", "本社|ほんしゃ"].sort()
    );

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
    assert.deepEqual(rowsByKey.get("本棚|ほんだな").supportLabelNeeds, ["outside-JLPT support kanji 棚"]);
    assert.deepEqual(rowsByKey.get("本社|ほんしゃ").supportLabelNeeds, ["harder support kanji 社=N4"]);

    const formatted = formatWordCommonExpansionSelectorReport(report);
    assert.match(formatted, /pool DICTIONARY COMMON POOL/);
    assert.match(formatted, /pool eligible 6/);
    assert.match(formatted, /pool queue 5/);
    assert.match(formatted, /source pool: DICTIONARY COMMON POOL/);
    assert.match(formatted, /support label needs: outside-JLPT support kanji 棚/);
    assert.match(formatted, /commonness rank: 100/);
});

test("dictionary common pool queue modes separate discovery, Silver-prep, and audit history before the cap", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "本店\tほんてん\tmain store\t100",
            "山川\tさんせん\tmountains and rivers\t101",
            "学校\tがっこう\tschool\t102",
            "学生\tがくせい\tstudent\t103",
            "本屋\tほんや\tbookstore\t500",
            "水中\tすいちゅう\tin the water\t600",
        ].join("\n")
    );
    const baseManifest = {
        version: 1,
        checkedAt: "2026-06-24",
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
                checkedAt: "2026-06-24",
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
                allowedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
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
                    qualityMode: "editorial",
                    editorialQueueLimit: 2,
                },
            },
        },
    };
    const commonInputs = {
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                本: 5,
                店: 4,
                山: 5,
                川: 5,
                学: 5,
                校: 5,
                生: 5,
                屋: 4,
                水: 5,
                中: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
        triageDecisionsByLevelSource: {
            N5: {
                [DICTIONARY_COMMON_POOL_SOURCE_ID]: {
                    "本店|ほんてん": {
                        decision: "keep_candidate",
                        priority: "high",
                        reason: "useful store-family review row",
                    },
                    "山川|さんせん": {
                        decision: "reject_candidate",
                        reason: "not useful enough for this level deck",
                    },
                    "学校|がっこう": {
                        decision: "defer_candidate",
                        reason: "needs better media/example policy before promotion",
                    },
                    "学生|がくせい": {
                        decision: "move_candidate",
                        targetLevel: 4,
                        reason: "belongs in the target N4 word JSON for this route",
                    },
                },
            },
        },
    };

    const discoveryManifest = JSON.parse(JSON.stringify(baseManifest));
    discoveryManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.queueMode = "discovery";
    const discoveryReport = buildWordCommonExpansionSelectorReport({
        ...commonInputs,
        manifest: discoveryManifest,
    });
    const discoveryLevel = discoveryReport.levelReports[0];
    assert.deepEqual(
        discoveryLevel.rows.map((row) => row.key).sort(),
        ["本屋|ほんや", "水中|すいちゅう"].sort()
    );
    assert.equal(discoveryLevel.sourceUniverse.commonPoolSummary.queueMode, "discovery");
    assert.equal(discoveryLevel.sourceUniverse.commonPoolSummary.reviewableRowsBeforeEditorialFilter, 6);
    assert.equal(discoveryLevel.sourceUniverse.commonPoolSummary.queueModeIncludedRowsBeforeLimit, 2);
    assert.equal(discoveryLevel.sourceUniverse.commonPoolSummary.queueModeExcludedRowsBeforeLimit, 4);
    assert.deepEqual(discoveryLevel.sourceUniverse.commonPoolSummary.triageDecisionCountsBeforeQueueFilter, {
        untriaged: 2,
        keep_candidate: 1,
        move_candidate: 1,
        defer_candidate: 1,
        reject_candidate: 1,
    });
    assert.deepEqual(discoveryLevel.sourceUniverse.commonPoolSummary.queueModeExcludedDecisionCounts, {
        untriaged: 0,
        keep_candidate: 1,
        move_candidate: 1,
        defer_candidate: 1,
        reject_candidate: 1,
    });
    assert.equal(discoveryLevel.sourceUniverse.commonPoolSummary.deprioritizedByEditorialQueueLimit, 0);
    assert.equal(discoveryLevel.rows.every((row) => row.selectorStatus === "needs_triage"), true);
    assert.equal(discoveryLevel.expansionWorkOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --queue=discovery --frequency-source=tubelex-ja-frequency --strict --limit=80");
    assert.match(formatWordCommonExpansionSelectorReport(discoveryReport), /Common-pool operational queue:/);
    assert.match(formatWordCommonExpansionSelectorReport(discoveryReport), /history stays audit-visible; active queue filters before cap/);

    const silverManifest = JSON.parse(JSON.stringify(baseManifest));
    silverManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.queueMode = "silver";
    const silverReport = buildWordCommonExpansionSelectorReport({
        ...commonInputs,
        manifest: silverManifest,
    });
    const silverLevel = silverReport.levelReports[0];
    assert.deepEqual(silverLevel.rows.map((row) => row.key), ["本店|ほんてん"]);
    assert.equal(silverLevel.rows[0].selectorStatus, "ready_for_editorial_review");
    assert.equal(silverLevel.sourceUniverse.commonPoolSummary.queueMode, "silver");
    assert.equal(silverLevel.sourceUniverse.commonPoolSummary.queueModeIncludedRowsBeforeLimit, 1);
    assert.equal(silverLevel.sourceUniverse.commonPoolSummary.queueModeExcludedRowsBeforeLimit, 5);
    assert.equal(silverLevel.expansionWorkOrder.nextCommand, "npm run deck:words:vocab-expansion -- --levels=5 --source=common-pool --queue=silver --frequency-source=tubelex-ja-frequency --strict --limit=80");

    const auditManifest = JSON.parse(JSON.stringify(baseManifest));
    auditManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.queueMode = "all";
    const auditReport = buildWordCommonExpansionSelectorReport({
        ...commonInputs,
        manifest: auditManifest,
    });
    const auditLevel = auditReport.levelReports[0];
    assert.equal(auditLevel.sourceUniverse.commonPoolSummary.queueMode, "all");
    assert.equal(auditLevel.sourceUniverse.commonPoolSummary.queueModeIncludedRowsBeforeLimit, 6);
    assert.equal(auditLevel.sourceUniverse.commonPoolSummary.queueModeExcludedRowsBeforeLimit, 0);
    assert.equal(auditLevel.rows.length, 2);
});

test("dictionary common pool can use TubeLex support without making it level truth", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "本屋\tほんや\tbookstore\t",
            "野\tの\tfield\t",
            "山川\tさんせん\tmountains and rivers\t100",
        ].join("\n")
    );
    const tubelexSource = writeFixtureSource(
        dir,
        "tubelex.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank\ttubelexRank\ttubelexCount\ttubelexVideoCount\ttubelexChannelCount\ttubelexDispersionScore\ttubelexCategoryConcentration\ttubelexMatchStatus\ttubelexFrequencyBand\tsource\tnotes",
            "本屋\tほんや\tbookstore\t300\t300\t5000\t1200\t300\t80\t0.3\texact_written\tgood\ttubelex-ja-frequency\tTubeLex support only; not level truth",
            "山川\tさんせん\tmountains and rivers\t2500\t2500\t1900\t800\t180\t70\t0.4\texact_written\tborderline\ttubelex-ja-frequency\tTubeLex support only; not level truth",
            "野\tの\tfield\t1\t1\t8806854\t99932\t24927\t100\t0.1848\tambiguous_written\tpoor\ttubelex-ja-frequency\tTubeLex support only; not reading proof",
        ].join("\n")
    );

    const manifest = {
        version: 1,
        checkedAt: "2026-06-24",
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
                checkedAt: "2026-06-24",
                local: {
                    path: commonPoolSource.path,
                    format: "tsv",
                    byteSize: commonPoolSource.byteSize,
                    rowCount: commonPoolSource.rowCount,
                    columns: ["written", "reading", "meaning", "frequencyRank"],
                },
                allowedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
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
                    frequencySourceIds: ["tubelex-ja-frequency"],
                },
            },
            "tubelex-ja-frequency": {
                name: "TubeLex fixture",
                tier: 3,
                status: "active",
                sourceType: "corpus_frequency",
                origin: {
                    url: "https://example.com/tubelex",
                    localPath: tubelexSource.path,
                },
                licenseUse: {
                    status: "approved",
                    license: "BSD-3-Clause",
                },
                checkedAt: "2026-06-24",
                local: {
                    path: tubelexSource.path,
                    format: "tsv",
                    byteSize: tubelexSource.byteSize,
                    rowCount: tubelexSource.rowCount,
                    columns: [
                        "written",
                        "reading",
                        "meaning",
                        "frequencyRank",
                        "tubelexRank",
                        "tubelexCount",
                        "tubelexVideoCount",
                        "tubelexChannelCount",
                        "tubelexDispersionScore",
                        "tubelexCategoryConcentration",
                        "tubelexMatchStatus",
                        "tubelexFrequencyBand",
                        "source",
                        "notes",
                    ],
                },
                allowedUse: ["frequency-sanity", "usefulness-support"],
                disallowedUse: ["candidate-discovery", "level-truth", "card-approval"],
            },
        },
    };

    const selectorInputs = {
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                本: 5,
                屋: 5,
                野: 5,
                山: 5,
                川: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
    };
    const report = buildWordCommonExpansionSelectorReport({
        ...selectorInputs,
        manifest,
    });
    const levelReport = report.levelReports[0];
    const rowsByKey = new Map(levelReport.rows.map((row) => [row.key, row]));

    assert.equal(levelReport.sourceUniverse.commonPoolSummary.frequencySupportMatchedRows, 3);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.frequencyBandCounts.good, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.frequencyBandCounts.borderline, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.frequencyBandCounts.poor, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.missingCommonness, 0);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.learnerValueBucketCounts.raw_audit_low_fit, 1);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.auditOnlyRowsBeforeEditorialFilter, 1);
    assert.equal(rowsByKey.has("野|の"), false);
    assert.equal(rowsByKey.get("本屋|ほんや").frequencyRankSource, "tubelex-ja-frequency");
    assert.equal(rowsByKey.get("本屋|ほんや").frequencyBand, "good");
    assert.equal(rowsByKey.get("本屋|ほんや").frequencyMatchStatus, "exact_written");
    const mixedJmdictAndTubelexRow = rowsByKey.get("山川|さんせん");
    const tubelexEvidence = mixedJmdictAndTubelexRow.frequencyEvidence.sources.filter(
        (evidence) => evidence.source === "tubelex-ja-frequency"
    );
    assert.equal(mixedJmdictAndTubelexRow.frequencyRank, 100);
    assert.equal(mixedJmdictAndTubelexRow.frequencyRankSource, "dictionary-common-pool");
    assert.equal(tubelexEvidence.length, 1);
    assert.equal(tubelexEvidence[0].frequencyRank, 2500);
    assert.equal(tubelexEvidence[0].tubelexRank, 2500);
    assert.equal(levelReport.summary.discoveryYieldSummary.frequencyBandCounts.good, 1);
    assert.match(formatWordCommonExpansionSelectorReport(report), /frequency support tubelex-ja-frequency/);
    assert.match(formatWordCommonExpansionSelectorReport(report), /frequency evidence: tubelex-ja-frequency; band good; match exact_written/);
    assert.match(formatWordCommonExpansionSelectorReport(report), /Discovery yield:/);

    const rawManifest = JSON.parse(JSON.stringify(manifest));
    rawManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.qualityMode = "raw";
    const rawReport = buildWordCommonExpansionSelectorReport({
        ...selectorInputs,
        manifest: rawManifest,
    });
    const rawRowsByKey = new Map(rawReport.levelReports[0].rows.map((row) => [row.key, row]));
    assert.equal(rawRowsByKey.get("野|の").frequencyBand, "poor");
    assert.equal(rawRowsByKey.get("野|の").frequencyMatchStatus, "ambiguous_written");
    assert.equal(rawRowsByKey.get("野|の").learnerValueBucket, "raw_audit_low_fit");
});

test("dictionary common pool editorial mode caps review queue without penalizing outside support", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "一月\tいちがつ\tJanuary\t90",
            "大社\tおおやしろ\tIzumo Grand Shrine\t90",
            "本棚\tほんだな\tbookshelf\t95",
            "本社\tほんしゃ\thead office; main office\t96",
            "山川\tさんせん\tmountains and rivers\t97",
        ].join("\n")
    );
    const baseManifest = {
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
                allowedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
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
                    qualityMode: "editorial",
                    editorialQueueLimit: 3,
                },
            },
        },
    };

    const commonInputs = {
        levels: [5],
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                一: 5,
                月: 5,
                大: 5,
                社: 4,
                本: 5,
                山: 5,
                川: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
    };

    const editorialReport = buildWordCommonExpansionSelectorReport({
        ...commonInputs,
        manifest: baseManifest,
    });
    const editorialLevel = editorialReport.levelReports[0];
    const editorialKeys = editorialLevel.rows.map((row) => row.key);
    assert.deepEqual(editorialKeys, ["本棚|ほんだな", "本社|ほんしゃ", "山川|さんせん"]);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.eligibleRowsBeforeEditorialFilter, 5);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.editorialQueueRows, 3);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.deprioritizedByEditorialQueueLimit, 1);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.outsideJlptSupportRows, 1);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.outsideJlptSupportRowsInQueue, 1);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.harderSupportKanjiRows, 2);
    assert.equal(editorialLevel.sourceUniverse.commonPoolSummary.harderSupportKanjiRowsInQueue, 1);
    assert.deepEqual(editorialLevel.rows[0].supportLabelNeeds, ["outside-JLPT support kanji 棚"]);

    const rawManifest = JSON.parse(JSON.stringify(baseManifest));
    rawManifest.sources[DICTIONARY_COMMON_POOL_SOURCE_ID].commonPool.qualityMode = "raw";
    const rawReport = buildWordCommonExpansionSelectorReport({
        ...commonInputs,
        manifest: rawManifest,
    });
    assert.equal(rawReport.levelReports[0].summary.selectedRows, 5);
    assert.equal(rawReport.levelReports[0].sourceUniverse.commonPoolSummary.qualityMode, "raw");
    assert.equal(rawReport.levelReports[0].sourceUniverse.commonPoolSummary.deprioritizedByEditorialQueueLimit, 0);
});

test("dictionary common pool shortlist uses transparent learner utility before the queue cap", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "word-common-expansion-"));
    const commonPoolSource = writeFixtureSource(
        dir,
        "jmdict.tsv",
        [
            "written\treading\tmeaning\tfrequencyRank",
            "一月\tいちがつ\tJanuary\t100",
            "大社\tおおやしろ\tIzumo Grand Shrine\t100",
            "本店\tほんてん\tmain store\t100",
            "山川\tさんせん\tmountains and rivers\t100",
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
                allowedUse: [
                    "candidate-discovery",
                    "dictionary-verification",
                    "frequency-sanity",
                    "usefulness-support",
                ],
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
                    qualityMode: "editorial",
                    editorialQueueLimit: 2,
                },
            },
        },
    };

    const report = buildWordCommonExpansionSelectorReport({
        levels: [5],
        manifest,
        placementMode: "vocabulary-level",
        limit: 20,
        enforceReadingExpansionGate: true,
        readingExpansionSignalsByLevel: {
            5: buildExhaustedReadingSignal(5),
        },
        jlptLevelContract: {
            kanjiLevels: {
                一: 5,
                月: 5,
                大: 5,
                社: 4,
                本: 5,
                店: 4,
                山: 5,
                川: 5,
            },
        },
        jlptWordLevelContract: {
            wordLevels: {},
            excludedWordLevels: {},
        },
    });

    const levelReport = report.levelReports[0];
    const selectedKeys = levelReport.rows.map((row) => row.key);
    assert.deepEqual(selectedKeys, ["本店|ほんてん", "山川|さんせん"]);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.eligibleRowsBeforeEditorialFilter, 4);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.editorialQueueRows, 2);
    assert.equal(levelReport.sourceUniverse.commonPoolSummary.deprioritizedByEditorialQueueLimit, 1);
    assert.equal(levelReport.summary.learnerUtility.scoredRows, 2);
    assert.equal(levelReport.rows[0].learnerUtility.policy, "review_ordering_signal_not_card_approval");
    assert.equal(levelReport.rows[0].learnerUtility.components.everydayUsefulness.reason, "highest JMdict commonness tier (100)");
    assert.match(formatWordCommonExpansionSelectorReport(report), /learner utility: \d+\/100/);
});

test("learner utility score reports component reasons and penalties without approving cards", () => {
    const utility = buildLearnerUtilityScore({
        written: "一月",
        reading: "いちがつ",
        meaning: "January",
        frequencyRank: 100,
        targetLevel: 5,
        targetKanji: ["一", "月"],
        constituentKanji: ["一", "月"],
        kanjiLevels: [{ kanji: "一", level: 5 }, { kanji: "月", level: 5 }],
        sourcePool: "dictionary_common_pool",
        dictionaryVerified: true,
        frequencySupported: true,
        cleanIdentity: true,
    });

    assert.equal(utility.max, 100);
    assert.equal(utility.policy, "review_ordering_signal_not_card_approval");
    assert.equal(utility.components.targetKanjiReinforcement.score, 19);
    assert.equal(
        utility.penalties.some((penalty) => penalty.includes("numeric-expression written form")),
        true,
    );
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
