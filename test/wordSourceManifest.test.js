const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
    assert.equal(manifest.sources["tanos-n3-vocab"].status, "active");
    assert.deepEqual(manifest.sources["tanos-n3-vocab"].candidatePolicy.levels, [3]);
    assert.deepEqual(manifest.sources["tanos-n3-vocab"].allowedUse, ["candidate-discovery", "level-hint"]);
    assert.equal(manifest.sources["tanos-n3-vocab"].local.rowCount, 1841);
    assert.equal(manifest.sources["tanos-n3-vocab"].local.sha256, "2539f7e2d4090533d5c902abddac4b9a7967319eef7a5cd0c7c6e0c716ea624e");
    assert.equal(manifest.sources["tanos-n2-vocab"].status, "active");
    assert.deepEqual(manifest.sources["tanos-n2-vocab"].candidatePolicy.levels, [2]);
    assert.deepEqual(manifest.sources["tanos-n2-vocab"].allowedUse, ["candidate-discovery", "level-hint"]);
    assert.equal(manifest.sources["tanos-n2-vocab"].local.rowCount, 1835);
    assert.equal(manifest.sources["tanos-n2-vocab"].local.sha256, "2022d72b7a303205a0a5541e1d921f943840731a8897f7af6812e1b6a0b4e86b");
    assert.equal(manifest.sources["tanos-n1-vocab"].status, "active");
    assert.deepEqual(manifest.sources["tanos-n1-vocab"].candidatePolicy.levels, [1]);
    assert.deepEqual(manifest.sources["tanos-n1-vocab"].allowedUse, ["candidate-discovery", "level-hint"]);
    assert.equal(manifest.sources["tanos-n1-vocab"].local.rowCount, 3494);
    assert.equal(manifest.sources["tanos-n1-vocab"].local.sha256, "d9ab4bd35b9ca149ffbf1377472c982eb04c4156e60ead869303472341810c2e");
    assert.equal(manifest.sources["jpdb-frequency"].status, "blocked");
    assert.equal(manifest.sources["tubelex-ja-frequency"].status, "active");
    assert.equal(manifest.sources["tubelex-ja-frequency"].sourceType, "corpus_frequency");
    assert.equal(manifest.sources["tubelex-ja-frequency"].licenseUse.status, "approved");
    assert.equal(manifest.sources["tubelex-ja-frequency"].licenseUse.license, "BSD-3-Clause");
    assert.equal(manifest.sources["tubelex-ja-frequency"].local.rowCount, 65664);
    assert.equal(manifest.sources["tubelex-ja-frequency"].local.byteSize, 24662220);
    assert.equal(manifest.sources["tubelex-ja-frequency"].local.sha256, "6be7933b8c527c8c36d1d9eabe2b492ce06fe5085c6aeb207e550465ae17d4d2");
    assert.equal(manifest.sources["tubelex-ja-frequency"].canStoreSupportFacts, true);
    assert.deepEqual(manifest.sources["tubelex-ja-frequency"].supportEvidenceKinds, ["corpus-frequency"]);
    assert.equal(manifest.sources["tubelex-ja-frequency"].upstreamSnapshot.version, "7cb5fb36add76b83a266d1967536e1a1d3faa513");
    assert.equal(manifest.sources["tubelex-ja-frequency"].upstreamSnapshot.sha256, "39d4edb2ccac4405b47d0f93e9ec7b11678b3b305d1a37c877dd76588817c8e9");
    assert.deepEqual(manifest.sources["tubelex-ja-frequency"].allowedUse, ["frequency-sanity", "usefulness-support"]);
    assert.equal(manifest.sources["tubelex-ja-frequency"].disallowedUse.includes("candidate-discovery"), true);
    assert.equal(manifest.sources.jmdict.status, "active");
    assert.equal(manifest.sources.jmdict.local.rowCount, 258909);
    assert.equal(manifest.sources.jmdict.local.byteSize, 58461464);
    assert.equal(manifest.sources.jmdict.local.sha256, "fd43dc3a0c970f7a79d8028ec33eaf566a5bc4fcbf776eb11d30e3f8e396f22a");
    assert.equal(manifest.sources.jmdict.canStoreSupportFacts, true);
    assert.deepEqual(manifest.sources.jmdict.supportEvidenceKinds, ["exact-dictionary-entry"]);
    assert.equal(manifest.sources.jmdict.upstreamSnapshot.version, "JMdict created: 2026-08-24");
    assert.equal(manifest.sources.jmdict.upstreamSnapshot.sha256, "fed341a919a537f74c769bc5c69a18c8f5b7fcf372c25b0bef07e69dc35a15d0");
    assert.equal(manifest.sources.jmdict.freshness.maximumAgeDays, 31);
    assert.equal(manifest.sources["jmdict-priority-commonness"].status, "active");
    assert.equal(manifest.sources["jmdict-priority-commonness"].local.sha256, "fd43dc3a0c970f7a79d8028ec33eaf566a5bc4fcbf776eb11d30e3f8e396f22a");
    assert.equal(manifest.sources["jmdict-priority-commonness"].canStoreSupportFacts, true);
    assert.deepEqual(manifest.sources["jmdict-priority-commonness"].supportEvidenceKinds, ["dictionary-priority"]);
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

test("support sources require normalized local byte-size and row-count pins", () => {
    const manifestPath = path.resolve(__dirname, "../templates/word_source_manifest.json");
    for (const missingField of ["byteSize", "rowCount"]) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        delete manifest.sources.jmdict.local[missingField];
        assert.throws(
            () => parseWordSourceManifest(manifest),
            new RegExp(missingField, "u")
        );
    }
});
