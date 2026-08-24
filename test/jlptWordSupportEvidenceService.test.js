const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    formatWordSourceSupportFileJson,
    normalizeJlptWordSourceEvidence,
} = require("../src/datasets/jlptWordSourceEvidence");
const {
    auditJlptWordSourceEvidence: auditJlptWordSourceEvidenceRaw,
    buildMaterializedWordEvidenceEntries,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    buildJlptWordSupportSurface,
} = require("../src/services/jlptWordSupportSurfaceService");

const IDENTITY = "学校|がっこう";
const DICTIONARY_LOCAL_SHA256 = "b".repeat(64);
const FREQUENCY_LOCAL_SHA256 = "d".repeat(64);

function auditJlptWordSourceEvidence(options = {}) {
    return auditJlptWordSourceEvidenceRaw({
        asOfDate: "2026-08-23",
        ...options,
    });
}

function placementSource({ lineage, family, learner = false }) {
    return {
        name: `Placement ${family}`,
        tier: "placement",
        evidenceLineage: lineage,
        independenceGroup: family,
        status: "active",
        sourceKind: "level-claim",
        levels: [4],
        japanesePublished: learner,
        countsForConsensus: true,
        licenseStatus: "approved",
        allowedUse: ["candidate-discovery", "level-hint"],
        canStoreWordAssignments: true,
        licenseEvidenceUrl: `https://example.test/${family}/license`,
    };
}

function dictionarySource() {
    return {
        name: "Exact dictionary source",
        tier: "support",
        evidenceLineage: "dictionary_lineage",
        independenceGroup: "dictionary_family",
        status: "active",
        sourceKind: "dictionary",
        countsForConsensus: false,
        licenseStatus: "approved",
        allowedUse: ["dictionary-verification"],
        canStoreWordAssignments: false,
        canStoreSupportFacts: true,
        positiveEvidenceOnly: true,
        supportEvidenceKinds: ["exact-dictionary-entry"],
        upstreamSnapshot: {
            url: "https://example.test/dictionary.xml.gz",
            version: "dictionary-2026-08-23",
            retrievedAt: "2026-08-23",
            sha256: "a".repeat(64),
            byteSize: 100,
        },
        freshness: {
            checkedAt: "2026-08-23",
            maximumAgeDays: 31,
            updateProcedure: "Refresh the official snapshot and reconcile its pins.",
        },
        local: {
            path: "downloads/dictionary.json",
            format: "json",
            sha256: DICTIONARY_LOCAL_SHA256,
            byteSize: 80,
            rowCount: 1,
        },
        licenseEvidenceUrl: "https://example.test/dictionary/license",
    };
}

function frequencySource() {
    return {
        name: "Exact frequency source",
        tier: "support",
        evidenceLineage: "frequency_lineage",
        independenceGroup: "frequency_family",
        status: "active",
        sourceKind: "frequency",
        countsForConsensus: false,
        licenseStatus: "approved",
        allowedUse: ["commonness-support"],
        canStoreWordAssignments: false,
        canStoreSupportFacts: true,
        positiveEvidenceOnly: true,
        supportEvidenceKinds: ["corpus-frequency"],
        upstreamSnapshot: {
            url: "https://example.test/frequency.tsv",
            version: "frequency-2026-08-23",
            retrievedAt: "2026-08-23",
            sha256: "c".repeat(64),
            byteSize: 100,
        },
        local: {
            path: "downloads/frequency.tsv",
            format: "tsv",
            sha256: FREQUENCY_LOCAL_SHA256,
            byteSize: 80,
            rowCount: 1,
        },
        licenseEvidenceUrl: "https://example.test/frequency/license",
    };
}

function placementAssignment(sourceId) {
    return {
        written: "学校",
        reading: "がっこう",
        level: 4,
        reviewStatus: "reviewed",
        citation: sourceId,
        evidenceRef: `${sourceId}:row-1`,
    };
}

function dictionaryRecord() {
    return {
        written: "学校",
        reading: "がっこう",
        reviewStatus: "reviewed",
        citation: "Exact dictionary entry 123",
        evidenceRef: "dictionary-2026-08-23:entry-123",
        supportClaims: ["dictionary-identity"],
        evidence: {
            kind: "exact-dictionary-entry",
            snapshotVersion: "dictionary-2026-08-23",
            normalizedSourceSha256: DICTIONARY_LOCAL_SHA256,
            entryIds: ["123"],
        },
    };
}

function frequencyRecord() {
    return {
        written: "学校",
        reading: "がっこう",
        reviewStatus: "reviewed",
        citation: "Exact corpus frequency row",
        evidenceRef: "frequency-2026-08-23:rank-50",
        supportClaims: ["commonness"],
        evidence: {
            kind: "corpus-frequency",
            snapshotVersion: "frequency-2026-08-23",
            normalizedSourceSha256: FREQUENCY_LOCAL_SHA256,
            frequencyRank: 50,
            occurrenceCount: 200,
            documentCount: 20,
            channelCount: 10,
            matchStatus: "exact_written",
            frequencyBand: "strong",
        },
    };
}

function rawEvidence() {
    return {
        version: 1,
        checkedAt: "2026-08-23",
        sourceTiers: {
            placement: {
                label: "Placement",
                rank: 1,
                role: "primary-discovery",
                description: "Independent reviewed placement evidence.",
            },
            support: {
                label: "Support",
                rank: 2,
                role: "identity-support",
                description: "Non-placement support evidence.",
            },
        },
        sourceLineages: {
            placement_lineage_a: { label: "A", role: "community-study-list", description: "A" },
            placement_lineage_b: { label: "B", role: "japanese-published-study", description: "B" },
            placement_lineage_c: { label: "C", role: "textbook", description: "C" },
            dictionary_lineage: { label: "Dictionary", role: "dictionary", description: "Dictionary" },
            frequency_lineage: { label: "Frequency", role: "frequency-sanity", description: "Frequency" },
        },
        independenceGroups: {
            family_a: { label: "A", description: "A" },
            family_b: { label: "B", description: "B" },
            family_c: { label: "C", description: "C" },
            dictionary_family: { label: "Dictionary", description: "Dictionary" },
            frequency_family: { label: "Frequency", description: "Frequency" },
        },
        sources: {
            placement_a: placementSource({ lineage: "placement_lineage_a", family: "family_a" }),
            placement_b: placementSource({ lineage: "placement_lineage_b", family: "family_b", learner: true }),
            placement_c: placementSource({ lineage: "placement_lineage_c", family: "family_c" }),
            dictionary: dictionarySource(),
            frequency: frequencySource(),
        },
        assignments: {
            placement_a: { [IDENTITY]: placementAssignment("placement_a") },
            placement_b: { [IDENTITY]: placementAssignment("placement_b") },
            placement_c: { [IDENTITY]: placementAssignment("placement_c") },
        },
        supportRecords: {
            dictionary: { [IDENTITY]: dictionaryRecord() },
            frequency: { [IDENTITY]: frequencyRecord() },
        },
        words: {},
    };
}

function contract() {
    return {
        wordLevels: {
            [IDENTITY]: { written: "学校", reading: "がっこう", jlpt: 4 },
        },
    };
}

test("typed support records reject a JLPT level and mismatched evidence predicates", () => {
    const valid = normalizeJlptWordSourceEvidence(rawEvidence());
    assert.equal(valid.supportRecords.dictionary[IDENTITY].level, undefined);

    const withLevel = rawEvidence();
    withLevel.supportRecords.dictionary[IDENTITY].level = 4;
    assert.throws(() => normalizeJlptWordSourceEvidence(withLevel), /level/u);

    const mismatchedClaim = rawEvidence();
    mismatchedClaim.supportRecords.dictionary[IDENTITY].supportClaims = ["commonness"];
    assert.throws(
        () => normalizeJlptWordSourceEvidence(mismatchedClaim),
        /exact-dictionary-entry evidence requires dictionary-identity/u
    );

    const ambiguousCorpus = rawEvidence();
    ambiguousCorpus.supportRecords.frequency[IDENTITY].evidence.matchStatus = "ambiguous_written";
    assert.throws(() => normalizeJlptWordSourceEvidence(ambiguousCorpus), /matchStatus/u);

    const invalidSnapshotDate = rawEvidence();
    invalidSnapshotDate.sources.dictionary.upstreamSnapshot.retrievedAt = "2026-02-30";
    assert.throws(() => normalizeJlptWordSourceEvidence(invalidSnapshotDate), /valid YYYY-MM-DD calendar date/u);
});

test("support source normalization requires complete normalized local integrity pins", () => {
    for (const missingField of ["byteSize", "rowCount"]) {
        const evidence = rawEvidence();
        delete evidence.sources.dictionary.local[missingField];
        assert.throws(
            () => normalizeJlptWordSourceEvidence(evidence),
            new RegExp(`local\\.${missingField}`, "u")
        );
    }
});

test("support governance fails closed when normalized local size or row pins disappear in memory", () => {
    for (const missingField of ["byteSize", "rowCount"]) {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        delete evidence.sources.dictionary.local[missingField];
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });

        assert.equal(report.governanceValid, false, missingField);
        assert.equal(report.issueCounts.missingSupportSourceMetadata, 1, missingField);
        assert.equal(report.issueCounts.invalidSupportFacts, 1, missingField);
        assert.equal(report.wordSourcePosture[0].dictionaryIdentitySupported, false, missingField);
    }
});

test("support source normalization rejects simultaneous JLPT placement authority", () => {
    const evidence = rawEvidence();
    Object.assign(evidence.sources.dictionary, {
        countsForConsensus: true,
        canStoreWordAssignments: true,
        levels: [4],
        allowedUse: ["dictionary-verification", "candidate-discovery", "level-hint"],
    });

    assert.throws(
        () => normalizeJlptWordSourceEvidence(evidence),
        /support-fact source .* must not also hold JLPT placement authority/iu
    );
});

test("support governance rejects in-memory dual support and placement authority", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
    Object.assign(evidence.sources.dictionary, {
        countsForConsensus: true,
        canStoreWordAssignments: true,
        levels: [4],
        allowedUse: ["dictionary-verification", "candidate-discovery", "level-hint"],
    });
    evidence.assignments.dictionary = { [IDENTITY]: placementAssignment("dictionary") };
    const report = auditJlptWordSourceEvidence({
        contract: contract(),
        evidence,
        asOfDate: "2026-08-23",
    });

    assert.equal(report.governanceValid, false);
    assert.equal(report.issueCounts.dualAuthoritySupportSources, 1);
    assert.equal(report.wordSourcePosture[0].dictionaryIdentitySupported, false);
});

test("support-surface freshness rejects a nonexistent calendar as-of date", () => {
    const sourceText = Buffer.from("written\treading\n", "utf8");
    const source = dictionarySource();
    source.upstreamSnapshot.retrievedAt = "2026-02-01";
    source.freshness.checkedAt = "2026-02-01";
    source.freshness.maximumAgeDays = 30;
    source.local = {
        path: "downloads/dictionary.tsv",
        format: "tsv",
        sha256: crypto.createHash("sha256").update(sourceText).digest("hex"),
        byteSize: sourceText.length,
        rowCount: 0,
    };

    assert.throws(() => buildJlptWordSupportSurface({
        sourceId: "jmdict",
        source,
        sourceText,
        contractEntries: [],
        level: 4,
        asOfDate: "2026-02-31",
    }), /invalid freshness|calendar date/iu);
});

test("typed support facts satisfy policy without becoming JLPT placement votes", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
    const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
    const row = report.wordSourcePosture[0];

    assert.equal(report.governanceValid, true);
    assert.equal(report.evidenceDepthValid, true);
    assert.equal(row.posture, "level_universe_standard");
    assert.equal(row.assignmentCount, 3);
    assert.equal(row.independentSourceCount, 3);
    assert.deepEqual(row.sourceIds, ["placement_a", "placement_b", "placement_c"]);
    assert.deepEqual(row.dictionaryIdentitySourceIds, ["dictionary"]);
    assert.deepEqual(row.commonnessSourceIds, ["frequency"]);
});

test("support-only facts materialize separately without changing placement metrics", () => {
    const raw = rawEvidence();
    raw.assignments = {};
    raw.supportRecords.frequency = {};
    const evidence = normalizeJlptWordSourceEvidence(raw);
    const materialized = buildMaterializedWordEvidenceEntries({ contract: contract(), evidence });
    const row = materialized.words[IDENTITY];

    assert.deepEqual(row.sources, {});
    assert.deepEqual(Object.keys(row.supportSources), ["dictionary"]);
    assert.equal(row.supportSources.dictionary.level, undefined);
    assert.equal(row.sourceAgreementCount, 0);
    assert.equal(row.independentSourceCount, 0);
    assert.equal(row.sourceConsensusLevel, null);
    assert.equal(row.posture, "source_origin_not_evaluated");
    assert.equal(row.dictionaryIdentitySupported, true);
    assert.equal(row.commonnessSupported, false);
});

test("legacy assignment support claims are ignored as evidence and fail governance", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
    evidence.supportRecords = {};
    evidence.assignments.placement_a[IDENTITY].supportClaims = ["commonness"];
    const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
    const row = report.wordSourcePosture[0];

    assert.equal(report.governanceValid, false);
    assert.equal(report.issueCounts.legacyAssignmentSupportClaims, 1);
    assert.equal(report.issueCounts.invalidSupportClaims, 1);
    assert.equal(row.dictionaryIdentitySupported, false);
    assert.equal(row.commonnessSupported, false);
    assert.notEqual(row.posture, "level_universe_standard");
});

test("nonempty legacy support claims fail governance even before assignment review", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
    evidence.supportRecords = {};
    evidence.assignments.placement_a[IDENTITY].reviewStatus = "needs_review";
    evidence.assignments.placement_a[IDENTITY].supportClaims = ["commonness"];
    const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });

    assert.equal(report.issueCounts.legacyAssignmentSupportClaims, 1);
    assert.equal(report.issueCounts.invalidSupportClaims, 1);
    assert.equal(report.governanceValid, false);
    assert.equal(report.wordSourcePosture[0].commonnessSupported, false);
});

test("support-fact governance fails closed on storage, metadata, freshness, and pin defects", async (t) => {
    await t.test("storage is not authorized", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.sources.dictionary.canStoreSupportFacts = false;
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.disallowedStoredSupportFacts, 1);
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.governanceValid, false);
    });

    await t.test("positive-only metadata is missing", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.sources.dictionary.positiveEvidenceOnly = false;
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.missingSupportSourceMetadata, 1);
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.governanceValid, false);
    });

    await t.test("dictionary snapshot is stale", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.sources.dictionary.freshness.checkedAt = "2026-01-01";
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.staleSupportSources, 1);
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.governanceValid, false);
    });

    await t.test("record does not match the pinned normalized source", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.supportRecords.dictionary[IDENTITY].evidence.normalizedSourceSha256 = "f".repeat(64);
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.wordSourcePosture[0].dictionaryIdentitySupported, false);
        assert.equal(report.governanceValid, false);
    });

    await t.test("evidence kind does not match the registered source kind", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.sources.dictionary.sourceKind = "background";
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.wordSourcePosture[0].dictionaryIdentitySupported, false);
        assert.equal(report.governanceValid, false);
    });

    await t.test("record identity does not match its written and reading fields", () => {
        const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
        evidence.supportRecords.dictionary[IDENTITY].reading = "がこう";
        const report = auditJlptWordSourceEvidence({ contract: contract(), evidence });
        assert.equal(report.issueCounts.invalidSupportFacts, 1);
        assert.equal(report.wordSourcePosture[0].dictionaryIdentitySupported, false);
    });
});

test("support freshness is evaluated at audit time rather than frozen manifest time", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());

    const report = auditJlptWordSourceEvidence({
        contract: contract(),
        evidence,
        asOfDate: "2026-09-24",
    });

    assert.equal(report.governanceValid, false);
    assert.equal(report.issueCounts.staleSupportSources, 1);
    assert.equal(report.issueCounts.invalidSupportFacts, 1);
});

test("support freshness defaults to the live UTC date for direct audit consumers", () => {
    const evidence = normalizeJlptWordSourceEvidence(rawEvidence());
    const RealDate = Date;
    global.Date = class extends RealDate {
        constructor(...args) {
            super(...(args.length > 0 ? args : ["2026-09-24T00:00:00.000Z"]));
        }

        static now() {
            return new RealDate("2026-09-24T00:00:00.000Z").valueOf();
        }
    };
    try {
        const report = auditJlptWordSourceEvidenceRaw({ contract: contract(), evidence });
        assert.equal(report.asOfDate, "2026-09-24");
        assert.equal(report.governanceValid, false);
        assert.equal(report.issueCounts.staleSupportSources, 1);
    } finally {
        global.Date = RealDate;
    }
});

test("manifest-relative support files load exact typed records", (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-support-evidence-"));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const supportDirectory = path.join(temporaryDirectory, "jlpt_word_source_evidence", "support");
    fs.mkdirSync(supportDirectory, { recursive: true });
    const supportPath = path.join(supportDirectory, "dictionary.json");
    fs.writeFileSync(supportPath, formatWordSourceSupportFileJson({
        sourceId: "dictionary",
        supportRecords: { [IDENTITY]: dictionaryRecord() },
    }));
    const raw = rawEvidence();
    raw.supportRecords = {};
    raw.supportFiles = { dictionary: "jlpt_word_source_evidence/support/dictionary.json" };

    const evidence = normalizeJlptWordSourceEvidence(raw, {
        manifestPath: path.join(temporaryDirectory, "manifest.json"),
    });
    assert.deepEqual(Object.keys(evidence.supportRecords.dictionary), [IDENTITY]);
    assert.equal(evidence.supportRecords.dictionary[IDENTITY].evidence.entryIds[0], "123");
});

test("support manifest paths cannot redirect loader reads outside the governed source directory", (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-support-path-"));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const outsidePath = path.join(temporaryDirectory, "outside.json");
    fs.writeFileSync(outsidePath, formatWordSourceSupportFileJson({
        sourceId: "dictionary",
        supportRecords: { [IDENTITY]: dictionaryRecord() },
    }));
    const raw = rawEvidence();
    raw.supportRecords = {};
    raw.supportFiles = { dictionary: "outside.json" };

    assert.throws(() => normalizeJlptWordSourceEvidence(raw, {
        manifestPath: path.join(temporaryDirectory, "manifest.json"),
    }), /governed support evidence directory|canonical data path/i);
});

test("support loader rejects a governed-root junction without consuming redirected evidence", (t) => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-support-junction-"));
    t.after(() => fs.rmSync(temporaryDirectory, { recursive: true, force: true }));
    const outsideDirectory = path.join(temporaryDirectory, "outside");
    const evidenceDirectory = path.join(temporaryDirectory, "jlpt_word_source_evidence");
    const supportDirectory = path.join(evidenceDirectory, "support");
    fs.mkdirSync(outsideDirectory, { recursive: true });
    fs.mkdirSync(evidenceDirectory, { recursive: true });
    fs.writeFileSync(path.join(outsideDirectory, "dictionary.json"), formatWordSourceSupportFileJson({
        sourceId: "dictionary",
        supportRecords: { [IDENTITY]: dictionaryRecord() },
    }));
    const sentinelPath = path.join(outsideDirectory, "sentinel.txt");
    fs.writeFileSync(sentinelPath, "unchanged", "utf8");
    fs.symlinkSync(outsideDirectory, supportDirectory, process.platform === "win32" ? "junction" : "dir");
    const raw = rawEvidence();
    raw.supportRecords = {};
    raw.supportFiles = { dictionary: "jlpt_word_source_evidence/support/dictionary.json" };

    assert.throws(() => normalizeJlptWordSourceEvidence(raw, {
        manifestPath: path.join(temporaryDirectory, "manifest.json"),
    }), /symbolic link|junction|redirected directory/i);
    assert.equal(fs.readFileSync(sentinelPath, "utf8"), "unchanged");
});
