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

test("legacy KANJIDIC2 level mapping refuses old level 2 instead of guessing N2 or N3", () => {
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
    assert.match(oldLevelTwo.reason, /spans modern N2\/N3/);
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
