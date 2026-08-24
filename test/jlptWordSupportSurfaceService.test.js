const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
    buildJlptWordSupportSurface,
} = require("../src/services/jlptWordSupportSurfaceService");

function sha256(text) {
    return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function sourceConfig({ sourceId, text, evidenceKinds }) {
    const allowedUse = evidenceKinds.includes("exact-dictionary-entry")
        ? "dictionary-verification"
        : "commonness-support";
    return {
        name: sourceId,
        status: "active",
        licenseStatus: "approved",
        canStoreWordAssignments: false,
        canStoreSupportFacts: true,
        supportEvidenceKinds: evidenceKinds,
        allowedUse: [allowedUse],
        local: {
            path: `downloads/${sourceId}.tsv`,
            format: "tsv",
            sha256: sha256(text),
            byteSize: Buffer.byteLength(text),
            rowCount: text.trimEnd().split(/\r?\n/u).length - 1,
        },
        upstreamSnapshot: {
            url: `https://example.test/${sourceId}.tsv`,
            version: "fixture-2026-08-23",
            retrievedAt: "2026-08-23",
            sha256: "a".repeat(64),
            byteSize: 123,
        },
        freshness: {
            checkedAt: "2026-08-23",
            maximumAgeDays: 31,
            updateProcedure: "Refresh the fixture.",
        },
    };
}

const contractEntries = [
    { key: "学校|がっこう", written: "学校", reading: "がっこう", jlpt: 4 },
    { key: "病み付き|やみつき", written: "病み付き", reading: "やみつき", jlpt: 4 },
    { key: "夜市|よいち", written: "夜市", reading: "よいち", jlpt: 4 },
];

test("JMdict identity support emits exact typed facts without a JLPT placement level", () => {
    const sourceText = [
        "written\treading\tmeaning\tfrequencyRank\tsource\tnotes",
        "学校\tがっこう\tschool\t100\tjmdict\tentrySeq=123; jmdictPriority=news1; EDRDG JMdict English; CC BY-SA 4.0.",
        "病み付き\tやみつき\taddiction\t\tjmdict\tentrySeq=456; jmdictPriority=none; EDRDG JMdict English; CC BY-SA 4.0.",
        "対象外\tたいしょうがい\tout of scope\t110\tjmdict\tentrySeq=789; jmdictPriority=ichi1; EDRDG JMdict English; CC BY-SA 4.0.",
        "",
    ].join("\n");
    const result = buildJlptWordSupportSurface({
        sourceId: "jmdict",
        source: sourceConfig({ sourceId: "jmdict", text: sourceText, evidenceKinds: ["exact-dictionary-entry"] }),
        sourceText,
        contractEntries,
        level: 4,
    });

    assert.equal(result.valid, true);
    assert.deepEqual(result.summary, {
        contractIdentityCount: 3,
        eligibleSupportFactCount: 2,
        excludedContractIdentityCount: 1,
        outOfScopeSourceRowCount: 1,
    });
    assert.equal(result.supportRecords["学校|がっこう"].level, undefined);
    assert.deepEqual(result.supportRecords["学校|がっこう"].supportClaims, ["dictionary-identity"]);
    assert.deepEqual(result.supportRecords["学校|がっこう"].evidence, {
        kind: "exact-dictionary-entry",
        snapshotVersion: "fixture-2026-08-23",
        normalizedSourceSha256: sha256(sourceText),
        entryIds: ["123"],
    });
    assert.equal(result.supportRecords["病み付き|やみつき"].reviewStatus, "reviewed");
});

test("JMdict priority support excludes rows without an explicit positive priority fact", () => {
    const sourceText = [
        "written\treading\tmeaning\tfrequencyRank\tsource\tnotes",
        "学校\tがっこう\tschool\t100\tjmdict\tentrySeq=123; jmdictPriority=news1,nf02; EDRDG JMdict English; CC BY-SA 4.0.",
        "病み付き\tやみつき\taddiction\t\tjmdict\tentrySeq=456; jmdictPriority=none; EDRDG JMdict English; CC BY-SA 4.0.",
        "",
    ].join("\n");
    const result = buildJlptWordSupportSurface({
        sourceId: "jmdict-priority-commonness",
        source: sourceConfig({
            sourceId: "jmdict-priority-commonness",
            text: sourceText,
            evidenceKinds: ["dictionary-priority"],
        }),
        sourceText,
        contractEntries,
        level: 4,
    });

    assert.deepEqual(Object.keys(result.supportRecords), ["学校|がっこう"]);
    assert.deepEqual(result.supportRecords["学校|がっこう"].supportClaims, ["commonness"]);
    assert.deepEqual(result.supportRecords["学校|がっこう"].evidence.priorityTags, ["news1", "nf02"]);
    assert.equal(result.supportRecords["学校|がっこう"].evidence.frequencyRank, 100);
});

test("TubeLex support accepts exact positive non-poor frequency and rejects ambiguous, lemma, or poor rows", () => {
    const sourceText = [
        "written\treading\tmeaning\tfrequencyRank\ttubelexRank\ttubelexCount\ttubelexVideoCount\ttubelexChannelCount\ttubelexDispersionScore\ttubelexCategoryConcentration\ttubelexMatchStatus\ttubelexFrequencyBand\tsource\tnotes",
        "学校\tがっこう\tschool\t50\t50\t200\t20\t10\t70\t0.1\texact_written\tstrong\ttubelex-ja-frequency\tsupport only",
        "病み付き\tやみつき\taddiction\t60\t60\t100\t10\t5\t50\t0.2\tambiguous_written\tpoor\ttubelex-ja-frequency\tsupport only",
        "夜市\tよいち\tnight market\t70000\t70000\t1\t1\t1\t5\t1\texact_written\tpoor\ttubelex-ja-frequency\tsupport only",
        "",
    ].join("\n");
    const result = buildJlptWordSupportSurface({
        sourceId: "tubelex-ja-frequency",
        source: sourceConfig({ sourceId: "tubelex-ja-frequency", text: sourceText, evidenceKinds: ["corpus-frequency"] }),
        sourceText,
        contractEntries,
        level: 4,
    });

    assert.deepEqual(Object.keys(result.supportRecords), ["学校|がっこう"]);
    assert.deepEqual(result.supportRecords["学校|がっこう"].supportClaims, ["commonness"]);
    assert.deepEqual(result.supportRecords["学校|がっこう"].evidence, {
        kind: "corpus-frequency",
        snapshotVersion: "fixture-2026-08-23",
        normalizedSourceSha256: sha256(sourceText),
        frequencyRank: 50,
        occurrenceCount: 200,
        documentCount: 20,
        channelCount: 10,
        matchStatus: "exact_written",
        frequencyBand: "strong",
    });
    assert.equal(result.exclusionsByReason.ambiguous_written, 1);
    assert.equal(result.exclusionsByReason.poor_frequency_band, 1);
});

test("TubeLex support excludes rows without positive document and channel counts", () => {
    const sourceText = [
        "written\treading\tmeaning\tfrequencyRank\ttubelexRank\ttubelexCount\ttubelexVideoCount\ttubelexChannelCount\ttubelexDispersionScore\ttubelexCategoryConcentration\ttubelexMatchStatus\ttubelexFrequencyBand\tsource\tnotes",
        "学校\tがっこう\tschool\t50\t50\t200\t\t\t70\t0.1\texact_written\tstrong\ttubelex-ja-frequency\tsupport only",
        "",
    ].join("\n");
    const result = buildJlptWordSupportSurface({
        sourceId: "tubelex-ja-frequency",
        source: sourceConfig({ sourceId: "tubelex-ja-frequency", text: sourceText, evidenceKinds: ["corpus-frequency"] }),
        sourceText,
        contractEntries,
        level: 4,
    });

    assert.deepEqual(result.supportRecords, {});
    assert.equal(result.exclusionsByReason.non_positive_distribution, 1);
});

test("support-surface construction requires the profile's exact allowed use", () => {
    const sourceText = "written\treading\tmeaning\tfrequencyRank\tsource\tnotes\n学校\tがっこう\tschool\t100\tjmdict\tentrySeq=123; jmdictPriority=news1\n";
    const source = sourceConfig({ sourceId: "jmdict", text: sourceText, evidenceKinds: ["exact-dictionary-entry"] });
    source.allowedUse = [];

    assert.throws(() => buildJlptWordSupportSurface({
        sourceId: "jmdict",
        source,
        sourceText,
        contractEntries,
        level: 4,
    }), /does not allow dictionary-verification/i);
});

test("support-surface construction fails closed on stale local integrity", () => {
    const sourceText = "written\treading\tmeaning\tfrequencyRank\tsource\tnotes\n学校\tがっこう\tschool\t100\tjmdict\tentrySeq=123; jmdictPriority=news1\n";
    const source = sourceConfig({ sourceId: "jmdict", text: sourceText, evidenceKinds: ["exact-dictionary-entry"] });
    source.local.sha256 = "f".repeat(64);

    assert.throws(() => buildJlptWordSupportSurface({
        sourceId: "jmdict",
        source,
        sourceText,
        contractEntries,
        level: 4,
    }), /sha256 mismatch/i);
});
