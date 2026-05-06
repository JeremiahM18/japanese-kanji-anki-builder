const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceBatchMerge,
} = require("../src/services/jlptKanjiSourceBatchService");
const {
    formatBatchMergeReport,
    parseArgs,
} = require("../scripts/mergeJlptKanjiSourceBatch");

function buildSourceConfig(overrides = {}) {
    return {
        sourceId: "fixture_source",
        sourcePath: "downloads/fixture.tsv",
        format: "tsv",
        kanjiColumn: "kanji",
        levelColumn: "level",
        reviewStatusColumn: "reviewStatus",
        citationColumn: "citation",
        evidenceRefColumn: "evidenceRef",
        notesColumn: "notes",
        defaultReviewStatus: "needs_review",
        requireCitation: true,
        requireEvidenceRef: true,
        levelMapping: "new-jlpt-n1-n5",
        ...overrides,
    };
}

test("source batch merge updates matching source rows while preserving worksheet order", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tneeds_review\t\t\t",
        "学\tN5\treviewed\tFixture citation\tfixture:学\tAlready reviewed",
        "雨\t\tneeds_review\t\t\t",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "雨\t\tblocked\t\t\tNot present in this source volume",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, true);
    assert.equal(result.sourceRowCount, 3);
    assert.equal(result.batchRowCount, 2);
    assert.equal(result.changedRowCount, 2);
    assert.equal(result.reviewedRowCount, 1);
    assert.equal(result.blockedRowCount, 1);
    assert.match(result.tsv, /^kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\n日\tN5\treviewed/m);
    assert.match(result.tsv, /学\tN5\treviewed\tFixture citation\tfixture:学\tAlready reviewed/);
    assert.match(result.tsv, /雨\t\tblocked\t\t\tNot present in this source volume/);
});

test("source batch merge rejects unsafe worksheet shape before writing", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tneeds_review\t\t\t",
        "学\t\tneeds_review\t\t\t",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\textra",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row\tbad",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tDuplicate fixture row\tbad",
        "火\tN5\tapproved\tFixture citation\tfixture:火\tUnknown fixture row\tbad",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("\n"), /unknown column: extra/);
    assert.match(result.blockers.join("\n"), /duplicate kanji row: 日/);
    assert.match(result.blockers.join("\n"), /火 is not present/);
    assert.match(result.blockers.join("\n"), /invalid reviewStatus: approved/);
});

test("source batch merge blocks accidental downgrade of reviewed source evidence", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tAlready reviewed",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tneeds_review\t\t\t",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("\n"), /would downgrade reviewed source evidence for 日/);
});

test("source batch merge script parses args and renders no-deck-mutation scope", () => {
    const options = parseArgs([
        "--source=shin_kanzen_master_kanji",
        "--batch=downloads/shin-kanzen-master-kanji-evidence-n5-batch-001.tsv",
        "--config=templates/custom.json",
        "--write",
        "--json",
    ]);

    assert.equal(options.source, "shin_kanzen_master_kanji");
    assert.equal(options.batch, "downloads/shin-kanzen-master-kanji-evidence-n5-batch-001.tsv");
    assert.equal(options.config, "templates/custom.json");
    assert.equal(options.write, true);
    assert.equal(options.json, true);

    const text = formatBatchMergeReport({
        valid: true,
        write: false,
        noDeckMutation: true,
        sourceId: "shin_kanzen_master_kanji",
        configPath: "templates/jlpt_kanji_source_inputs.json",
        sourcePath: "downloads/shin-kanzen-master-kanji-evidence.tsv",
        batchPath: "downloads/shin-kanzen-master-kanji-evidence-n5-batch-001.tsv",
        sourceRowCount: 2212,
        batchRowCount: 12,
        changedRowCount: 0,
        statusCounts: { needs_review: 12 },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Batch statuses: needs_review: 12/);
    assert.match(text, /does not import assignments, move kanji, move words, update decks, or change readiness/);
});
