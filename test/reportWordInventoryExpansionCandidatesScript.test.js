const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
    DEFAULT_WORD_SOURCE_MANIFEST,
    formatMissingManifestSourceError,
    getActiveCandidateDiscoverySources,
    getInactiveCandidateDiscoverySourcesForLevel,
    loadTriageDecisions,
    parseArgs,
    resolveManifestPath,
    resolveManifestSourceForPath,
    resolveSourcePath,
    resolveTriagePath,
    validateManifestSourceFile,
} = require("../scripts/reportWordInventoryExpansionCandidates");

test("parseArgs supports expansion candidate report options", () => {
    assert.deepEqual(parseArgs([
        "--level=4",
        "--source=downloads/n4.tsv",
        "--source-label=fixture",
        "--format=tsv",
        "--kanji-scope=target-level",
        "--limit=25",
        "--triage=templates/triage.json",
        "--require-source-level",
        "--json",
    ]), {
        format: "tsv",
        json: true,
        kanjiScope: "target-level",
        kanjiScopeExplicit: true,
        level: 4,
        limit: 25,
        manifest: DEFAULT_WORD_SOURCE_MANIFEST,
        requireSourceLevel: true,
        requireSourceLevelExplicit: true,
        source: "downloads/n4.tsv",
        sourceLabel: "fixture",
        triage: "templates/triage.json",
        unknownArgs: [],
    });
});

test("resolveSourcePath requires an explicit source file", () => {
    assert.throws(() => resolveSourcePath(""), /Missing --source path/);
    assert.equal(resolveSourcePath("fixture.tsv"), path.resolve(process.cwd(), "fixture.tsv"));
});

test("resolveSourcePath can use the tracked manifest candidate source for a level", () => {
    const manifest = {
        sources: {
            "fixture-n4": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                local: { path: "downloads/n4-vocab.tsv" },
                candidatePolicy: { levels: [4] },
            },
            "fixture-n5": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                local: { path: "downloads/n5-vocab.tsv" },
                candidatePolicy: { levels: [5] },
            },
        },
    };

    assert.equal(
        resolveSourcePath("", { manifest, level: 4 }),
        path.resolve(process.cwd(), "downloads", "n4-vocab.tsv")
    );
});

test("resolveSourcePath explains missing manifest candidate sources by level", () => {
    const manifest = {
        sources: {
            "fixture-n4": {
                status: "active",
                allowedUse: ["candidate-discovery"],
                local: { path: "downloads/n4-vocab.tsv" },
                candidatePolicy: { levels: [4] },
            },
            "registered-future-n3": {
                status: "registered",
                intendedUse: ["candidate-discovery"],
                allowedUse: [],
                origin: { localPath: "downloads/n3-vocab.tsv" },
                candidatePolicy: { levels: [3] },
            },
            "registered-future-n2-n1": {
                status: "registered",
                intendedUse: ["candidate-discovery"],
                allowedUse: [],
                origin: { localPath: "downloads/n2-n1-vocab.tsv" },
                candidatePolicy: { levels: [2, 1] },
            },
        },
    };

    assert.equal(getActiveCandidateDiscoverySources(manifest).length, 1);
    assert.equal(getInactiveCandidateDiscoverySourcesForLevel(manifest, 3).length, 1);
    for (const level of [3, 2, 1]) {
        assert.throws(
            () => resolveSourcePath("", { manifest, manifestPath: "templates/word_source_manifest.json", level }),
            new RegExp(`No active candidate-discovery word source is registered for N${level}`)
        );
    }
    assert.match(
        formatMissingManifestSourceError({ manifest, manifestPath: "templates/word_source_manifest.json", level: 3 }),
        /fixture-n4 \(N4; downloads\/n4-vocab.tsv\)/
    );
    assert.match(
        formatMissingManifestSourceError({ manifest, manifestPath: "templates/word_source_manifest.json", level: 3 }),
        /registered-future-n3 \(registered; N3; downloads\/n3-vocab.tsv\)/
    );
});

test("resolveManifestSourceForPath finds tracked local source ids", () => {
    const manifest = {
        sources: {
            "fixture-n4": {
                local: { path: "downloads/n4-vocab.tsv" },
            },
        },
    };
    const resolved = resolveManifestSourceForPath(
        manifest,
        path.resolve(process.cwd(), "downloads", "n4-vocab.tsv")
    );

    assert.equal(resolveManifestPath("templates/word_source_manifest.json"), path.resolve(process.cwd(), "templates", "word_source_manifest.json"));
    assert.equal(resolved.sourceId, "fixture-n4");
});

test("validateManifestSourceFile reports tracked integrity mismatches", () => {
    const blockers = validateManifestSourceFile({
        manifestSource: {
            sourceId: "fixture",
            sourceConfig: {
                local: {
                    sha256: "bad",
                    byteSize: 1,
                    rowCount: 99,
                },
            },
        },
        sourceBuffer: Buffer.from("word\treading\n山\tやま\n", "utf8"),
        sourceRows: [{ word: "山", reading: "やま" }],
    });

    assert.equal(blockers.length, 3);
    assert.match(blockers[0], /sha256 mismatch/);
});

test("resolveTriagePath defaults to the tracked expansion triage file", () => {
    assert.equal(
        resolveTriagePath("templates/triage.json"),
        path.resolve(process.cwd(), "templates", "triage.json")
    );
    assert.equal(
        resolveTriagePath(""),
        path.resolve(process.cwd(), "templates", "word_inventory_expansion_triage.json")
    );
});

test("loadTriageDecisions selects decisions by level and source label", () => {
    const decisions = loadTriageDecisions({
        triagePath: "templates/word_inventory_expansion_triage.json",
        level: 5,
        sourceLabel: "jlptstudy.net-n5",
    });

    assert.equal(decisions["男の子|おとこのこ"].decision, "keep_candidate");
    assert.equal(decisions["行く|ゆく"].decision, "reject_candidate");
});
