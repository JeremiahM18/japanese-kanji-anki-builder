const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
    loadPlatinumCardSourceManifest,
    parsePlatinumCardSourceManifest,
} = require("../src/datasets/platinumCardSourceManifest");

function buildManifest(overrides = {}) {
    return {
        version: 1,
        checkedAt: "2026-05-12",
        sourcePurposeRules: {
            lexical_dictionary: {
                description: "Dictionary source.",
                allowedUse: ["word-field-verification"],
                disallowedUse: ["kanji-field-verification"],
            },
        },
        sources: {
            fixture_dictionary: {
                name: "Fixture dictionary",
                status: "active",
                sourceType: "lexical_dictionary",
                matchers: ["fixture.example"],
                sourceFamily: "fixture_dictionary",
                independenceGroup: "fixture_dictionary",
                licenseUse: {
                    status: "approved",
                    notes: "Fixture source.",
                },
                checkedAt: "2026-05-12",
                allowedUse: ["word-field-verification"],
                disallowedUse: ["kanji-field-verification"],
                ...overrides.source,
            },
        },
        ...overrides.manifest,
    };
}

test("parsePlatinumCardSourceManifest validates governed source roles", () => {
    const parsed = parsePlatinumCardSourceManifest(buildManifest());
    assert.equal(parsed.sources.fixture_dictionary.status, "active");

    assert.throws(() => parsePlatinumCardSourceManifest(buildManifest({
        source: {
            allowedUse: ["kanji-field-verification"],
            disallowedUse: [],
        },
    })), /allows kanji-field-verification/);

    assert.throws(() => parsePlatinumCardSourceManifest(buildManifest({
        source: {
            allowedUse: ["word-field-verification"],
            disallowedUse: ["word-field-verification"],
        },
    })), /both allows and disallows/);

    assert.throws(() => parsePlatinumCardSourceManifest(buildManifest({
        source: {
            status: "blocked",
            allowedUse: ["word-field-verification"],
        },
    })), /Blocked platinum card source fixture_dictionary must not allow active use/);

    assert.throws(() => parsePlatinumCardSourceManifest(buildManifest({
        source: {
            matchers: [],
        },
    })), /must declare at least one matcher/);

    assert.throws(() => parsePlatinumCardSourceManifest(buildManifest({
        manifest: {
            sources: {
                ...buildManifest().sources,
                duplicate: {
                    ...buildManifest().sources.fixture_dictionary,
                    name: "Duplicate fixture",
                    matchers: ["fixture.example"],
                },
            },
        },
    })), /matcher "fixture.example" is shared/);
});

test("tracked platinum card source manifest loads with field and non-field source lanes", () => {
    const manifest = loadPlatinumCardSourceManifest("templates/platinum_card_source_manifest.json");

    assert.equal(manifest.sources.kanjipedia.status, "active");
    assert.deepEqual(manifest.sources.kanjipedia.allowedUse, [
        "kanji-field-verification",
        "single-kanji-word-field-verification",
    ]);
    assert.equal(manifest.sources.jlearn.allowedUse.includes("word-field-verification"), true);
    assert.deepEqual(manifest.sources.jmdict.matchers, ["edrdg.org", "jmdict", "JMdict"]);
    assert.equal(manifest.sources.jlptstudy_net.disallowedUse.includes("word-field-verification"), true);
    assert.equal(manifest.sources.source_governance_manifest.disallowedUse.includes("kanji-field-verification"), true);
    assert.equal(manifest.sources.kanjidic2_legacy.allowedUse.includes("placement-claim-origin"), true);
    assert.equal(manifest.sources.kanjidic2_reading_reference.allowedUse.includes("kanji-reading-reference"), true);
    assert.equal(manifest.sources.kanjidic2_reading_reference.disallowedUse.includes("kanji-field-verification"), true);
});

test("kanji platinum japanese-source lanes do not cite generated local artifacts as source names", () => {
    for (const level of [5, 4]) {
        const entries = JSON.parse(fs.readFileSync(`templates/platinum_n${level}_review_set.json`, "utf-8"));
        const polluted = entries.flatMap((entry) => (
            (entry.sourceEvidence || [])
                .filter((evidence) => evidence.type === "japanese-source")
                .filter((evidence) => /data\/kanji_jlpt_only\.json|templates\/starter_curated_study_data\.json|templates\/golden_/i.test(evidence.source || ""))
                .map((evidence) => `${entry.kanji}: ${evidence.source}`)
        ));

        assert.deepEqual(polluted, [], `N${level} kanji sourceEvidence japanese-source lane must cite governed external/Japanese-source truth only`);
    }
});
