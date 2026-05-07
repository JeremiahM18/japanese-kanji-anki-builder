const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceAccessReport,
    countReviewStatuses,
    formatJlptKanjiSourceAccessReport,
    resolveSourceAccessDecision,
} = require("../src/services/jlptKanjiSourceAccessService");
const {
    buildSourceFileSummaries,
    parseArgs,
} = require("../scripts/auditJlptKanjiSourceAccess");

function buildManualSource(overrides = {}) {
    return {
        status: "planned",
        sourceKind: "assignment",
        sourceType: "japanese-published-textbook-kanji-review",
        allowedUse: "manual-citation-only",
        licenseStatus: "restricted",
        japanesePublished: true,
        countsForConsensus: true,
        canStoreAssignments: true,
        canStoreRawList: false,
        canStoreExcerpts: false,
        ...overrides,
    };
}

test("source-access audit ranks the next Japanese-published assignment lane before low-yield continuation", () => {
    const report = buildJlptKanjiSourceAccessReport({
        evidence: {
            sources: {
                shin_kanzen_master_kanji: buildManualSource({
                    status: "active",
                }),
                nihongo_sou_matome_kanji: buildManualSource(),
                try_jlpt_textbook: buildManualSource({
                    sourceType: "japanese-published-textbook-level-review",
                }),
                official_jlpt_sample_workbooks: {
                    status: "active",
                    sourceKind: "occurrence",
                    sourceType: "official-jlpt-positive-occurrence",
                    allowedUse: "occurrence-only",
                    licenseStatus: "restricted",
                    japanesePublished: true,
                    countsForConsensus: false,
                    canStoreAssignments: false,
                    positiveEvidenceOnly: true,
                },
            },
            assignments: {
                shin_kanzen_master_kanji: {
                    語: { level: 4, reviewStatus: "reviewed" },
                },
            },
        },
        sourceInputs: {
            inputs: {
                shin_kanzen_master_kanji: { sourcePath: "downloads/shin.tsv" },
                nihongo_sou_matome_kanji: { sourcePath: "downloads/sou.tsv" },
                try_jlpt_textbook: { sourcePath: "downloads/try.tsv" },
            },
        },
        sourceFiles: {
            shin_kanzen_master_kanji: { exists: true, rowCount: 100 },
            nihongo_sou_matome_kanji: { exists: false, rowCount: 0 },
            try_jlpt_textbook: { exists: false, rowCount: 0 },
        },
        sourceInputStatusCountsBySource: {
            shin_kanzen_master_kanji: {
                reviewed: 10,
                source_access_gap: 30,
                needs_review: 60,
            },
        },
        worklistRows: [
            { reviewPriority: "missing_japanese_published_source" },
            { reviewPriority: "missing_japanese_published_source" },
            { reviewPriority: "weak_evidence" },
        ],
    });

    assert.equal(report.noDeckMutation, true);
    assert.equal(report.worklist.dominantPriority, "missing_japanese_published_source");
    assert.deepEqual(report.lanes.map((lane) => `${lane.sourceId}:${lane.action}`).slice(0, 4), [
        "nihongo_sou_matome_kanji:source_access_spike_next",
        "shin_kanzen_master_kanji:pause_broad_review_until_exact_access",
        "try_jlpt_textbook:confirm_kanji_assignment_surface",
        "official_jlpt_sample_workbooks:positive_occurrence_only",
    ]);
    assert.equal(report.lanes[1].worksheet.sourceAccessGapRatio, "75.0%");
});

test("source-access decisions keep non-assignment and non-Japanese lanes out of the next Japanese textbook slot", () => {
    assert.equal(resolveSourceAccessDecision({
        source: {
            status: "active",
            sourceKind: "occurrence",
            positiveEvidenceOnly: true,
        },
    }).action, "positive_occurrence_only");

    assert.equal(resolveSourceAccessDecision({
        source: buildManualSource({
            japanesePublished: false,
        }),
    }).action, "secondary_non_japanese_signal");

    assert.equal(resolveSourceAccessDecision({
        source: {
            status: "active",
            sourceKind: "derived",
        },
    }).action, "derived_summary_only");
});

test("source-access audit counts worksheet review states with configured defaults", () => {
    const counts = countReviewStatuses([
        { reviewStatus: "reviewed" },
        { reviewStatus: "source_access_gap" },
        { reviewStatus: "" },
    ], {
        reviewStatusColumn: "reviewStatus",
        defaultReviewStatus: "needs_review",
    });

    assert.deepEqual(counts, {
        reviewed: 1,
        source_access_gap: 1,
        needs_review: 1,
    });
});

test("source-access CLI parsing and formatting stay read-only", () => {
    const options = parseArgs([
        "--source=nihongo_sou_matome_kanji",
        "--limit=5",
        "--json",
    ]);

    assert.equal(options.source, "nihongo_sou_matome_kanji");
    assert.equal(options.limit, 5);
    assert.equal(options.json, true);

    const text = formatJlptKanjiSourceAccessReport({
        noDeckMutation: true,
        sourceId: "nihongo_sou_matome_kanji",
        worklist: {
            totalRowsNeedingReview: 2,
            priorityCounts: { missing_japanese_published_source: 2 },
            dominantPriority: "missing_japanese_published_source",
        },
        recommended: [{
            sourceId: "nihongo_sou_matome_kanji",
            action: "source_access_spike_next",
            status: "planned",
            trackedAssignments: 0,
            worksheet: { reviewed: 0, sourceAccessGap: 0, pending: 0 },
            nextStep: "Verify source access first.",
        }],
        lanes: [],
    });

    assert.match(text, /Mode: read-only/);
    assert.match(text, /does not import evidence, move kanji, move words, update decks, or change readiness/);
    assert.match(text, /missing_japanese_published_source: 2/);
});

test("source-access file summary handles missing configured worksheets", () => {
    const summary = buildSourceFileSummaries({
        inputs: {
            missing_source: {
                sourcePath: "downloads/definitely-missing-source-access-test.tsv",
                format: "tsv",
                reviewStatusColumn: "reviewStatus",
            },
        },
    });

    assert.equal(summary.sourceFiles.missing_source.exists, false);
    assert.equal(summary.sourceFiles.missing_source.rowCount, 0);
    assert.deepEqual(summary.statusCountsBySource.missing_source, {});
});
