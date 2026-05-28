const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildJlptKanjiSourceBatchMerge,
} = require("../src/services/jlptKanjiSourceBatchService");
const {
    buildSourceAccessPacket,
    formatSourceAccessPacketJson,
} = require("../src/services/jlptKanjiSourceAccessPacketService");
const {
    formatBatchMergeReport,
    parseArgs,
    run: runBatchMerge,
} = require("../scripts/mergeJlptKanjiSourceBatch");

function buildSourceConfig(overrides = {}) {
    return {
        sourceId: "fixture_source",
        sourcePath: "downloads/fixture.tsv",
        sourceLabel: "Fixture Source",
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
        "月\t\tneeds_review\t\t\t",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "雨\t\tblocked\t\t\tNot present in this source volume",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row",
        "月\t\tsource_access_gap\t\t\tChecked permitted fixture material; exact source-level proof is not available yet",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, true);
    assert.equal(result.sourceRowCount, 4);
    assert.equal(result.batchRowCount, 3);
    assert.equal(result.changedRowCount, 3);
    assert.equal(result.reviewedRowCount, 1);
    assert.equal(result.blockedRowCount, 1);
    assert.equal(result.sourceAccessGapRowCount, 1);
    assert.match(result.tsv, /^kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\n日\tN5\treviewed/m);
    assert.match(result.tsv, /学\tN5\treviewed\tFixture citation\tfixture:学\tAlready reviewed/);
    assert.match(result.tsv, /雨\t\tblocked\t\t\tNot present in this source volume/);
    assert.match(result.tsv, /月\t\tsource_access_gap\t\t\tChecked permitted fixture material/);
});

test("source batch merge can append new sparse worksheet rows when explicitly allowed", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "学\tN5\treviewed\tFixture citation\tfixture:学\tAlready reviewed",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        allowAdditions: true,
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, true);
    assert.equal(result.sourceRowCount, 1);
    assert.equal(result.batchRowCount, 1);
    assert.equal(result.addedRowCount, 1);
    assert.equal(result.changedRowCount, 1);
    assert.match(result.tsv, /学\tN5\treviewed\tFixture citation\tfixture:学\tAlready reviewed/);
    assert.match(result.tsv, /日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row/);
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

test("source batch merge rejects reviewed table-of-contents assignment evidence", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tneeds_review\t\t\t",
        "月\t\tneeds_review\t\t\t",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture table of contents\tfixture:toc\tVisible in table of contents",
        "月\t\tsource_access_gap\tFixture table of contents\tfixture:toc\tChecked table of contents; exact assignment proof unavailable",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("\n"), /table-of-contents evidence for reviewed assignment 日/);
    assert.doesNotMatch(result.blockers.join("\n"), /reviewed assignment 月/);
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

test("source batch merge blocks silent replacement of reviewed source evidence", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture exact N5 citation\tfixture:n5\tAlready reviewed from exact N5 surface",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN4\treviewed\tFixture exact N4 citation\tfixture:n4\tDifferent reviewed assignment",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("\n"), /would replace reviewed source evidence for 日/);
    assert.match(result.blockers.join("\n"), /first downgrade the old row to source_access_gap or blocked with a correction reason/);
});

test("source batch merge allows deliberate reviewed evidence corrections with a reason", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tAlready reviewed from weak surface",
        "月\tN5\treviewed\tFixture citation\tfixture:月\tAlready reviewed from exact surface",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tsource_access_gap\tFixture citation\tfixture:日\tCorrected: inspected surface is not exact assignment proof",
    ].join("\n");

    const missingReason = buildJlptKanjiSourceBatchMerge({
        allowReviewedDowngrades: true,
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });
    assert.equal(missingReason.valid, false);
    assert.match(missingReason.blockers.join("\n"), /needs --reviewed-downgrade-reason/);

    const result = buildJlptKanjiSourceBatchMerge({
        allowReviewedDowngrades: true,
        reviewedDowngradeReason: "Correct weak table-of-contents evidence to non-voting source_access_gap.",
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, true);
    assert.equal(result.reviewedDowngradeCount, 1);
    assert.match(result.reviewedDowngradeReason, /table-of-contents/);
    assert.match(result.tsv, /日\t\tsource_access_gap\tFixture citation\tfixture:日\tCorrected:/);
    assert.match(result.tsv, /月\tN5\treviewed\tFixture citation\tfixture:月\tAlready reviewed from exact surface/);
});

test("source batch merge rejects deliberate reviewed downgrades back to pending", () => {
    const sourceText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tAlready reviewed",
    ].join("\n");
    const batchText = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\t\tneeds_review\t\t\t",
    ].join("\n");

    const result = buildJlptKanjiSourceBatchMerge({
        allowReviewedDowngrades: true,
        reviewedDowngradeReason: "Correction requires a non-voting resolved status.",
        sourceConfig: buildSourceConfig(),
        sourceText,
        batchText,
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("\n"), /can only downgrade reviewed source evidence for 日 to blocked or source_access_gap/);
});

test("source batch merge script parses args and renders no-deck-mutation scope", () => {
    const options = parseArgs([
        "--source=shin_kanzen_master_kanji",
        "--batch=downloads/shin-kanzen-master-kanji-evidence-n5-batch-001.tsv",
        "--config=templates/custom.json",
        "--source-access-packet=downloads/source-access-packets/shin.json",
        "--allow-additions",
        "--allow-reviewed-downgrade",
        "--reviewed-downgrade-reason=Correct weak evidence",
        "--write",
        "--json",
    ]);

    assert.equal(options.source, "shin_kanzen_master_kanji");
    assert.equal(options.batch, "downloads/shin-kanzen-master-kanji-evidence-n5-batch-001.tsv");
    assert.equal(options.config, "templates/custom.json");
    assert.equal(options.sourceAccessPacket, "downloads/source-access-packets/shin.json");
    assert.equal(options.allowAdditions, true);
    assert.equal(options.allowReviewedDowngrades, true);
    assert.equal(options.reviewedDowngradeReason, "Correct weak evidence");
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
        sourceAccessPacketPath: "downloads/source-access-packets/shin.json",
        sourceRowCount: 2212,
        batchRowCount: 12,
        changedRowCount: 0,
        statusCounts: { needs_review: 11, source_access_gap: 1 },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Source access packet: downloads\/source-access-packets\/shin\.json/);
    assert.match(text, /Added source rows: 0/);
    assert.match(text, /Reviewed evidence downgrades: 0/);
    assert.match(text, /Batch statuses: needs_review: 11, source_access_gap: 1/);
    assert.match(text, /does not import assignments, move kanji, move words, update decks, or change readiness/);
});

test("source batch merge script requires a source-access packet for 100-row batches", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-batch-packet-"));
    const sourcePath = path.join(tmpDir, "source.tsv");
    const batchPath = path.join(tmpDir, "batch.tsv");
    const configPath = path.join(tmpDir, "inputs.json");
    const packetPath = path.join(tmpDir, "packet.json");
    const header = "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes";
    const kanji = Array.from({ length: 100 }, (_, index) => String.fromCodePoint(0x4E00 + index));
    const sourceRows = kanji.map((character) => `${character}\t\tneeds_review\t\t\t`);
    const batchRows = kanji.map((character) => [
        character,
        "N3",
        "reviewed",
        "Fixture exact kanji table",
        `fixture:${character}`,
        "Observed exact source-level assignment row",
    ].join("\t"));

    fs.writeFileSync(sourcePath, [header, ...sourceRows].join("\n"), "utf8");
    fs.writeFileSync(batchPath, [header, ...batchRows].join("\n"), "utf8");
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: false,
            requireKnownEvidenceSource: false,
        },
        inputs: {
            fixture_source: buildSourceConfig({
                sourcePath,
            }),
        },
    }, null, 2), "utf8");

    const blocked = runBatchMerge({
        config: configPath,
        source: "fixture_source",
        batch: batchPath,
    });
    assert.equal(blocked.valid, false);
    assert.match(blocked.blockers.join("\n"), /source-access packet path is required/);

    fs.writeFileSync(packetPath, formatSourceAccessPacketJson(buildSourceAccessPacket({
        sourceId: "fixture_source",
        checkedAt: "2026-05-09",
        sourceSurface: {
            type: "exact-kanji-table",
            title: "Fixture exact kanji table",
            citation: "Fixture source exact kanji table",
            evidenceRef: "fixture:exact-kanji-table",
            notes: "Fixture rows are exact source-level assignments.",
        },
    })), "utf8");

    const passing = runBatchMerge({
        config: configPath,
        source: "fixture_source",
        batch: batchPath,
        sourceAccessPacket: packetPath,
    });
    assert.equal(passing.valid, true);
    assert.equal(passing.batchRowCount, 100);
    assert.equal(passing.sourceAccessPacket.sourceSurface.type, "exact-kanji-table");
});

test("source batch merge script does not require an exact-proof packet for large non-voting corrections", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-batch-correction-"));
    const sourcePath = path.join(tmpDir, "source.tsv");
    const batchPath = path.join(tmpDir, "batch.tsv");
    const configPath = path.join(tmpDir, "inputs.json");
    const header = "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes";
    const kanji = Array.from({ length: 100 }, (_, index) => String.fromCodePoint(0x4E00 + index));
    const sourceRows = kanji.map((character) => [
        character,
        "N3",
        "reviewed",
        "Fixture weak table of contents",
        `fixture:${character}`,
        "Previously reviewed from weak source surface",
    ].join("\t"));
    const batchRows = kanji.map((character) => [
        character,
        "",
        "source_access_gap",
        "Fixture weak table of contents",
        `fixture:${character}`,
        "Corrected: permitted surface was checked, but it is not exact assignment proof",
    ].join("\t"));

    fs.writeFileSync(sourcePath, [header, ...sourceRows].join("\n"), "utf8");
    fs.writeFileSync(batchPath, [header, ...batchRows].join("\n"), "utf8");
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: false,
            requireKnownEvidenceSource: false,
        },
        inputs: {
            fixture_source: buildSourceConfig({
                sourcePath,
            }),
        },
    }, null, 2), "utf8");

    const result = runBatchMerge({
        config: configPath,
        source: "fixture_source",
        batch: batchPath,
        allowReviewedDowngrades: true,
        reviewedDowngradeReason: "Correct weak source surface rows to source_access_gap.",
    });

    assert.equal(result.valid, true);
    assert.equal(result.batchRowCount, 100);
    assert.equal(result.reviewedRowCount, 0);
    assert.equal(result.sourceAccessGapRowCount, 100);
    assert.equal(result.reviewedDowngradeCount, 100);
    assert.equal(result.sourceAccessPacket, null);
});
