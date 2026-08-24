const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { buildJlptWordSourceInputReport } = require("../src/services/jlptWordSourceInputService");

function sha256(text) {
    return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function fixture({ withLevel = false } = {}) {
    const header = [
        "written", "reading", ...(withLevel ? ["jlpt"] : []), "reviewStatus", "citation", "evidenceRef",
        "supportClaim", "evidenceKind", "snapshotVersion", "normalizedSourceSha256", "entryIds",
        "priorityTags", "frequencyRank", "occurrenceCount", "documentCount", "channelCount", "matchStatus", "frequencyBand",
    ];
    const row = [
        "学校", "がっこう", ...(withLevel ? ["4"] : []), "reviewed", "JMdict test; https://example.test/jmdict.xml.gz; snapshot 2026-08-23", `downloads/jmdict.tsv; sha256=${"a".repeat(64)}; row=2; identity=${encodeURIComponent("学校|がっこう")}`,
        "dictionary-identity", "exact-dictionary-entry", "2026-08-23", "a".repeat(64), "123",
        "", "", "", "", "", "", "",
    ];
    const text = `${header.join("\t")}\n${row.join("\t")}\n`;
    return {
        text,
        sourceConfig: {
            sourceId: "jmdict",
            sourcePath: "downloads/jmdict-n4-support.tsv",
            sourceLabel: "JMdict N4 support",
            format: "tsv",
            evidenceMode: "support",
            supportProfile: "jmdict-exact-identity",
            importMode: "replace-contract-scope",
            contractLevels: [4],
            requireLevel: false,
            reviewStatusColumn: "reviewStatus",
            citationColumn: "citation",
            evidenceRefColumn: "evidenceRef",
            sha256: sha256(text),
            byteSize: Buffer.byteLength(text),
            rowCount: 1,
        },
        evidence: {
            sources: {
                jmdict: {
                    name: "JMdict test",
                    status: "active",
                    sourceKind: "dictionary",
                    licenseStatus: "approved",
                    countsForConsensus: false,
                    canStoreWordAssignments: false,
                    canStoreSupportFacts: true,
                    positiveEvidenceOnly: true,
                    allowedUse: ["dictionary-verification"],
                    supportEvidenceKinds: ["exact-dictionary-entry"],
                    local: {
                        path: "downloads/jmdict.tsv",
                        format: "tsv",
                        sha256: "a".repeat(64),
                        byteSize: 100,
                        rowCount: 1,
                    },
                    upstreamSnapshot: {
                        url: "https://example.test/jmdict.xml.gz",
                        version: "2026-08-23",
                        sha256: "b".repeat(64),
                        byteSize: 100,
                        retrievedAt: "2026-08-23",
                    },
                    freshness: {
                        checkedAt: "2026-08-23",
                        maximumAgeDays: 31,
                        updateProcedure: "Refresh the fixture.",
                    },
                },
            },
        },
    };
}

function corpusFixtureWithoutDistributionCounts() {
    const header = [
        "written", "reading", "reviewStatus", "citation", "evidenceRef",
        "supportClaim", "evidenceKind", "snapshotVersion", "normalizedSourceSha256", "entryIds",
        "priorityTags", "frequencyRank", "occurrenceCount", "documentCount", "channelCount", "matchStatus", "frequencyBand",
    ];
    const row = [
        "学校", "がっこう", "reviewed", "TubeLex test; https://example.test/tubelex.tsv.xz; snapshot tubelex-test-commit", `downloads/tubelex.tsv; sha256=${"a".repeat(64)}; row=2; identity=${encodeURIComponent("学校|がっこう")}`,
        "commonness", "corpus-frequency", "tubelex-test-commit", "a".repeat(64), "",
        "", "100", "50", "", "", "exact_written", "good",
    ];
    const text = `${header.join("\t")}\n${row.join("\t")}\n`;
    return {
        text,
        sourceConfig: {
            sourceId: "tubelex-ja-frequency",
            sourcePath: "downloads/tubelex-n4-support.tsv",
            sourceLabel: "TubeLex N4 support",
            format: "tsv",
            evidenceMode: "support",
            supportProfile: "tubelex-exact-frequency",
            importMode: "replace-contract-scope",
            contractLevels: [4],
            requireLevel: false,
            reviewStatusColumn: "reviewStatus",
            citationColumn: "citation",
            evidenceRefColumn: "evidenceRef",
            sha256: sha256(text),
            byteSize: Buffer.byteLength(text),
            rowCount: 1,
        },
        evidence: {
            sources: {
                "tubelex-ja-frequency": {
                    name: "TubeLex test",
                    status: "active",
                    sourceKind: "frequency",
                    licenseStatus: "approved",
                    countsForConsensus: false,
                    canStoreWordAssignments: false,
                    canStoreSupportFacts: true,
                    positiveEvidenceOnly: true,
                    allowedUse: ["commonness-support"],
                    supportEvidenceKinds: ["corpus-frequency"],
                    local: {
                        path: "downloads/tubelex.tsv",
                        format: "tsv",
                        sha256: "a".repeat(64),
                        byteSize: 100,
                        rowCount: 1,
                    },
                    upstreamSnapshot: {
                        url: "https://example.test/tubelex.tsv.xz",
                        version: "tubelex-test-commit",
                        sha256: "b".repeat(64),
                        byteSize: 100,
                        retrievedAt: "2026-08-23",
                    },
                },
            },
        },
    };
}

test("support input preflight emits reviewed typed records without placement assignments", () => {
    const value = fixture();
    const result = buildJlptWordSourceInputReport({
        sourceId: "jmdict",
        sourceConfig: value.sourceConfig,
        sourceBuffer: Buffer.from(value.text),
        evidence: value.evidence,
        policy: { requirePinnedIntegrity: true, requireKnownEvidenceSource: true },
        contractEntries: [{ key: "学校|がっこう", written: "学校", reading: "がっこう", jlpt: 4 }],
    });

    assert.equal(result.valid, true);
    assert.equal(result.reviewedAssignmentCount, 0);
    assert.equal(result.reviewedSupportFactCount, 1);
    assert.deepEqual(Object.keys(result.supportRecords), ["学校|がっこう"]);
    assert.equal(result.supportRecords["学校|がっこう"].level, undefined);
});

test("support input preflight rejects any embedded JLPT level", () => {
    const value = fixture({ withLevel: true });
    const result = buildJlptWordSourceInputReport({
        sourceId: "jmdict",
        sourceConfig: value.sourceConfig,
        sourceBuffer: Buffer.from(value.text),
        evidence: value.evidence,
        policy: { requirePinnedIntegrity: true, requireKnownEvidenceSource: true },
        contractEntries: [{ key: "学校|がっこう", written: "学校", reading: "がっこう", jlpt: 4 }],
    });

    assert.equal(result.valid, false);
    assert.match(result.blockers.join("; "), /failed word source-input validation/);
    assert.match(result.rejectedRows[0].issues.join("; "), /must not carry a JLPT level/);
});

test("support input preflight rejects a nonempty evidence reference that is not bound to the registered source row", () => {
    const value = fixture();
    value.text = value.text.replace(/downloads\/jmdict\.tsv; sha256=[a-f0-9]{64}; row=2; identity=[^\t]+/u, "unknown");
    value.sourceConfig.sha256 = sha256(value.text);
    value.sourceConfig.byteSize = Buffer.byteLength(value.text);
    const result = buildJlptWordSourceInputReport({
        sourceId: "jmdict",
        sourceConfig: value.sourceConfig,
        sourceBuffer: Buffer.from(value.text),
        evidence: value.evidence,
        policy: { requirePinnedIntegrity: true, requireKnownEvidenceSource: true },
        contractEntries: [{ key: "学校|がっこう", written: "学校", reading: "がっこう", jlpt: 4 }],
    });

    assert.equal(result.valid, false);
    assert.equal(result.reviewedSupportFactCount, 0);
    assert.match(result.rejectedRows[0].issues.join("; "), /provenance.*registered source.*row reference/iu);
});

test("corpus support preflight rejects missing positive document and channel counts", () => {
    const value = corpusFixtureWithoutDistributionCounts();
    const result = buildJlptWordSourceInputReport({
        sourceId: "tubelex-ja-frequency",
        sourceConfig: value.sourceConfig,
        sourceBuffer: Buffer.from(value.text),
        evidence: value.evidence,
        policy: { requirePinnedIntegrity: true, requireKnownEvidenceSource: true },
        contractEntries: [{ key: "学校|がっこう", written: "学校", reading: "がっこう", jlpt: 4 }],
    });

    assert.equal(result.valid, false);
    assert.equal(result.reviewedSupportFactCount, 0);
    assert.match(result.rejectedRows[0].issues.join("; "), /document and channel counts/);
});
