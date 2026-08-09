"use strict";

const { evaluateGoldenWordReviewSet } = require("./goldenReviewService");
const { evaluateWordSilverGeneratedSurface } = require("./wordSilverStatusService");
const { evaluateSapphireWordReviewSet } = require("./sapphireWordReviewService");
const { evaluatePlatinumWordReviewSet } = require("./platinumReviewService");
const {
    buildPlatinumWordRereviewStatusReport,
} = require("./platinumWordRereviewStatusService");
const {
    buildObsidianWordCertificationStatusSummary,
} = require("./obsidianWordCertificationStatusService");
const {
    loadWordReviewSharedContext,
} = require("./wordReviewSharedContextService");

const WORD_CERTIFICATION_LANES = Object.freeze([
    "silver",
    "gold",
    "sapphire",
    "platinum",
    "obsidian",
]);

const FAILURE_CLASSIFICATIONS = Object.freeze({
    PASS: "pass",
    EXPECTED_INCOMPLETE_BACKLOG: "expected_incomplete_backlog",
    REVIEWED_ROW_OR_AUTHORITY_FAILURE: "reviewed_row_schema_evidence_or_authority_failure",
});

function normalizeSelectedLanes(lanes = WORD_CERTIFICATION_LANES) {
    const requested = Array.isArray(lanes) ? lanes : String(lanes || "").split(",");
    const normalized = new Set(requested.map((lane) => String(lane).trim().toLowerCase()).filter(Boolean));
    const unknown = [...normalized].filter((lane) => !WORD_CERTIFICATION_LANES.includes(lane));
    if (unknown.length > 0) {
        throw new Error(`Unsupported word certification lanes: ${unknown.join(", ")}`);
    }
    if (normalized.size === 0) {
        throw new Error("At least one word certification lane is required.");
    }
    return WORD_CERTIFICATION_LANES.filter((lane) => normalized.has(lane));
}

function classifyGoldReport(report = {}) {
    if (report.passed) {
        return FAILURE_CLASSIFICATIONS.PASS;
    }
    const hasReviewedFailure = (report.failedCount || 0) > 0
        || (report.duplicateExpectationWords || []).length > 0
        || (report.extraExpectationWords || []).length > 0;
    return hasReviewedFailure
        ? FAILURE_CLASSIFICATIONS.REVIEWED_ROW_OR_AUTHORITY_FAILURE
        : FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG;
}

function classifySilverReport(report = {}) {
    return report.passed
        ? FAILURE_CLASSIFICATIONS.PASS
        : FAILURE_CLASSIFICATIONS.REVIEWED_ROW_OR_AUTHORITY_FAILURE;
}

function classifyManifestLaneReport(report = {}) {
    if (report.passed) {
        return FAILURE_CLASSIFICATIONS.PASS;
    }
    const hasReviewedFailure = (report.failedCount || 0) > 0
        || (report.duplicateActiveEntries || []).length > 0;
    return hasReviewedFailure
        ? FAILURE_CLASSIFICATIONS.REVIEWED_ROW_OR_AUTHORITY_FAILURE
        : FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG;
}

function isExpectedObsidianBacklogFailure(failure = {}) {
    if (failure.category === "needs_substantive_rereview") {
        return failure.currentObsidianProofObserved !== true;
    }
    return failure.category === "blocked_or_failing"
        && failure.field === "platinumManifestEntry"
        && /missing|no platinum manifest entry/i.test(String(failure.actual || ""));
}

function countDistinctFailureRows(failures = []) {
    return new Set((Array.isArray(failures) ? failures : []).map((failure, index) => {
        const card = String(failure?.card || "").trim();
        return card ? `card:${card}` : `failure:${index}`;
    })).size;
}

function summarizeObsidianFailures(report = {}) {
    const failures = Array.isArray(report.failures) ? report.failures : [];
    const expectedFailures = failures.filter(isExpectedObsidianBacklogFailure);
    const laneFailures = failures.filter((failure) => !isExpectedObsidianBacklogFailure(failure));
    return {
        failureCount: failures.length,
        expectedBacklog: countDistinctFailureRows(expectedFailures),
        laneFailureCount: countDistinctFailureRows(laneFailures),
    };
}

function classifyObsidianReport(report = {}) {
    if (report.passed) {
        return FAILURE_CLASSIFICATIONS.PASS;
    }
    const summary = summarizeObsidianFailures(report);
    return summary.failureCount > 0 && summary.laneFailureCount === 0
        ? FAILURE_CLASSIFICATIONS.EXPECTED_INCOMPLETE_BACKLOG
        : FAILURE_CLASSIFICATIONS.REVIEWED_ROW_OR_AUTHORITY_FAILURE;
}

function summarizeLaneReport(lane, report = {}) {
    if (lane === "silver") {
        return {
            lane,
            passed: Boolean(report.passed),
            classification: classifySilverReport(report),
            generatedRows: report.totalRows || 0,
            coveredRows: report.passedCount || 0,
            expectedBacklog: 0,
            laneFailureCount: report.failedCount || 0,
        };
    }
    if (lane === "gold") {
        return {
            lane,
            passed: Boolean(report.passed),
            classification: classifyGoldReport(report),
            generatedRows: report.generatedRowCount ?? report.totalCards ?? 0,
            coveredRows: report.passedCount ?? 0,
            expectedBacklog: (report.missingExpectationWords || []).length,
            laneFailureCount: report.failedCount || 0,
        };
    }
    if (lane === "sapphire") {
        return {
            lane,
            passed: Boolean(report.passed),
            classification: classifyManifestLaneReport(report),
            generatedRows: report.generatedRowCount || 0,
            coveredRows: report.currentStandardSapphireCount || 0,
            expectedBacklog: (report.missingCurrentStandardRows || []).length,
            laneFailureCount: report.failedCount || 0,
        };
    }
    if (lane === "platinum") {
        return {
            lane,
            passed: Boolean(report.passed),
            classification: classifyManifestLaneReport(report),
            generatedRows: report.generatedRowCount || 0,
            coveredRows: report.currentStandardPlatinumCount || 0,
            expectedBacklog: (report.missingCurrentStandardRows || []).length,
            laneFailureCount: report.failedCount || 0,
        };
    }

    const totals = report.totals || {};
    const failureSummary = summarizeObsidianFailures(report);
    return {
        lane,
        passed: Boolean(report.passed),
        classification: classifyObsidianReport(report),
        generatedRows: totals.generatedRows || 0,
        coveredRows: totals.substantive_current_standard_review_proven || 0,
        expectedBacklog: failureSummary.expectedBacklog,
        laneFailureCount: failureSummary.laneFailureCount,
    };
}

function buildSapphireEvaluation(context, evaluateSapphire) {
    return evaluateSapphire({
        rows: context.rows,
        rowsByWritten: context.indexes.rowsByWritten,
        entries: context.sapphireEntries,
        goldenExpectations: context.goldenExpectations,
        goldenExpectationsByIdentity: context.indexes.goldenByIdentity,
        requireGoldPrecondition: true,
        requireCurrentReviewStandard: true,
        requireAllRows: true,
    });
}

function buildPlatinumEvaluation(context, { evaluateSapphire, evaluatePlatinum }) {
    const independentSapphirePrecondition = buildSapphireEvaluation(context, evaluateSapphire);
    return evaluatePlatinum({
        rows: context.rows,
        rowsByWritten: context.indexes.rowsByWritten,
        entries: context.platinumEntries,
        goldenExpectations: context.goldenExpectations,
        goldenExpectationsByIdentity: context.indexes.goldenByIdentity,
        requireGoldPrecondition: true,
        sapphireEntries: context.sapphireEntries,
        currentStandardSapphireEntriesByIdentity: context.indexes.currentSapphireByIdentity,
        sapphireResults: independentSapphirePrecondition.results,
        requireSapphirePrecondition: true,
        wordPitchAccentData: context.wordPitchAccentData,
        kanjiLevelData: context.kanjiLevelData,
        requireCurrentReviewStandard: true,
        requireAllRows: true,
    });
}

function buildObsidianEvaluation(context, {
    evaluateSapphire,
    buildRereviewStatus,
    buildCertificationSummary,
}) {
    const independentSapphirePrecondition = buildSapphireEvaluation(context, evaluateSapphire);
    const independentRereviewReport = buildRereviewStatus({
        rows: context.rows,
        rowsByWritten: context.indexes.rowsByWritten,
        entries: context.platinumEntries,
        goldenExpectations: context.goldenExpectations,
        goldenExpectationsByIdentity: context.indexes.goldenByIdentity,
        sapphireEntries: context.sapphireEntries,
        currentStandardSapphireEntriesByIdentity: context.indexes.currentSapphireByIdentity,
        sapphireResults: independentSapphirePrecondition.results,
        requireLanePreconditions: true,
        level: context.level,
        wordPitchAccentData: context.wordPitchAccentData,
        kanjiLevelData: context.kanjiLevelData,
    });
    return buildCertificationSummary([independentRereviewReport]);
}

/**
 * Runs selected word lanes in canonical order while sharing only immutable
 * loaded inputs/indexes. Later lanes perform their own prerequisite evaluation
 * and never reuse an earlier lane's result as approval.
 *
 * @param {object} [options]
 * @returns {Promise<object>}
 */
async function buildWordMultiLaneStatus({
    levels = [],
    lanes = WORD_CERTIFICATION_LANES,
    cwd = process.cwd(),
    config,
    proofProvider,
    dependencies = {},
} = {}) {
    const selectedLanes = normalizeSelectedLanes(lanes);
    const selectedLevels = [...new Set((Array.isArray(levels) ? levels : []).map(Number))];
    if (selectedLevels.length === 0) {
        throw new Error("Word multi-lane status requires at least one explicit level.");
    }

    const loadContext = dependencies.loadWordReviewSharedContext || loadWordReviewSharedContext;
    const evaluators = {
        evaluateSilver: dependencies.evaluateWordSilverGeneratedSurface || evaluateWordSilverGeneratedSurface,
        evaluateGold: dependencies.evaluateGoldenWordReviewSet || evaluateGoldenWordReviewSet,
        evaluateSapphire: dependencies.evaluateSapphireWordReviewSet || evaluateSapphireWordReviewSet,
        evaluatePlatinum: dependencies.evaluatePlatinumWordReviewSet || evaluatePlatinumWordReviewSet,
        buildRereviewStatus: dependencies.buildPlatinumWordRereviewStatusReport || buildPlatinumWordRereviewStatusReport,
        buildCertificationSummary: dependencies.buildObsidianWordCertificationStatusSummary || buildObsidianWordCertificationStatusSummary,
    };
    const levelReports = [];

    for (const level of selectedLevels) {
        const context = await loadContext({ level, cwd, config, proofProvider });
        const laneReports = [];
        for (const lane of selectedLanes) {
            let report;
            if (lane === "silver") {
                report = evaluators.evaluateSilver({ rows: context.rows });
            } else if (lane === "gold") {
                report = evaluators.evaluateGold({
                    rows: context.rows,
                    rowsByWritten: context.indexes.rowsByWritten,
                    expectations: context.goldenExpectations,
                    expectationsByWritten: context.indexes.goldenByWritten,
                    requireAllRows: true,
                });
            } else if (lane === "sapphire") {
                report = buildSapphireEvaluation(context, evaluators.evaluateSapphire);
            } else if (lane === "platinum") {
                report = buildPlatinumEvaluation(context, evaluators);
            } else {
                report = buildObsidianEvaluation(context, evaluators);
            }
            laneReports.push({
                ...summarizeLaneReport(lane, report),
                report,
            });
        }
        levelReports.push({
            level,
            contextSharingBoundary: context.sharingBoundary,
            wordStudyPreflight: context.wordStudyPreflight,
            lanes: laneReports,
        });
    }

    const passed = levelReports.every((levelReport) => levelReport.lanes.every((lane) => lane.passed));
    return {
        command: "deck:words:multi-lane-status",
        deckKind: "word",
        certificationOrder: [...WORD_CERTIFICATION_LANES],
        selectedLanes,
        selectedLevels,
        readOnly: true,
        sharedInputsOnly: true,
        independentLaneEvaluations: true,
        passed,
        levels: levelReports,
    };
}

function buildCompactWordMultiLaneStatus(status = {}) {
    return {
        command: status.command,
        deckKind: status.deckKind,
        certificationOrder: status.certificationOrder,
        selectedLanes: status.selectedLanes,
        selectedLevels: status.selectedLevels,
        readOnly: status.readOnly,
        sharedInputsOnly: status.sharedInputsOnly,
        independentLaneEvaluations: status.independentLaneEvaluations,
        passed: status.passed,
        levels: (status.levels || []).map((levelReport) => ({
            level: levelReport.level,
            contextSharingBoundary: levelReport.contextSharingBoundary,
            wordStudyPreflight: levelReport.wordStudyPreflight,
            lanes: (levelReport.lanes || []).map(({ report: _report, ...summary }) => summary),
        })),
    };
}

function formatWordMultiLaneStatus(status = {}) {
    const lines = [
        "Japanese Kanji Builder Word Multi-Lane Status",
        "",
        `Certification order: ${(status.certificationOrder || WORD_CERTIFICATION_LANES).map((lane) => lane[0].toUpperCase() + lane.slice(1)).join(" -> ")}`,
        "Shared boundary: deep-frozen loaded inputs and read-only indexes only.",
        "Independent boundary: every lane runs its own evaluator; no result, approval, proof, or certification is shared.",
        `Aggregate result: ${status.passed ? "passing" : "failing (fail-closed)"}`,
        "",
        "| Scope | Lane | Result | Classification | Coverage | Expected backlog | Lane failures |",
        "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ];

    for (const levelReport of status.levels || []) {
        for (const lane of levelReport.lanes || []) {
            lines.push(`| N${levelReport.level} | ${lane.lane} | ${lane.passed ? "pass" : "fail"} | ${lane.classification} | ${lane.coveredRows}/${lane.generatedRows} | ${lane.expectedBacklog} | ${lane.laneFailureCount} |`);
        }
    }

    lines.push(
        "",
        "This command is read-only. It does not promote cards, write manifests or proof, shrink denominators, replace owning lane commands, or make a release claim."
    );
    return `${lines.join("\n")}\n`;
}

module.exports = {
    FAILURE_CLASSIFICATIONS,
    WORD_CERTIFICATION_LANES,
    buildCompactWordMultiLaneStatus,
    buildWordMultiLaneStatus,
    classifyGoldReport,
    classifySilverReport,
    classifyManifestLaneReport,
    classifyObsidianReport,
    formatWordMultiLaneStatus,
    normalizeSelectedLanes,
    summarizeLaneReport,
};
