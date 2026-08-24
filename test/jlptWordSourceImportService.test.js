const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildJlptWordSupportEvidenceImport,
    buildStorageManifest,
} = require("../src/services/jlptWordSourceImportService");

function buildContract() {
    return {
        wordLevels: {
            "学校|がっこう": { written: "学校", reading: "がっこう", jlpt: 4 },
            "開始|かいし": { written: "開始", reading: "かいし", jlpt: 4 },
            "病み付き|やみつき": { written: "病み付き", reading: "やみつき", jlpt: 4 },
            "夜市|よいち": { written: "夜市", reading: "よいち", jlpt: 4 },
            "食べる|たべる": { written: "食べる", reading: "たべる", jlpt: 5 },
        },
    };
}

function buildSupportRecord({ written, reading, evidenceRef, supportClaims = ["commonness"] }) {
    return {
        written,
        reading,
        reviewStatus: "reviewed",
        citation: "Fixture source",
        evidenceRef,
        supportClaims,
        evidence: {
            kind: "corpus-frequency",
            snapshotVersion: "fixture-2026-08-23",
            normalizedSourceSha256: "a".repeat(64),
            frequencyRank: 10,
            occurrenceCount: 100,
            documentCount: 20,
            channelCount: 5,
            matchStatus: "exact_written",
            frequencyBand: "strong",
        },
    };
}

test("support imports replace only the exact governed contract scope and reconcile every support-record outcome", () => {
    const unchanged = buildSupportRecord({
        written: "学校",
        reading: "がっこう",
        evidenceRef: "fixture:school",
    });
    const preservedN5 = buildSupportRecord({
        written: "食べる",
        reading: "たべる",
        evidenceRef: "fixture:n5",
    });
    const evidenceManifest = {
        sources: {
            "fixture-support": { name: "Fixture support source", canStoreSupportFacts: true },
            "other-source": { name: "Other source", canStoreSupportFacts: true },
        },
        assignments: {
            "placement-source": {
                "学校|がっこう": { written: "学校", reading: "がっこう", level: 4 },
            },
        },
        supportRecords: {
            "fixture-support": {
                "学校|がっこう": unchanged,
                "病み付き|やみつき": buildSupportRecord({
                    written: "病み付き",
                    reading: "やみつき",
                    evidenceRef: "fixture:old",
                }),
                "夜市|よいち": buildSupportRecord({
                    written: "夜市",
                    reading: "よいち",
                    evidenceRef: "fixture:removed",
                }),
                "食べる|たべる": preservedN5,
            },
            "other-source": {
                "夜市|よいち": buildSupportRecord({
                    written: "夜市",
                    reading: "よいち",
                    evidenceRef: "fixture:other",
                }),
            },
        },
    };

    const result = buildJlptWordSupportEvidenceImport({
        evidenceManifest,
        sourceId: "fixture-support",
        contract: buildContract(),
        levels: [4],
        supportRecords: {
            "学校|がっこう": {
                evidence: unchanged.evidence,
                supportClaims: ["commonness"],
                evidenceRef: "fixture:school",
                citation: "Fixture source",
                reviewStatus: "reviewed",
                reading: "がっこう",
                written: "学校",
            },
            "開始|かいし": buildSupportRecord({
                written: "開始",
                reading: "かいし",
                evidenceRef: "fixture:added",
            }),
            "病み付き|やみつき": buildSupportRecord({
                written: "病み付き",
                reading: "やみつき",
                evidenceRef: "fixture:changed",
            }),
            "対象外|たいしょうがい": buildSupportRecord({
                written: "対象外",
                reading: "たいしょうがい",
                evidenceRef: "fixture:out-of-scope",
            }),
        },
    });

    assert.deepEqual(result.summary, {
        sourceId: "fixture-support",
        levels: [4],
        contractScopeIdentityCount: 4,
        importedSupportRecordCount: 3,
        previousSupportRecordCount: 4,
        previousScopedSupportRecordCount: 3,
        addedSupportRecordCount: 1,
        changedSupportRecordCount: 1,
        removedSupportRecordCount: 1,
        unchangedSupportRecordCount: 1,
        outOfScopeSupportRecordCount: 1,
        preservedOutOfScopeSupportRecordCount: 1,
        addedWords: ["開始|かいし"],
        changedWords: ["病み付き|やみつき"],
        removedWords: ["夜市|よいち"],
        unchangedWords: ["学校|がっこう"],
        outOfScopeWords: ["対象外|たいしょうがい"],
        preservedOutOfScopeWords: ["食べる|たべる"],
        materializationCandidateWords: ["開始|かいし", "病み付き|やみつき", "夜市|よいち"],
    });
    assert.deepEqual(result.manifest.supportRecords["fixture-support"], {
        "学校|がっこう": result.manifest.supportRecords["fixture-support"]["学校|がっこう"],
        "病み付き|やみつき": result.manifest.supportRecords["fixture-support"]["病み付き|やみつき"],
        "食べる|たべる": preservedN5,
        "開始|かいし": result.manifest.supportRecords["fixture-support"]["開始|かいし"],
    });
    assert.deepEqual(result.manifest.supportRecords["fixture-support"]["学校|がっこう"], {
        supportClaims: ["commonness"],
        evidenceRef: "fixture:school",
        citation: "Fixture source",
        reviewStatus: "reviewed",
        reading: "がっこう",
        written: "学校",
        evidence: unchanged.evidence,
    });
    assert.equal(result.manifest.supportRecords["fixture-support"]["夜市|よいち"], undefined);
    assert.equal(result.manifest.supportRecords["fixture-support"]["対象外|たいしょうがい"], undefined);
    assert.deepEqual(result.manifest.supportRecords["other-source"], evidenceManifest.supportRecords["other-source"]);
    assert.deepEqual(result.manifest.assignments, evidenceManifest.assignments);
});

test("support imports require an exact nonempty contract level scope", () => {
    const evidenceManifest = {
        sources: { "fixture-support": { name: "Fixture support source", canStoreSupportFacts: true } },
        assignments: {},
    };

    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest,
        sourceId: "fixture-support",
        contract: buildContract(),
        levels: [],
        supportRecords: {},
    }), /nonempty exact JLPT level scope/i);

    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest,
        sourceId: "fixture-support",
        contract: buildContract(),
        levels: [4, 4],
        supportRecords: {},
    }), /duplicate JLPT level/i);
});

test("support imports fail closed when an in-scope record declares a different exact identity", () => {
    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest: {
            sources: { "fixture-support": { name: "Fixture support source", canStoreSupportFacts: true } },
            assignments: {},
        },
        sourceId: "fixture-support",
        contract: buildContract(),
        levels: [4],
        supportRecords: {
            "学校|がっこう": buildSupportRecord({
                written: "学校",
                reading: "がくこう",
                evidenceRef: "fixture:mismatch",
            }),
        },
    }), /declares mismatched exact identity/i);
});

test("support imports reject sources without support-fact storage authority and empty contract scopes", () => {
    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest: {
            sources: { "placement-only": { name: "Placement only", canStoreSupportFacts: false } },
        },
        sourceId: "placement-only",
        contract: buildContract(),
        levels: [4],
        supportRecords: {},
    }), /does not allow stored support facts/i);

    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest: {
            sources: {
                "dual-authority": {
                    name: "Invalid dual authority",
                    canStoreSupportFacts: true,
                    canStoreWordAssignments: true,
                    countsForConsensus: true,
                },
            },
        },
        sourceId: "dual-authority",
        contract: buildContract(),
        levels: [4],
        supportRecords: {},
    }), /must not also hold JLPT placement authority/i);

    assert.throws(() => buildJlptWordSupportEvidenceImport({
        evidenceManifest: {
            sources: { "fixture-support": { name: "Fixture support source", canStoreSupportFacts: true } },
        },
        sourceId: "fixture-support",
        contract: { wordLevels: {} },
        levels: [4],
        supportRecords: {},
    }), /contains no exact contract identities/i);
});

test("storage manifest keeps licensed support records canonical in support files without materialized duplication", () => {
    const stored = buildStorageManifest({
        assignments: { source: { "学校|がっこう": {} } },
        supportRecords: { dictionary: { "学校|がっこう": {} } },
        words: {
            "学校|がっこう": {
                sources: {
                    source: {
                        written: "学校",
                        reading: "がっこう",
                        level: 4,
                        supportClaims: [],
                    },
                },
                supportSources: {
                    dictionary: buildSupportRecord({
                        written: "学校",
                        reading: "がっこう",
                        evidenceRef: "fixture:dictionary",
                        supportClaims: ["dictionary-identity"],
                    }),
                },
                dictionaryIdentitySourceIds: ["dictionary"],
                commonnessSourceIds: [],
                dictionaryIdentitySupported: true,
                commonnessSupported: false,
                posture: "single_source_family",
            },
        },
    });

    assert.deepEqual(stored.assignments, {});
    assert.deepEqual(stored.supportRecords, {});
    assert.equal(stored.words["学校|がっこう"].supportSources, undefined);
    assert.equal(stored.words["学校|がっこう"].sources.source.supportClaims, undefined);
    assert.deepEqual(stored.words["学校|がっこう"].dictionaryIdentitySourceIds, ["dictionary"]);
    assert.equal(stored.words["学校|がっこう"].dictionaryIdentitySupported, true);
    assert.equal(stored.words["学校|がっこう"].commonnessSourceIds, undefined);
    assert.equal(stored.words["学校|がっこう"].commonnessSupported, undefined);
});
