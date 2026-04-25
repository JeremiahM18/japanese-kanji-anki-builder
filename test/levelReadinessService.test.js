const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildDefaultCardQualityThresholds,
    buildDefaultQualityThresholds,
    buildLevelReadinessReport,
    formatCardQualityMetricsLine,
    formatLevelReadinessReport,
} = require("../src/services/levelReadinessService");

function buildCardQualityRow(level, overrides = {}) {
    return {
        level,
        totalKanji: 10,
        readingCovered: 10,
        meaningCovered: 10,
        exampleCovered: 10,
        contextualNotesCovered: 10,
        genericNotesFallback: 0,
        readingCoverageRatio: 1,
        meaningCoverageRatio: 1,
        exampleCoverageRatio: 1,
        contextualNotesCoverageRatio: 1,
        genericNotesFallbackRatio: 0,
        sampleMissing: { reading: [], meaning: [], example: [], contextualNotes: [] },
        ...overrides,
    };
}

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
                { level: 5, totalKanji: 10, strokeOrderCovered: 10, audioCovered: 10, fullMediaCovered: 10, strokeOrderCoverageRatio: 1, audioCoverageRatio: 1, fullMediaCoverageRatio: 1, sampleMissing: [] },
                { level: 4, totalKanji: 10, strokeOrderCovered: 2, audioCovered: 0, fullMediaCovered: 0, strokeOrderCoverageRatio: 0.2, audioCoverageRatio: 0, fullMediaCoverageRatio: 0, sampleMissing: [{ kanji: "不", missingStrokeOrder: true, missingAudio: true }] },
            ],
        },
        cardQuality: {
            levels: [
                buildCardQualityRow(5),
                buildCardQualityRow(4, {
                    readingCovered: 7,
                    meaningCovered: 6,
                    exampleCovered: 5,
                    contextualNotesCovered: 4,
                    genericNotesFallback: 6,
                    readingCoverageRatio: 0.7,
                    meaningCoverageRatio: 0.6,
                    exampleCoverageRatio: 0.5,
                    contextualNotesCoverageRatio: 0.4,
                    genericNotesFallbackRatio: 0.6,
                    sampleMissing: {
                        reading: ["不"],
                        meaning: ["不"],
                        example: ["不"],
                        contextualNotes: ["不"],
                    },
                }),
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
    assert.equal(report.weakestLevels[0].qualityFailingChecks.includes("local meaning coverage"), true);
    assert.equal(report.levels[0].cardQuality.failingChecks.includes("contextual notes coverage"), true);
});

test("formatLevelReadinessReport renders thresholds and weakest levels", () => {
    const thresholds = buildDefaultQualityThresholds();
    const cardQualityThresholds = buildDefaultCardQualityThresholds();
    const text = formatLevelReadinessReport({
        thresholds,
        cardQualityThresholds,
        overallReady: false,
        weakestLevels: [
            {
                level: 4,
                readinessScore: 0.2,
                failingChecks: ["sentence coverage"],
                qualityFailingChecks: ["local meaning coverage", "local example coverage"],
            },
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
                cardQuality: {
                    metrics: {
                        readingCoverage: 0.8,
                        meaningCoverage: 0.6,
                        exampleCoverage: 0.5,
                        contextualNotesCoverage: 0.4,
                        genericNotesFallbackRatio: 0.6,
                    },
                    failingChecks: ["local meaning coverage", "local example coverage"],
                },
                failingChecks: ["sentence coverage"],
            },
        ],
    });

    assert.match(text, /Overall quality gate: failing/);
    assert.match(text, /Thresholds:/);
    assert.match(text, /Card quality diagnostics:/);
    assert.match(text, /Weakest levels:/);
    assert.match(text, /N4: 20.0% checks passing/);
    assert.match(text, /Audio readiness requirements:/);
    assert.match(text, /Audio coverage target: 100.0%/);
    assert.match(text, /Full media coverage target: 100.0%/);
    assert.match(text, /Required media: audio 0.0%, full media 0.0%/);
    assert.match(text, /Failing checks: sentence coverage/);
    assert.match(text, /Card quality: readings 80.0%, meanings 60.0%, examples 50.0%, contextual notes 40.0%, generic fallback notes 60.0%/);
    assert.match(text, /Quality checks: local meaning coverage, local example coverage/);
});

test("buildLevelReadinessReport requires audio and full media by default", () => {
    const report = buildLevelReadinessReport({
        sentenceCoverage: { levels: [{ level: 5, totalKanji: 10, coveredKanji: 10, coverageRatio: 1, sampleMissing: [] }] },
        curatedCoverage: { levels: [{ level: 5, totalKanji: 10, curatedKanji: 7, coverageRatio: 0.7, sampleMissing: [] }] },
        mediaCoverage: { levels: [{ level: 5, totalKanji: 10, strokeOrderCovered: 10, audioCovered: 0, fullMediaCovered: 0, strokeOrderCoverageRatio: 1, audioCoverageRatio: 0, fullMediaCoverageRatio: 0, sampleMissing: [] }] },
        cardQuality: { levels: [buildCardQualityRow(5)] },
        levels: [5],
        thresholds: buildDefaultQualityThresholds(),
    });

    assert.equal(report.overallReady, false);
    assert.equal(report.levels[0].failingChecks.includes("audio coverage"), true);
    assert.equal(report.levels[0].failingChecks.includes("full media coverage"), true);
});


test("formatCardQualityMetricsLine renders a stable shared card-quality summary", () => {
    const text = formatCardQualityMetricsLine({
        readingCoverage: 0.8,
        meaningCoverage: 0.6,
        exampleCoverage: 0.5,
        contextualNotesCoverage: 0.4,
        genericNotesFallbackRatio: 0.6,
    });

    assert.equal(text, "Card quality: readings 80.0%, meanings 60.0%, examples 50.0%, contextual notes 40.0%, generic fallback notes 60.0%");
});
