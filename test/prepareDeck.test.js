const test = require("node:test");
const assert = require("node:assert/strict");

const {
    hasSelectedLevelReadinessFailure,
    hasSelectedMediaCoverageFailure,
    shouldFailDeckReady,
} = require("../scripts/prepareDeck");

test("shouldFailDeckReady fails selected decks with incomplete required audio", () => {
    const summary = {
        levels: [3],
        coverage: { audio: 0.01, fullMedia: 0.01 },
        exportIssues: { count: 0 },
    };
    const doctorReport = {
        quality: {
            levelReadiness: {
                levels: [
                    { level: 3, ready: false },
                    { level: 4, ready: true },
                ],
            },
        },
    };

    assert.equal(hasSelectedLevelReadinessFailure({ summary, doctorReport }), true);
    assert.equal(hasSelectedMediaCoverageFailure(summary), true);
    assert.equal(shouldFailDeckReady({ summary, doctorReport }), true);
});

test("shouldFailDeckReady ignores unrelated global level failures", () => {
    const summary = {
        levels: [5],
        coverage: { audio: 1, fullMedia: 1 },
        exportIssues: { count: 0 },
    };
    const doctorReport = {
        quality: {
            levelReadiness: {
                levels: [
                    { level: 5, ready: true },
                    { level: 3, ready: false },
                ],
            },
        },
    };

    assert.equal(hasSelectedLevelReadinessFailure({ summary, doctorReport }), false);
    assert.equal(hasSelectedMediaCoverageFailure(summary), false);
    assert.equal(shouldFailDeckReady({ summary, doctorReport }), false);
});

test("shouldFailDeckReady still fails export fallbacks unless explicitly allowed", () => {
    const summary = {
        levels: [5],
        coverage: { audio: 1, fullMedia: 1 },
        exportIssues: { count: 1 },
    };
    const doctorReport = {
        quality: {
            levelReadiness: {
                levels: [{ level: 5, ready: true }],
            },
        },
    };

    assert.equal(shouldFailDeckReady({ summary, doctorReport }), true);
    assert.equal(shouldFailDeckReady({ summary, doctorReport, allowExportFallbacks: true }), false);
});
