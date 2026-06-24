const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const importDefaults = require("../scripts/importJlptKanjiSourceInput");
const {
    DEFAULT_CONFIG,
    DEFAULT_CONTRACT,
    DEFAULT_EVIDENCE,
    DEFAULT_SOURCE_EVIDENCE_BUDGET,
    buildAssignmentFileStats,
    buildJlptKanjiSourceEvidenceCostKeysOnly,
    buildJlptKanjiSourceEvidenceCostReport,
    buildJlptKanjiSourceEvidenceCostSummary,
    countPhysicalLines,
    diffMemoryUsage,
    evaluateBudget,
    formatBytesAsMiB,
    formatAssignmentFileStats,
    formatBudgetResult,
    formatJlptKanjiSourceEvidenceCostReport,
    formatMemoryDelta,
    formatMemoryObservation,
    formatMemorySnapshot,
    measureOperation,
    normalizeRepeat,
    parseArgs,
    resolveBudget,
    snapshotMemoryUsage,
    summarizeMemorySamples,
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
        "--budget=default",
        "--budget-source-audit-ms=1234",
        "--json",
        "--summary",
        "--keys-only",
    ]);

    assert.equal(options.source, "shin_kanzen_master_kanji");
    assert.equal(options.repeat, 3);
    assert.equal(options.limit, 10);
    assert.equal(options.fullRematerialize, true);
    assert.equal(options.budget, "default");
    assert.equal(options.budgetSourceAuditMs, 1234);
    assert.equal(options.json, true);
    assert.equal(options.summary, true);
    assert.equal(options.keysOnly, true);
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

test("source evidence cost report resolves and evaluates benchmark budgets", () => {
    const budget = resolveBudget({
        budget: "default",
        budgetEvidenceLoadMs: null,
        budgetPreflightMs: 42,
        budgetImportDryRunMs: null,
        budgetSerializationMs: null,
        budgetSourceAuditMs: null,
    });

    assert.deepEqual(budget, {
        ...DEFAULT_SOURCE_EVIDENCE_BUDGET,
        preflightMs: 42,
    });

    const result = evaluateBudget({
        timings: {
            evidenceLoad: { averageMs: 10 },
            preflight: { averageMs: 50 },
            importDryRun: { averageMs: 20 },
            serializedEvidence: { averageMs: 30 },
            sourceAudit: { averageMs: 40 },
        },
    }, budget);

    assert.equal(result.passed, false);
    assert.deepEqual(result.failures.map((failure) => failure.key), ["preflightMs"]);
    assert.match(formatBudgetResult(result), /source input preflight/);
});

test("source evidence cost report supports custom budget-only mode", () => {
    const budget = resolveBudget({
        budget: null,
        budgetEvidenceLoadMs: 11,
        budgetPreflightMs: null,
        budgetImportDryRunMs: null,
        budgetSerializationMs: null,
        budgetSourceAuditMs: null,
    });

    assert.deepEqual(budget, {
        evidenceLoadMs: 11,
        preflightMs: null,
        importDryRunMs: null,
        serializationMs: null,
        sourceAuditMs: null,
    });
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
        assignmentFiles: {
            source_a: "assignments/source_a.json",
        },
    };

    assert.deepEqual(summarizeEvidenceManifest(evidence), {
        version: 1,
        sourceCount: 2,
        assignmentSourceCount: 2,
        assignmentCount: 3,
        assignmentFileCount: 1,
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

test("source evidence cost report summarizes split assignment file storage", (t) => {
    const tempDir = fs.mkdtempSync(path.join(__dirname, "tmp-source-cost-"));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
    const evidencePath = path.join(tempDir, "evidence.json");
    const assignmentPath = path.join(tempDir, "assignments", "source_a.json");
    fs.mkdirSync(path.dirname(assignmentPath), { recursive: true });
    const assignmentText = `${JSON.stringify({
        sourceId: "source_a",
        evidenceRecords: {
            evidence_a: { citation: "Fixture citation" },
        },
        assignments: {
            日: { level: 5, reviewStatus: "reviewed", evidenceRecordId: "evidence_a" },
            月: { level: 5, reviewStatus: "reviewed" },
        },
    }, null, 2)}\n`;
    fs.writeFileSync(evidencePath, "{}\n", "utf8");
    fs.writeFileSync(assignmentPath, assignmentText, "utf8");

    const stats = buildAssignmentFileStats(evidencePath, {
        source_a: "assignments/source_a.json",
    });

    assert.equal(stats.count, 1);
    assert.equal(stats.byteSize, Buffer.byteLength(assignmentText));
    assert.equal(stats.lineCount, countPhysicalLines(assignmentText));
    assert.equal(stats.assignmentCount, 2);
    assert.equal(stats.evidenceRecordCount, 1);
    assert.equal(stats.evidenceRecordReferenceCount, 1);
    assert.match(formatAssignmentFileStats(stats), /1 evidence records; 1 record refs/);
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
    assert.equal(measured.memory.unit, "bytes");
    assert.equal(measured.memory.samples, 3);
    assert.ok(Number.isInteger(measured.memory.before.rss));
    assert.ok(Number.isInteger(measured.memory.after.heapUsed));
    assert.ok(Object.hasOwn(measured.memory.delta, "heapTotal"));
});

test("source evidence cost report summarizes and formats memory observations", () => {
    const before = { rss: 10485760, heapTotal: 5242880, heapUsed: 2097152, external: 0, arrayBuffers: 0 };
    const after = { rss: 12582912, heapTotal: 6291456, heapUsed: 2621440, external: 0, arrayBuffers: 0 };
    const sample = {
        before,
        after,
        delta: diffMemoryUsage(after, before),
    };
    const memory = summarizeMemorySamples([sample]);

    assert.deepEqual(memory.delta, {
        rss: 2097152,
        heapTotal: 1048576,
        heapUsed: 524288,
        external: 0,
        arrayBuffers: 0,
    });
    assert.equal(formatBytesAsMiB(1048576), "1.00 MiB");
    assert.match(formatMemorySnapshot(after), /rss 12.00 MiB/);
    assert.match(formatMemoryDelta(memory.delta), /heapUsed \+0.50 MiB/);
    assert.match(formatMemoryObservation({ memory }), /max delta/);

    const current = snapshotMemoryUsage();
    assert.ok(Number.isInteger(current.rss));
    assert.ok(Number.isInteger(current.heapUsed));
});

test("source evidence cost report formats read-only no-mutation scope", () => {
    const memory = summarizeMemorySamples([{
        before: { rss: 10485760, heapTotal: 5242880, heapUsed: 2097152, external: 0, arrayBuffers: 0 },
        after: { rss: 12582912, heapTotal: 6291456, heapUsed: 2621440, external: 0, arrayBuffers: 0 },
        delta: { rss: 2097152, heapTotal: 1048576, heapUsed: 524288, external: 0, arrayBuffers: 0 },
    }]);
    const text = formatJlptKanjiSourceEvidenceCostReport({
        sourceId: "fixture_source",
        repeat: 1,
        files: {
            evidence: { exists: true, byteSize: 100, lineCount: 10, path: "templates/evidence.json" },
            assignmentFiles: { count: 1, byteSize: 50, lineCount: 8, evidenceRecordCount: 2, evidenceRecordReferenceCount: 3 },
            sourceInputs: { exists: true, byteSize: 20, lineCount: 4, path: "templates/inputs.json" },
            contract: { exists: true, byteSize: 30, lineCount: 5, path: "templates/contract.json" },
            sourceWorksheet: { exists: true, byteSize: 40, lineCount: 6, path: "downloads/source.tsv" },
        },
        evidence: {
            sourceCount: 2,
            assignmentSourceCount: 1,
            assignmentCount: 3,
            assignmentFileCount: 1,
            kanjiRollupCount: 3,
        },
        selectedSource: {
            assignmentCount: 3,
            uniqueCitationCount: 1,
            repeatedCitationCount: 2,
            uniqueEvidenceRefCount: 3,
        },
        memory: {
            baseline: memory.before,
            final: memory.after,
            delta: memory.delta,
        },
        timings: {
            evidenceLoad: {
                averageMs: 0.5,
                minMs: 0.5,
                maxMs: 0.5,
                repeat: 1,
                memory,
                lastResult: {},
            },
            preflight: {
                averageMs: 1,
                minMs: 1,
                maxMs: 1,
                repeat: 1,
                memory,
                lastResult: { rowCount: 10, reviewedAssignmentCount: 3, resolvedRowCount: 3, rejectedRowCount: 0, blockerCount: 0 },
            },
            importDryRun: {
                averageMs: 2,
                minMs: 2,
                maxMs: 2,
                repeat: 1,
                memory,
                lastResult: { fullRematerialize: false, importedAssignmentCount: 3, previousAssignmentCount: 2, changedAssignmentCount: 1, changedKanjiCount: 1 },
            },
            serializedEvidence: {
                averageMs: 3,
                minMs: 3,
                maxMs: 3,
                repeat: 1,
                memory,
                lastResult: 100,
            },
            sourceAudit: {
                averageMs: 4,
                minMs: 4,
                maxMs: 4,
                repeat: 1,
                memory,
                lastResult: { governanceValid: true, evidenceDepthValid: false, checked: 3 },
            },
        },
        budget: {
            passed: true,
            failures: [],
            budget: DEFAULT_SOURCE_EVIDENCE_BUDGET,
        },
    });

    assert.match(text, /Mode: read-only/);
    assert.match(text, /does not import assignments, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /source input preflight/);
    assert.match(text, /source assignment files: 1 files; 50 bytes; 8 lines; 2 evidence records; 3 record refs/);
    assert.match(text, /source-evidence tracked storage total: 150 bytes/);
    assert.match(text, /assignment files: 1/);
    assert.match(text, /full manifest serialization/);
    assert.match(text, /Timing and memory/);
    assert.match(text, /Observed process memory snapshots/);
    assert.match(text, /evidence manifest load/);
    assert.match(text, /Source-evidence benchmark budget: pass/);
});

test("source evidence cost report compact summary keeps accounting without assignment file maps", () => {
    const report = {
        sourceId: "fixture_source",
        repeat: 1,
        limit: 10,
        readOnly: true,
        noDeckMutation: true,
        paths: { evidence: "templates/evidence.json" },
        files: {
            evidence: { byteSize: 100 },
            assignmentFiles: {
                count: 2,
                byteSize: 200,
                lineCount: 20,
                assignmentCount: 10,
                evidenceRecordCount: 4,
                evidenceRecordReferenceCount: 8,
                filesBySource: {
                    source_a: { byteSize: 100 },
                },
            },
            sourceInputs: { byteSize: 10 },
            contract: { byteSize: 20 },
            sourceWorksheet: { byteSize: 30 },
        },
        evidence: { assignmentCount: 10 },
        selectedSource: { assignmentCount: 4 },
        memory: { unit: "bytes" },
        timings: {
            evidenceLoad: { label: "load", repeat: 1, averageMs: 1, minMs: 1, maxMs: 1, memory: {}, lastResult: { assignmentCount: 10 } },
        },
        budget: { passed: true, failures: [] },
    };
    const summary = buildJlptKanjiSourceEvidenceCostSummary(report);
    const keys = buildJlptKanjiSourceEvidenceCostKeysOnly(report);

    assert.equal(summary.files.assignmentFiles.assignmentCount, 10);
    assert.equal(Object.hasOwn(summary.files.assignmentFiles, "filesBySource"), false);
    assert.equal(summary.timings.evidenceLoad.lastResult.assignmentCount, 10);
    assert.equal(keys.children.files.children.assignmentFiles.children.filesBySource.type, "object");
});

test("source evidence cost report counts physical lines", () => {
    assert.equal(countPhysicalLines(""), 0);
    assert.equal(countPhysicalLines("a\nb\n"), 3);
});
