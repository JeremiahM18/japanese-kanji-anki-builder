const test = require("node:test");
const assert = require("node:assert/strict");

const importDefaults = require("../scripts/importJlptKanjiSourceInput");
const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    buildJlptKanjiSourceEvidenceCostReport,
    countPhysicalLines,
    formatJlptKanjiSourceEvidenceCostReport,
    measureOperation,
    normalizeRepeat,
    parseArgs,
    summarizeAuditReport,
    summarizeEvidenceManifest,
    summarizeImportResult,
    summarizePreflightReport,
    summarizeSourceAssignments,
} = require("../scripts/reportJlptKanjiSourceEvidenceCost");

test("source evidence cost report reuses import script defaults", () => {
    assert.equal(DEFAULT_CONFIG, importDefaults.DEFAULT_CONFIG);
    assert.equal(DEFAULT_CONTRACT, importDefaults.DEFAULT_CONTRACT);
    assert.equal(DEFAULT_EVIDENCE, importDefaults.DEFAULT_EVIDENCE);
});

test("source evidence cost report parses explicit benchmark options", () => {
    const options = parseArgs([
        "--source=shin_kanzen_master_kanji",
        "--repeat=3",
        "--limit=10",
        "--full-rematerialize",
        "--json",
    ]);

    assert.equal(options.source, "shin_kanzen_master_kanji");
    assert.equal(options.repeat, 3);
    assert.equal(options.limit, 10);
    assert.equal(options.fullRematerialize, true);
    assert.equal(options.json, true);
});

test("source evidence cost report requires an explicit source", () => {
    assert.throws(() => buildJlptKanjiSourceEvidenceCostReport({ source: null }), /Missing required --source/);
});

test("source evidence cost report validates repeat bounds", () => {
    assert.equal(normalizeRepeat(1), 1);
    assert.equal(normalizeRepeat("20"), 20);
    assert.throws(() => normalizeRepeat(0), /Invalid --repeat/);
    assert.throws(() => normalizeRepeat(21), /Invalid --repeat/);
});

test("source evidence cost report summarizes manifest and selected source shape", () => {
    const evidence = {
        version: 1,
        sources: {
            source_a: {},
            source_b: {},
        },
        assignments: {
            source_a: {
                日: { citation: "same", evidenceRef: "ref-a" },
                月: { citation: "same", evidenceRef: "ref-b" },
            },
            source_b: {
                火: { citation: "other", evidenceRef: "ref-c" },
            },
        },
        kanji: {
            日: {},
            月: {},
        },
    };

    assert.deepEqual(summarizeEvidenceManifest(evidence), {
        version: 1,
        sourceCount: 2,
        assignmentSourceCount: 2,
        assignmentCount: 3,
        kanjiRollupCount: 2,
        assignmentsBySource: {
            source_a: 2,
            source_b: 1,
        },
    });
    assert.deepEqual(summarizeSourceAssignments(evidence, "source_a"), {
        sourceId: "source_a",
        assignmentCount: 2,
        uniqueCitationCount: 1,
        uniqueEvidenceRefCount: 2,
        repeatedCitationCount: 1,
    });
});

test("source evidence cost report summarizes operation outputs without large payloads", () => {
    assert.deepEqual(summarizePreflightReport({
        valid: true,
        reports: [{
            rowCount: 10,
            resolvedRowCount: 3,
            reviewedAssignmentCount: 2,
            pendingRowCount: 7,
            blockedRowCount: 0,
            sourceAccessGapRowCount: 1,
            rejectedRowCount: 0,
            blockers: [],
        }],
    }), {
        valid: true,
        rowCount: 10,
        resolvedRowCount: 3,
        reviewedAssignmentCount: 2,
        pendingRowCount: 7,
        blockedRowCount: 0,
        sourceAccessGapRowCount: 1,
        rejectedRowCount: 0,
        blockerCount: 0,
    });

    assert.deepEqual(summarizeImportResult({
        preflightValid: true,
        fullRematerialize: false,
        summary: {
            importedAssignmentCount: 2,
            previousAssignmentCount: 1,
            changedAssignmentCount: 1,
            changedKanji: ["日"],
        },
    }), {
        preflightValid: true,
        fullRematerialize: false,
        importedAssignmentCount: 2,
        previousAssignmentCount: 1,
        changedAssignmentCount: 1,
        changedKanjiCount: 1,
    });

    assert.deepEqual(summarizeAuditReport({
        valid: false,
        governanceValid: true,
        evidenceDepthValid: false,
        checked: 80,
        confidenceCounts: { weak_evidence: 80 },
        issueCounts: { missingJapanesePublishedSource: 15 },
    }), {
        valid: false,
        governanceValid: true,
        evidenceDepthValid: false,
        checked: 80,
        confidenceCounts: { weak_evidence: 80 },
        issueCounts: { missingJapanesePublishedSource: 15 },
    });
});

test("source evidence cost report measures repeated operations", () => {
    let calls = 0;
    const measured = measureOperation("fixture", 3, () => {
        calls += 1;
        return { calls };
    });

    assert.equal(calls, 3);
    assert.equal(measured.label, "fixture");
    assert.equal(measured.repeat, 3);
    assert.equal(measured.lastResult.calls, 3);
    assert.ok(measured.averageMs >= 0);
});

test("source evidence cost report formats read-only no-mutation scope", () => {
    const text = formatJlptKanjiSourceEvidenceCostReport({
        sourceId: "fixture_source",
        repeat: 1,
        files: {
            evidence: { exists: true, byteSize: 100, lineCount: 10, path: "templates/evidence.json" },
            sourceInputs: { exists: true, byteSize: 20, lineCount: 4, path: "templates/inputs.json" },
            contract: { exists: true, byteSize: 30, lineCount: 5, path: "templates/contract.json" },
            sourceWorksheet: { exists: true, byteSize: 40, lineCount: 6, path: "downloads/source.tsv" },
        },
        evidence: {
            sourceCount: 2,
            assignmentSourceCount: 1,
            assignmentCount: 3,
            kanjiRollupCount: 3,
        },
        selectedSource: {
            assignmentCount: 3,
            uniqueCitationCount: 1,
            repeatedCitationCount: 2,
            uniqueEvidenceRefCount: 3,
        },
        timings: {
            preflight: {
                averageMs: 1,
                minMs: 1,
                maxMs: 1,
                repeat: 1,
                lastResult: { rowCount: 10, reviewedAssignmentCount: 3, resolvedRowCount: 3, rejectedRowCount: 0, blockerCount: 0 },
            },
            importDryRun: {
                averageMs: 2,
                minMs: 2,
                maxMs: 2,
                repeat: 1,
                lastResult: { fullRematerialize: false, importedAssignmentCount: 3, previousAssignmentCount: 2, changedAssignmentCount: 1, changedKanjiCount: 1 },
            },
            serializedEvidence: {
                averageMs: 3,
                minMs: 3,
                maxMs: 3,
                repeat: 1,
                lastResult: 100,
            },
            sourceAudit: {
                averageMs: 4,
                minMs: 4,
                maxMs: 4,
                repeat: 1,
                lastResult: { governanceValid: true, evidenceDepthValid: false, checked: 3 },
            },
        },
    });

    assert.match(text, /Mode: read-only/);
    assert.match(text, /does not import assignments, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /source input preflight/);
    assert.match(text, /full manifest serialization/);
});

test("source evidence cost report counts physical lines", () => {
    assert.equal(countPhysicalLines(""), 0);
    assert.equal(countPhysicalLines("a\nb\n"), 3);
});
