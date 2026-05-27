const test = require("node:test");
const assert = require("node:assert/strict");

const {
    loadPerformanceMemoryAuditMatrix,
} = require("../src/datasets/performanceMemoryAuditMatrix");
const {
    buildPerformanceMemoryAuditMatrixReport,
    extractNpmScript,
} = require("../src/services/performanceMemoryAuditMatrixService");

test("tracked performance and memory audit matrix validates command and CI boundaries", () => {
    const report = buildPerformanceMemoryAuditMatrixReport();

    assert.equal(report.passed, true);
    assert.equal(report.counts.lanes, 7);
    assert.equal(report.counts.timingBudgetsPresent, 4);
    assert.equal(report.counts.memorySamplingPresent, 4);
    assert.equal(report.counts.unresolvedQuestions, 0);
    assert.equal(report.riskControls.minimumRepeatRunsBeforeBudgetChange, 3);
    assert.equal(report.riskControls.memoryThresholdPolicy.status, "trend-only");
    assert.equal(report.riskControls.memoryThresholdPolicy.hardLimitsActive, false);
    assert.deepEqual(report.failures, []);
});

test("performance and memory matrix records build/package benchmark memory coverage", () => {
    const matrix = loadPerformanceMemoryAuditMatrix();
    const lanesById = new Map(matrix.lanes.map((lane) => [lane.id, lane]));

    for (const laneId of ["build-hot-cache", "build-cold-native-apkg"]) {
        const lane = lanesById.get(laneId);
        assert.ok(lane, `Missing matrix lane ${laneId}`);
        assert.equal(lane.ciPolicy, "manual-local");
        assert.equal(lane.memorySampling.status, "present");
        assert.equal(lane.memorySampling.source, "scripts/benchmarkBuild.js");
        assert.equal(lane.memorySampling.scope.includes("package stage from build summary"), true);
        assert.equal(lane.timingBudget.status, "present");
    }

    assert.equal(extractNpmScript("npm run bench:build:cold-apkg:gate"), "bench:build:cold-apkg:gate");
});
