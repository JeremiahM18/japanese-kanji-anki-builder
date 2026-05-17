const test = require("node:test");
const assert = require("node:assert/strict");

const {
    loadWordSourceManifest,
    parseWordSourceManifest,
} = require("../src/datasets/wordSourceManifest");

function buildManifest(overrides = {}) {
    return {
        version: 1,
        checkedAt: "2026-05-11",
        sourcePurposeRules: {
            community_web_list: {
                description: "Discovery only.",
                allowedUse: ["candidate-discovery", "level-hint"],
                disallowedUse: ["card-approval"],
            },
        },
        sources: {
            fixture: {
                name: "Fixture source",
                tier: 4,
                status: "active",
                sourceType: "community_web_list",
                origin: {
                    url: "https://example.com/fixture",
                    localPath: "downloads/fixture.tsv",
                },
                licenseUse: {
                    status: "needs_review",
                    notes: "Fixture only.",
                },
                checkedAt: "2026-05-11",
                local: {
                    path: "downloads/fixture.tsv",
                    format: "tsv",
                    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    byteSize: 128,
                    rowCount: 2,
                    columns: ["written", "reading", "jlpt"],
                },
                intendedUse: ["candidate-discovery"],
                allowedUse: ["candidate-discovery"],
                disallowedUse: ["card-approval"],
                candidatePolicy: {
                    levels: [5],
                    kanjiScope: "known-jlpt",
                    requireSourceLevel: true,
                },
                ...overrides.source,
            },
        },
        ...overrides.manifest,
    };
}

test("parseWordSourceManifest validates source-purpose rules and active local pins", () => {
    const parsed = parseWordSourceManifest(buildManifest());
    assert.equal(parsed.sources.fixture.status, "active");
    assert.equal(parsed.sources.fixture.candidatePolicy.kanjiScope, "known-jlpt");

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            allowedUse: ["card-approval"],
            disallowedUse: [],
        },
    })), /allows card-approval/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            allowedUse: ["candidate-discovery"],
            disallowedUse: ["candidate-discovery"],
        },
    })), /both allows and disallows/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            local: undefined,
        },
    })), /must pin a local source path/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            local: {
                path: "downloads/fixture.tsv",
                format: "tsv",
                columns: ["written", "reading"],
            },
        },
    })), /missing local integrity pin/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            candidatePolicy: undefined,
        },
    })), /must declare candidatePolicy/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            candidatePolicy: {
                levels: [],
                kanjiScope: "known-jlpt",
                requireSourceLevel: true,
            },
        },
    })), /must declare candidatePolicy\.levels/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            local: {
                path: "downloads/fixture.tsv",
                format: "tsv",
                sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                byteSize: 128,
                rowCount: 2,
                columns: ["written"],
            },
        },
    })), /missing required local column\(s\): reading, jlpt/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            status: "blocked",
            allowedUse: ["candidate-discovery"],
        },
    })), /Blocked word source fixture must not allow active use/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            licenseUse: {
                status: "blocked",
                notes: "Fixture blocked.",
            },
        },
    })), /cannot have blocked license/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        manifest: {
            sourcePurposeRules: {
                community_web_list: {
                    description: "Conflicting rule.",
                    allowedUse: ["candidate-discovery"],
                    disallowedUse: ["candidate-discovery"],
                },
            },
        },
    })), /purpose rule community_web_list both allows and disallows/);
});

test("tracked word source manifest loads", () => {
    const manifest = loadWordSourceManifest("templates/word_source_manifest.json");
    assert.equal(manifest.sources["jlptstudy.net-n5"].status, "active");
    assert.equal(manifest.sources["tanos-n3-vocab"].status, "registered");
    assert.deepEqual(manifest.sources["tanos-n3-vocab"].candidatePolicy.levels, [3]);
    assert.deepEqual(manifest.sources["tanos-n3-vocab"].allowedUse, []);
    assert.equal(manifest.sources["tanos-n2-vocab"].status, "registered");
    assert.deepEqual(manifest.sources["tanos-n2-vocab"].candidatePolicy.levels, [2]);
    assert.deepEqual(manifest.sources["tanos-n2-vocab"].allowedUse, []);
    assert.equal(manifest.sources["jpdb-frequency"].status, "blocked");
    assert.equal(manifest.sources.jmdict.status, "active");
    assert.equal(manifest.sources["jmdict-priority-commonness"].status, "active");
    assert.deepEqual(manifest.sourcePurposeRules.dictionary.allowedUse, [
        "dictionary-verification",
        "reading-verification",
        "meaning-verification",
    ]);
    assert.deepEqual(manifest.sourcePurposeRules.dictionary_priority.allowedUse, [
        "frequency-sanity",
        "usefulness-support",
    ]);
});
