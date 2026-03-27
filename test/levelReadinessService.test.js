const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDefaultQualityThresholds,
    buildLevelReadinessReport,
    formatLevelReadinessReport,
} = require("../src/services/levelReadinessService");

test("buildLevelReadinessReport evaluates per-level quality gates", () => {
    const report = buildLevelReadinessReport({
        sentenceCoverage: {
            levels: [
                { level: 5, totalKanji: 10, coveredKanji: 10, coverageRatio: 1, sampleMissing: [] },
                { level: 4, totalKanji: 10, coveredKanji: 4, coverageRatio: 0.4, sampleMissing: ["不"] },
            ],
        },
        curatedCoverage: {
            levels: [
                { level: 5, totalKanji: 10, curatedKanji: 7, coverageRatio: 0.7, sampleMissing: [] },
                { level: 4, totalKanji: 10, curatedKanji: 1, coverageRatio: 0.1, sampleMissing: ["不"] },
            ],
        },
        mediaCoverage: {
            levels: [
                { level: 5, totalKanji: 10, strokeOrderCovered: 10, audioCovered: 9, fullMediaCovered: 8, strokeOrderCoverageRatio: 1, audioCoverageRatio: 0.9, fullMediaCoverageRatio: 0.8, sampleMissing: [] },
                { level: 4, totalKanji: 10, strokeOrderCovered: 2, audioCovered: 0, fullMediaCovered: 0, strokeOrderCoverageRatio: 0.2, audioCoverageRatio: 0, fullMediaCoverageRatio: 0, sampleMissing: [{ kanji: "不", missingStrokeOrder: true, missingAudio: true }] },
            ],
        },
        levels: [5, 4],
    });

    assert.equal(report.overallReady, false);
    assert.deepEqual(report.readyLevels, [5]);
    assert.equal(report.levels[0].level, 4);
    assert.equal(report.levels[0].ready, false);
    assert.equal(report.levels[1].level, 5);
    assert.equal(report.levels[1].ready, true);
    assert.equal(report.weakestLevels[0].level, 4);
    assert.equal(report.weakestLevels[0].failingChecks.includes("audio coverage"), true);
});

test("formatLevelReadinessReport renders thresholds and weakest levels", () => {
    const thresholds = buildDefaultQualityThresholds();
    const text = formatLevelReadinessReport({
        thresholds,
        overallReady: false,
        weakestLevels: [
            { level: 4, readinessScore: 0.2, failingChecks: ["sentence coverage", "audio coverage"] },
        ],
        levels: [
            {
                level: 4,
                ready: false,
                readinessScore: 0.2,
                metrics: {
                    sentenceCoverage: 0.4,
                    curatedCoverage: 0.1,
                    strokeOrderCoverage: 0.2,
                    audioCoverage: 0,
                    fullMediaCoverage: 0,
                },
                failingChecks: ["sentence coverage", "audio coverage"],
            },
        ],
    });

    assert.match(text, /Overall quality gate: failing/);
    assert.match(text, /Thresholds:/);
    assert.match(text, /Weakest levels:/);
    assert.match(text, /N4: 20.0% checks passing/);
    assert.match(text, /Failing checks: sentence coverage, audio coverage/);
});
