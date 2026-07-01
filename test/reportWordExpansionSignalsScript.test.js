const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildEnhancementSignalFromCandidateReport,
    buildPlacementSignalFromAnchorAuditReport,
    buildReadingSignalFromCompletionReport,
    buildSourceFileIntegrity,
    formatWordExpansionSignalReport,
    loadExpansionSignalSources,
    parseArgs,
    validateExpansionSourceIntegrity,
} = require("../scripts/reportWordExpansionSignals");

test("parseArgs supports word expansion signal options", () => {
    assert.deepEqual(parseArgs([
        "--levels=5,4",
        "--signal-sources=templates/signals.json",
        "--strict",
        "--json",
    ]), {
        json: true,
        levels: [5, 4],
        signalSources: "templates/signals.json",
        strict: true,
        unknownArgs: [],
    });
});

test("reading signal is exhausted only when active reading triage is cleared", () => {
    const exhausted = buildReadingSignalFromCompletionReport({
        level: 5,
        triage: {
            editorialReviewItems: 0,
            promoteCuratedExampleItems: 0,
            deferVariantItems: 12,
            totalItems: 12,
        },
        readingCoverage: {
            coveredReadings: 233,
            totalReadings: 344,
        },
        readiness: {
            readingCoveragePercent: 67.7,
        },
        coverageScope: {
            label: "N5",
        },
    });

    assert.equal(exhausted.status, "exhausted");
    assert.equal(exhausted.activeItems, 0);
    assert.equal(exhausted.coverage.coveragePercent, 67.7);

    const active = buildReadingSignalFromCompletionReport({
        level: 4,
        triage: {
            editorialReviewItems: 1,
            promoteCuratedExampleItems: 2,
            deferVariantItems: 9,
            totalItems: 12,
        },
        readingCoverage: {
            coveredReadings: 485,
            totalReadings: 651,
        },
        readiness: {
            readingCoveragePercent: 74.5,
        },
        coverageScope: {
            label: "N4-N5",
        },
    });

    assert.equal(active.status, "active");
    assert.equal(active.activeItems, 3);
});

test("enhancement signal separates keep, untriaged, and exhausted source candidates", () => {
    const exhausted = buildEnhancementSignalFromCandidateReport({
        sourceLabel: "fixture",
        summary: {
            reviewCandidateRows: 3,
            triagedCandidateRows: 3,
            untriagedCandidateRows: 0,
            triageDecisions: {
                move_candidate: 1,
                defer_candidate: 2,
            },
        },
    });

    assert.equal(exhausted.status, "exhausted");
    assert.equal(exhausted.keepCandidates, 0);
    assert.equal(exhausted.moveCandidates, 1);
    assert.equal(exhausted.untriagedCandidateRows, 0);
    assert.match(exhausted.reason, /move candidates are tracked for target-level placement/);

    const crossLevelOnly = buildEnhancementSignalFromCandidateReport({
        sourceLabel: "fixture",
        summary: {
            reviewCandidateRows: 0,
            triagedCandidateRows: 0,
            untriagedCandidateRows: 0,
            crossLevelRoutingRows: 3,
            triagedCrossLevelRoutingRows: 1,
            untriagedCrossLevelRoutingRows: 2,
            crossLevelRoutingTriageDecisions: {
                move_candidate: 1,
                untriaged: 2,
            },
            triageDecisions: {},
        },
    });

    assert.equal(crossLevelOnly.status, "exhausted");
    assert.equal(crossLevelOnly.reviewCandidateRows, 0);
    assert.equal(crossLevelOnly.crossLevelRoutingRows, 3);
    assert.equal(crossLevelOnly.crossLevelMoveCandidates, 1);
    assert.equal(crossLevelOnly.untriagedCrossLevelRoutingRows, 2);
    assert.match(crossLevelOnly.reason, /cross-level move candidates are tracked for target-level placement/);
    assert.match(crossLevelOnly.reason, /Untriaged cross-level routing rows remain advisory backlog/);

    const active = buildEnhancementSignalFromCandidateReport({
        sourceLabel: "fixture",
        summary: {
            reviewCandidateRows: 2,
            triagedCandidateRows: 2,
            untriagedCandidateRows: 0,
            triageDecisions: {
                keep_candidate: 1,
                defer_candidate: 1,
            },
        },
    });

    assert.equal(active.status, "active");
    assert.equal(active.keepCandidates, 1);

    const needsTriage = buildEnhancementSignalFromCandidateReport({
        sourceLabel: "fixture",
        summary: {
            reviewCandidateRows: 2,
            triagedCandidateRows: 1,
            untriagedCandidateRows: 1,
            triageDecisions: {
                keep_candidate: 1,
            },
        },
    });

    assert.equal(needsTriage.status, "needs_triage");
    assert.equal(needsTriage.untriagedCandidateRows, 1);
});

test("placement signal blocks unresolved word-level placement issues", () => {
    const blocked = buildPlacementSignalFromAnchorAuditReport({
        checked: 12,
        violationCount: 2,
        byPlacementStatus: {
            too_easy_for_kanji: 2,
            later_missing_learner_fit_reason: 0,
            no_known_jlpt_kanji: 0,
            invalid_deck_level: 0,
        },
    });

    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.violationCount, 2);
    assert.equal(blocked.tooEasyForKanji, 2);
    assert.match(blocked.reason, /placement blockers remain/);
    assert.match(blocked.blockers[0], /without a current-level kanji anchor/);

    const resolved = buildPlacementSignalFromAnchorAuditReport({
        checked: 12,
        violationCount: 0,
        byPlacementStatus: {
            too_easy_for_kanji: 0,
            later_missing_learner_fit_reason: 0,
            no_known_jlpt_kanji: 0,
            invalid_deck_level: 0,
        },
    });

    assert.equal(resolved.status, "resolved");
    assert.equal(resolved.blockers.length, 0);
});

test("enhancement source integrity pins ignored local source files", () => {
    const sourceBuffer = Buffer.from("written\treading\n本棚\tほんだな\n", "utf8");
    const integrity = buildSourceFileIntegrity({
        sourceBuffer,
        sourceRows: [{ written: "本棚", reading: "ほんだな" }],
    });

    assert.equal(integrity.sha256, "5a5cae6268593a6a5babca9a13d74b9c4e0cf9ca7739447665bb1b124ebcd1ac");
    assert.equal(integrity.byteSize, sourceBuffer.length);
    assert.equal(integrity.rowCount, 1);

    assert.deepEqual(validateExpansionSourceIntegrity({
        sha256: integrity.sha256.toUpperCase(),
        byteSize: integrity.byteSize,
        rowCount: integrity.rowCount,
    }, integrity), []);

    const blockers = validateExpansionSourceIntegrity({
        sha256: "0000",
        byteSize: integrity.byteSize + 1,
        rowCount: integrity.rowCount + 1,
    }, integrity);
    assert.equal(blockers.length, 3);
    assert.match(blockers[0], /sha256 mismatch/);
    assert.match(blockers[1], /byte size mismatch/);
    assert.match(blockers[2], /row count mismatch/);
});

test("tracked expansion signal sources include the active N3 candidate lane", () => {
    const sourceConfig = loadExpansionSignalSources();
    const n3 = sourceConfig.levels.N3;

    assert.equal(n3.sourceLabel, "tanos-n3-vocab");
    assert.equal(n3.sourcePath, "downloads/tanos-n3-vocab.tsv");
    assert.equal(n3.kanjiScope, "known-jlpt");
    assert.equal(n3.requireSourceLevel, true);
    assert.equal(n3.rowCount, 1841);
    assert.equal(n3.sha256, "2539f7e2d4090533d5c902abddac4b9a7967319eef7a5cd0c7c6e0c716ea624e");
});

test("tracked expansion signal sources include the active N2 candidate lane", () => {
    const sourceConfig = loadExpansionSignalSources();
    const n2 = sourceConfig.levels.N2;

    assert.equal(n2.sourceLabel, "tanos-n2-vocab");
    assert.equal(n2.sourcePath, "downloads/tanos-n2-vocab.tsv");
    assert.equal(n2.kanjiScope, "known-jlpt");
    assert.equal(n2.requireSourceLevel, true);
    assert.equal(n2.rowCount, 1835);
    assert.equal(n2.sha256, "2022d72b7a303205a0a5541e1d921f943840731a8897f7af6812e1b6a0b4e86b");
});

test("tracked expansion signal sources include the active N1 candidate lane", () => {
    const sourceConfig = loadExpansionSignalSources();
    const n1 = sourceConfig.levels.N1;

    assert.equal(n1.sourceLabel, "tanos-n1-vocab");
    assert.equal(n1.sourcePath, "downloads/tanos-n1-vocab.tsv");
    assert.equal(n1.kanjiScope, "known-jlpt");
    assert.equal(n1.requireSourceLevel, true);
    assert.equal(n1.rowCount, 3494);
    assert.equal(n1.sha256, "d9ab4bd35b9ca149ffbf1377472c982eb04c4156e60ead869303472341810c2e");
});

test("formatted expansion signal report does not overclaim release readiness", () => {
    const text = formatWordExpansionSignalReport({
        signals: [{
            levelLabel: "N5",
            fullyExpanded: true,
            reading: {
                status: "exhausted",
                activeItems: 0,
                deferVariantItems: 12,
                coverage: {
                    coveredReadings: 233,
                    totalReadings: 344,
                },
                blockers: [],
            },
            enhancement: {
                status: "exhausted",
                keepCandidates: 0,
                moveCandidates: 0,
                untriagedCandidateRows: 0,
                crossLevelRoutingRows: 0,
                deferCandidates: 17,
                rejectCandidates: 6,
                blockers: [],
            },
            placement: {
                status: "resolved",
                checkedRows: 287,
                violationCount: 0,
                tooEasyForKanji: 0,
                laterMissingLearnerFitReason: 0,
                blockers: [],
            },
        }],
    });

    assert.match(text, /N5 \| yes \| exhausted/);
    assert.match(text, /Placement resolved means/);
    assert.match(text, /no anchor 0/);
    assert.match(text, /cross-level route 0/);
    assert.match(text, /This is not golden review, platinum review, APKG QA, or release readiness/);
});
