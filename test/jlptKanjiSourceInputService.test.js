const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptKanjiSourceInputReport,
    buildSourceFileIntegrity,
    normalizeInputLevel,
    parseSourceAssignmentRows,
} = require("../src/services/jlptKanjiSourceInputService");
const {
    formatJlptKanjiSourceInputsReport,
    parseArgs,
} = require("../scripts/reportJlptKanjiSourceInputs");
const { normalizeJlptKanjiSourceInputs } = require("../src/datasets/jlptKanjiSourceInputs");

function buildEvidence(source = {}) {
    return {
        sources: {
            fixture_source: {
                name: "Fixture Source",
                status: "active",
                licenseStatus: "approved",
                ...source,
            },
        },
    };
}

function buildSourceConfig(text, overrides = {}) {
    const buffer = Buffer.from(text, "utf8");
    const rows = parseSourceAssignmentRows(text, overrides.format || "tsv");
    const integrity = buildSourceFileIntegrity({ sourceBuffer: buffer, sourceRows: rows });
    return {
        sourceId: "fixture_source",
        sourcePath: "downloads/fixture.tsv",
        sourceLabel: "fixture-source",
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
        sha256: integrity.sha256,
        byteSize: integrity.byteSize,
        rowCount: integrity.rowCount,
        ...overrides,
    };
}

test("source input preflight accepts pinned reviewed source rows without deck mutation", () => {
    const text = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row",
        "学\t4\treviewed\tFixture citation\tfixture:学\tObserved fixture row",
    ].join("\n");
    const sourceConfig = buildSourceConfig(text);

    const report = buildJlptKanjiSourceInputReport({
        sourceId: "fixture_source",
        sourceConfig,
        sourceBuffer: Buffer.from(text, "utf8"),
        contract: { kanjiLevels: { 日: 5, 学: 5 } },
        evidence: buildEvidence(),
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, true);
    assert.equal(report.noDeckMutation, true);
    assert.equal(report.reviewedAssignmentCount, 2);
    assert.deepEqual(report.assignments.日, {
        level: 5,
        reviewStatus: "reviewed",
        citation: "Fixture citation",
        evidenceRef: "fixture:日",
        notes: "Observed fixture row",
    });
    assert.equal(report.assignments.学.level, 4);
});

test("source input preflight accepts explicit level-range evidence", () => {
    const text = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "橋\tN2/N3\treviewed\tFixture citation\tfixture:橋\tAmbiguous old level 2 range",
    ].join("\n");
    const sourceConfig = buildSourceConfig(text);

    const report = buildJlptKanjiSourceInputReport({
        sourceId: "fixture_source",
        sourceConfig,
        sourceBuffer: Buffer.from(text, "utf8"),
        contract: { kanjiLevels: { 橋: 2 } },
        evidence: buildEvidence(),
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, true);
    assert.deepEqual(report.assignments.橋.levelRange, [2, 3]);
    assert.equal(report.assignments.橋.level, undefined);
});

test("source input preflight keeps blank worksheet rows pending instead of rejected", () => {
    const text = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes",
        "日\tN5\treviewed\tFixture citation\tfixture:日\tObserved fixture row",
        "学\t\tneeds_review\t\t\t",
        "橋\t\tblocked\t\t\tOut of scope for this source batch",
    ].join("\n");
    const sourceConfig = buildSourceConfig(text);

    const report = buildJlptKanjiSourceInputReport({
        sourceId: "fixture_source",
        sourceConfig,
        sourceBuffer: Buffer.from(text, "utf8"),
        contract: { kanjiLevels: { 日: 5, 学: 5, 橋: 2 } },
        evidence: buildEvidence(),
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, true);
    assert.equal(report.reviewedAssignmentCount, 1);
    assert.equal(report.pendingRowCount, 1);
    assert.equal(report.blockedRowCount, 1);
    assert.equal(report.rejectedRowCount, 0);
    assert.deepEqual(Object.keys(report.assignments), ["日"]);
});

test("source input preflight rejects bad rows before they become source evidence", () => {
    const text = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef",
        "x\tN5\treviewed\tFixture citation\tfixture:x",
        "日\tN6\treviewed\tFixture citation\tfixture:日",
        "学\tN5\treviewed\t\tfixture:学",
    ].join("\n");
    const sourceConfig = buildSourceConfig(text);

    const report = buildJlptKanjiSourceInputReport({
        sourceId: "fixture_source",
        sourceConfig,
        sourceBuffer: Buffer.from(text, "utf8"),
        contract: { kanjiLevels: { 日: 5, 学: 5 } },
        evidence: buildEvidence(),
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, false);
    assert.equal(report.reviewedAssignmentCount, 0);
    assert.equal(report.rejectedRowCount, 3);
    assert.match(report.rejectedRows[0].issues.join("\n"), /outside the current JLPT kanji contract/);
    assert.match(report.rejectedRows[1].issues.join("\n"), /invalid JLPT level/);
    assert.match(report.rejectedRows[2].issues.join("\n"), /missing citation/);
});

test("legacy KANJIDIC2 level mapping preserves old level 2 as N2/N3 range evidence", () => {
    assert.deepEqual(normalizeInputLevel("4", "kanjidic2-legacy-jlpt"), {
        level: 5,
        reason: null,
    });
    assert.deepEqual(normalizeInputLevel("3", "kanjidic2-legacy-jlpt"), {
        level: 4,
        reason: null,
    });
    assert.deepEqual(normalizeInputLevel("1", "kanjidic2-legacy-jlpt"), {
        level: 1,
        reason: null,
    });

    const oldLevelTwo = normalizeInputLevel("2", "kanjidic2-legacy-jlpt");
    assert.equal(oldLevelTwo.level, null);
    assert.deepEqual(oldLevelTwo.levelRange, [2, 3]);
    assert.equal(oldLevelTwo.reason, null);
});

test("source input preflight blocks unpinned or unactivated source files", () => {
    const text = [
        "kanji\tlevel\treviewStatus\tcitation\tevidenceRef",
        "日\tN5\treviewed\tFixture citation\tfixture:日",
    ].join("\n");
    const sourceConfig = {
        ...buildSourceConfig(text),
        sha256: "0".repeat(64),
    };

    const report = buildJlptKanjiSourceInputReport({
        sourceId: "fixture_source",
        sourceConfig,
        sourceBuffer: Buffer.from(text, "utf8"),
        contract: { kanjiLevels: { 日: 5 } },
        evidence: buildEvidence({
            status: "planned",
            licenseStatus: "needs_review",
        }),
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, false);
    assert.match(report.blockers.join("\n"), /license is needs_review/);
    assert.match(report.blockers.join("\n"), /is planned/);
    assert.match(report.blockers.join("\n"), /sha256 mismatch/);
});

test("source input report script parses args and renders read-only scope", () => {
    const options = parseArgs([
        "--source=fixture_source",
        "--config=templates/custom.json",
        "--json",
        "--strict",
        "--limit=3",
    ]);

    assert.equal(options.source, "fixture_source");
    assert.equal(options.config, "templates/custom.json");
    assert.equal(options.json, true);
    assert.equal(options.strict, true);
    assert.equal(options.limit, 3);

    const text = formatJlptKanjiSourceInputsReport({
        valid: false,
        configPath: "templates/custom.json",
        contractPath: "templates/jlpt_level_contract.json",
        evidencePath: "templates/jlpt_kanji_source_evidence.json",
        reports: [{
            sourceId: "fixture_source",
            valid: false,
            sourcePath: "downloads/fixture.tsv",
            rowCount: 0,
            reviewedAssignmentCount: 0,
            rejectedRowCount: 0,
            noDeckMutation: true,
            blockers: ["source file is missing"],
            rejectedRows: [],
        }],
    }, 3);

    assert.match(text, /read-only/);
    assert.match(text, /does not move kanji, move words, update decks, or change readiness/);
    assert.match(text, /source file is missing/);
});

test("source input manifest can declare planned restricted textbook source lanes", () => {
    const manifest = normalizeJlptKanjiSourceInputs({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            shin_kanzen_master_kanji: {
                sourceId: "shin_kanzen_master_kanji",
                sourcePath: "downloads/shin-kanzen-master-kanji-evidence.tsv",
                sourceLabel: "shin-kanzen-master-kanji-reviewed-evidence",
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
                integrityPolicy: "Individual textbook source only.",
            },
        },
    });

    const input = manifest.inputs.shin_kanzen_master_kanji;
    assert.equal(input.sourcePath, "downloads/shin-kanzen-master-kanji-evidence.tsv");
    assert.equal(input.levelColumn, "level");
    assert.equal(input.requireCitation, true);
    assert.equal(input.requireEvidenceRef, true);
    assert.equal(input.sha256, undefined);
    assert.equal(input.byteSize, undefined);
    assert.equal(input.rowCount, undefined);
});

test("source input manifest can declare a restricted manual JLPT Sensei lane", () => {
    const manifest = normalizeJlptKanjiSourceInputs({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            jlptsensei: {
                sourceId: "jlptsensei",
                sourcePath: "downloads/jlptsensei-kanji-evidence.tsv",
                sourceLabel: "jlptsensei-reviewed-kanji-evidence",
                sourceUrl: "https://jlptsensei.com/",
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
                integrityPolicy: "Manual JLPT Sensei evidence only.",
            },
        },
    });

    const input = manifest.inputs.jlptsensei;
    assert.equal(input.sourcePath, "downloads/jlptsensei-kanji-evidence.tsv");
    assert.equal(input.sourceUrl, "https://jlptsensei.com/");
    assert.equal(input.defaultReviewStatus, "needs_review");
    assert.equal(input.sha256, undefined);
});
