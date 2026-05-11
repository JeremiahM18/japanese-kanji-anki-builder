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
                    columns: ["written", "reading"],
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
        },
    })), /allows card-approval/);

    assert.throws(() => parseWordSourceManifest(buildManifest({
        source: {
            local: undefined,
        },
    })), /must pin a local source path/);
});

test("tracked word source manifest loads", () => {
    const manifest = loadWordSourceManifest("templates/word_source_manifest.json");
    assert.equal(manifest.sources["jlptstudy.net-n5"].status, "active");
    assert.equal(manifest.sources["jpdb-frequency"].status, "needs_review");
    assert.deepEqual(manifest.sourcePurposeRules.dictionary.allowedUse, [
        "dictionary-verification",
        "reading-verification",
        "meaning-verification",
    ]);
});
