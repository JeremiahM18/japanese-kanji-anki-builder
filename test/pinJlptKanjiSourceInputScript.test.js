const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    formatPinReport,
    parseArgs,
    run,
} = require("../scripts/pinJlptKanjiSourceInput");

function writeFixtureConfig(tmpDir, sourceText, pins = {}) {
    const downloadsDir = path.join(tmpDir, "downloads");
    fs.mkdirSync(downloadsDir, { recursive: true });
    const sourcePath = path.join(downloadsDir, "source.tsv");
    fs.writeFileSync(sourcePath, sourceText, "utf8");
    const configPath = path.join(tmpDir, "source-inputs.json");
    fs.writeFileSync(configPath, `${JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            fixture_source: {
                sourceId: "fixture_source",
                sourcePath: path.relative(tmpDir, sourcePath).replace(/\\/g, "/"),
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
                checkedAt: "2026-05-01",
                sha256: "0".repeat(64),
                byteSize: 1,
                rowCount: 1,
                integrityPolicy: "Preserve this exact policy text.",
                ...pins,
            },
        },
    }, null, 2)}\n`, "utf8");
    return { configPath, sourcePath };
}

test("pinJlptKanjiSourceInput parses write metadata", () => {
    const options = parseArgs([
        "--source=fixture_source",
        "--config=templates/custom.json",
        "--checked-at=2026-05-07",
        "--reason=merged reviewed batch",
        "--write",
        "--json",
    ]);

    assert.equal(options.source, "fixture_source");
    assert.equal(options.config, "templates/custom.json");
    assert.equal(options.checkedAt, "2026-05-07");
    assert.equal(options.reason, "merged reviewed batch");
    assert.equal(options.write, true);
    assert.equal(options.json, true);
});

test("pinJlptKanjiSourceInput dry-runs changed source integrity pins", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-pin-"));
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    try {
        const { configPath } = writeFixtureConfig(
            tmpDir,
            "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\n日\tN5\treviewed\tFixture citation\tfixture:日\tFixture notes\n"
        );
        const result = run({
            config: configPath,
            source: "fixture_source",
            checkedAt: "2026-05-07",
            reason: "merged fixture batch",
            write: false,
        });

        assert.equal(result.valid, true);
        assert.equal(result.changed, true);
        assert.equal(result.next.rowCount, 1);
        assert.notEqual(result.next.sha256, "0".repeat(64));
        const manifest = JSON.parse(fs.readFileSync(configPath, "utf8"));
        assert.equal(manifest.inputs.fixture_source.sha256, "0".repeat(64));
    } finally {
        process.chdir(previousCwd);
    }
});

test("pinJlptKanjiSourceInput writes only pin fields and checkedAt", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-pin-"));
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    try {
        const { configPath } = writeFixtureConfig(
            tmpDir,
            "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\n日\tN5\treviewed\tFixture citation\tfixture:日\tFixture notes\n"
        );
        const before = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const result = run({
            config: configPath,
            source: "fixture_source",
            checkedAt: "2026-05-07",
            reason: "merged fixture batch",
            write: true,
        });
        const after = JSON.parse(fs.readFileSync(configPath, "utf8"));

        assert.equal(result.valid, true);
        assert.equal(result.changed, true);
        assert.equal(after.inputs.fixture_source.checkedAt, "2026-05-07");
        assert.equal(after.inputs.fixture_source.byteSize, result.next.byteSize);
        assert.equal(after.inputs.fixture_source.rowCount, 1);
        assert.equal(after.inputs.fixture_source.integrityPolicy, before.inputs.fixture_source.integrityPolicy);
        assert.equal(after.inputs.fixture_source.sourcePath, before.inputs.fixture_source.sourcePath);
        assert.equal(after.inputs.fixture_source.levelColumn, before.inputs.fixture_source.levelColumn);
    } finally {
        process.chdir(previousCwd);
    }
});

test("pinJlptKanjiSourceInput blocks write without reason and unchanged writes", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "source-pin-"));
    const previousCwd = process.cwd();
    process.chdir(tmpDir);
    try {
        const sourceText = "kanji\tlevel\treviewStatus\tcitation\tevidenceRef\tnotes\n日\tN5\treviewed\tFixture citation\tfixture:日\tFixture notes\n";
        const { configPath } = writeFixtureConfig(tmpDir, sourceText);
        const first = run({
            config: configPath,
            source: "fixture_source",
            checkedAt: "2026-05-07",
            reason: "merged fixture batch",
            write: true,
        });
        assert.equal(first.valid, true);

        const missingReason = run({
            config: configPath,
            source: "fixture_source",
            checkedAt: "2026-05-08",
            reason: "",
            write: true,
        });
        assert.equal(missingReason.valid, false);
        assert.match(missingReason.blockers.join("\n"), /requires --reason/);
        assert.match(missingReason.blockers.join("\n"), /already match/);

        const unchanged = run({
            config: configPath,
            source: "fixture_source",
            checkedAt: "2026-05-08",
            reason: "try to churn date only",
            write: true,
        });
        assert.equal(unchanged.valid, false);
        assert.match(unchanged.blockers.join("\n"), /already match/);
    } finally {
        process.chdir(previousCwd);
    }
});

test("formatPinReport states no deck mutation scope", () => {
    const text = formatPinReport({
        sourceId: "fixture_source",
        write: false,
        valid: true,
        changed: true,
        configPath: "templates/jlpt_kanji_source_inputs.json",
        sourcePath: "downloads/source.tsv",
        reason: "fixture",
        current: { sha256: "a", byteSize: 1, rowCount: 1, checkedAt: "2026-05-01" },
        next: { sha256: "b", byteSize: 2, rowCount: 1, checkedAt: "2026-05-07" },
    });

    assert.match(text, /Mode: dry-run/);
    assert.match(text, /Changed pins: yes/);
    assert.match(text, /does not import assignments, move kanji, move words, update decks, or change readiness/);
});
