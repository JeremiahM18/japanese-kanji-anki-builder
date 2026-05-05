const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildEnhancementSignalFromCandidateReport,
    buildReadingSignalFromCompletionReport,
    buildSourceFileIntegrity,
    formatWordExpansionSignalReport,
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
            coveredReadings: 232,
            totalReadings: 344,
        },
        readiness: {
            readingCoveragePercent: 67.4,
        },
        coverageScope: {
            label: "N5",
        },
    });

    assert.equal(exhausted.status, "exhausted");
    assert.equal(exhausted.activeItems, 0);
    assert.equal(exhausted.coverage.coveragePercent, 67.4);

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
            label: "N5 + N4",
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
                defer_candidate: 2,
                reject_candidate: 1,
            },
        },
    });

    assert.equal(exhausted.status, "exhausted");
    assert.equal(exhausted.keepCandidates, 0);
    assert.equal(exhausted.untriagedCandidateRows, 0);

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
                    coveredReadings: 232,
                    totalReadings: 344,
                },
                blockers: [],
            },
            enhancement: {
                status: "exhausted",
                keepCandidates: 0,
                untriagedCandidateRows: 0,
                deferCandidates: 17,
                rejectCandidates: 6,
                blockers: [],
            },
        }],
    });

    assert.match(text, /N5 \| yes \| exhausted/);
    assert.match(text, /This is not golden review, platinum review, APKG QA, or release readiness/);
});
