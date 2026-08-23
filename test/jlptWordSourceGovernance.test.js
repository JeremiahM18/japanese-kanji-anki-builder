const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    buildWordIdentity,
    loadJlptWordSourceEvidence,
    normalizeJlptWordSourceEvidence,
} = require("../src/datasets/jlptWordSourceEvidence");
const { normalizeJlptWordSourceInputs } = require("../src/datasets/jlptWordSourceInputs");
const { buildJlptWordSourceInputReport } = require("../src/services/jlptWordSourceInputService");
const {
    buildWordSourceAccessPacket,
    validateWordSourceAccessPacket,
} = require("../src/services/jlptWordSourceAccessPacketService");
const { buildJlptWordSourceBatchMerge } = require("../src/services/jlptWordSourceBatchService");
const {
    auditJlptWordSourceEvidence,
    buildSourceAccessReport,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    run: runWordSourceAccessPacketCommand,
} = require("../scripts/createJlptWordSourceAccessPacket");

function buildEvidence(overrides = {}) {
    return normalizeJlptWordSourceEvidence({
        version: 1,
        checkedAt: "2026-06-21",
        sourceTiers: {
            discovery: {
                label: "Discovery",
                rank: 1,
                role: "primary-discovery",
                description: "Test discovery source.",
            },
            identity_support: {
                label: "Identity support",
                rank: 2,
                role: "identity-support",
                description: "Test dictionary identity source.",
            },
            commonness_support: {
                label: "Commonness support",
                rank: 3,
                role: "commonness-support",
                description: "Test commonness source.",
            },
        },
        sourceLineages: {
            lineage_a: {
                label: "Lineage A",
                role: "community-study-list",
                description: "Test lineage.",
            },
            lineage_b: {
                label: "Lineage B",
                role: "japanese-published-study",
                description: "Test lineage.",
            },
            lineage_c: {
                label: "Lineage C",
                role: "textbook",
                description: "Test lineage.",
            },
            dictionary_lineage: {
                label: "Dictionary lineage",
                role: "dictionary",
                description: "Test dictionary lineage.",
            },
            commonness_lineage: {
                label: "Commonness lineage",
                role: "dictionary-priority",
                description: "Test commonness lineage.",
            },
        },
        independenceGroups: {
            family_a: {
                label: "Family A",
                description: "Test family.",
            },
            family_b: {
                label: "Family B",
                description: "Test family.",
            },
            family_c: {
                label: "Family C",
                description: "Test family.",
            },
            dictionary_family: {
                label: "Dictionary family",
                description: "Test dictionary family.",
            },
            commonness_family: {
                label: "Commonness family",
                description: "Test commonness family.",
            },
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "discovery",
                evidenceLineage: "lineage_a",
                independenceGroup: "family_a",
                status: "active",
                sourceKind: "candidate-discovery",
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/license-a",
            },
            source_b: {
                name: "Source B",
                tier: "discovery",
                evidenceLineage: "lineage_b",
                independenceGroup: "family_b",
                status: "active",
                sourceKind: "textbook-word-list",
                countsForConsensus: true,
                japanesePublished: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/license-b",
            },
            source_c: {
                name: "Source C",
                tier: "discovery",
                evidenceLineage: "lineage_c",
                independenceGroup: "family_c",
                status: "active",
                sourceKind: "textbook-word-list",
                countsForConsensus: true,
                permissionedLearnerSource: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/license-c",
            },
            dictionary_source: {
                name: "Dictionary source",
                tier: "identity_support",
                evidenceLineage: "dictionary_lineage",
                independenceGroup: "dictionary_family",
                status: "active",
                sourceKind: "dictionary",
                countsForConsensus: false,
                licenseStatus: "approved",
                allowedUse: ["dictionary-verification"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/dictionary-license",
            },
            commonness_source: {
                name: "Commonness source",
                tier: "commonness_support",
                evidenceLineage: "commonness_lineage",
                independenceGroup: "commonness_family",
                status: "active",
                sourceKind: "dictionary-priority",
                countsForConsensus: false,
                licenseStatus: "approved",
                allowedUse: ["commonness-support"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/commonness-license",
            },
        },
        assignments: {},
        words: {},
        ...overrides,
    });
}

test("normalizes exact word identities and rejects mismatched assignment keys", () => {
    assert.equal(buildWordIdentity("食べる", "たべる"), "食べる|たべる");
    assert.throws(() => normalizeJlptWordSourceEvidence({
        version: 1,
        checkedAt: "2026-06-21",
        sourceTiers: {
            discovery: {
                label: "Discovery",
                rank: 1,
                role: "primary-discovery",
                description: "Test discovery source.",
            },
        },
        sourceLineages: {
            lineage: {
                label: "Lineage",
                role: "community-study-list",
                description: "Test lineage.",
            },
        },
        independenceGroups: {
            family: {
                label: "Family",
                description: "Test family.",
            },
        },
        sources: {
            source: {
                name: "Source",
                tier: "discovery",
                evidenceLineage: "lineage",
                independenceGroup: "family",
                status: "active",
                sourceKind: "candidate-discovery",
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
            },
        },
        assignments: {
            source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべます",
                    level: 5,
                    reviewStatus: "reviewed",
                },
            },
        },
    }), /mismatched identity/);
});

test("word source input preflight keeps configured rows pending until reviewed evidence is added", () => {
    const inputs = normalizeJlptWordSourceInputs({
        version: 1,
        inputs: {
            source_a: {
                sourceId: "source_a",
                sourcePath: "ignored.tsv",
                sourceLabel: "Source A",
                supportedLevels: [5],
                rowCount: 1,
                expectedReviewStatusCounts: {
                    needs_review: 1,
                },
            },
        },
    });
    const sourceText = "written\treading\tjlpt\n食べる\tたべる\tN5\n";
    const report = buildJlptWordSourceInputReport({
        sourceId: "source_a",
        sourceConfig: inputs.inputs.source_a,
        sourceBuffer: Buffer.from(sourceText, "utf8"),
        evidence: buildEvidence(),
        policy: {
            ...inputs.policy,
            requirePinnedIntegrity: false,
        },
    });

    assert.equal(report.valid, true);
    assert.equal(report.reviewedAssignmentCount, 0);
    assert.equal(report.pendingRowCount, 1);
});

test("reviewed word source rows require exact citation and evidence reference", () => {
    const sourceText = "written\treading\tjlpt\treviewStatus\n食べる\tたべる\tN5\treviewed\n";
    const report = buildJlptWordSourceInputReport({
        sourceId: "source_a",
        sourceConfig: {
            sourcePath: "ignored.tsv",
            sourceLabel: "Source A",
            format: "tsv",
            writtenColumn: "written",
            readingColumn: "reading",
            levelColumn: "jlpt",
            reviewStatusColumn: "reviewStatus",
            defaultReviewStatus: "needs_review",
            supportedLevels: [5],
        },
        sourceBuffer: Buffer.from(sourceText, "utf8"),
        evidence: buildEvidence(),
        policy: {
            requirePinnedIntegrity: false,
            requireKnownEvidenceSource: true,
        },
    });

    assert.equal(report.valid, false);
    assert.match(report.rejectedRows[0].issues.join("; "), /missing citation/);
    assert.match(report.rejectedRows[0].issues.join("; "), /missing evidenceRef/);
});

test("reviewed support inputs may omit JLPT placement but retain an explicit support claim", () => {
    const inputs = normalizeJlptWordSourceInputs({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: false,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            dictionary_source: {
                sourceId: "dictionary_source",
                sourcePath: "ignored.tsv",
                sourceLabel: "Dictionary source",
                requireLevel: false,
                defaultReviewStatus: "reviewed",
                defaultCitation: "Dictionary",
                defaultEvidenceRef: "pinned exact entry",
                defaultSupportClaims: ["dictionary-identity"],
            },
        },
    });
    const report = buildJlptWordSourceInputReport({
        sourceId: "dictionary_source",
        sourceConfig: inputs.inputs.dictionary_source,
        sourceBuffer: Buffer.from("written\treading\n食べる\tたべる\n", "utf8"),
        evidence: buildEvidence(),
        policy: inputs.policy,
    });

    assert.equal(report.valid, true);
    assert.deepEqual(report.assignments["食べる|たべる"].supportClaims, ["dictionary-identity"]);
    assert.equal(Object.hasOwn(report.assignments["食べる|たべる"], "level"), false);
});

test("word source input preflight rejects assignment storage not authorized by the source registry", () => {
    const evidence = buildEvidence();
    evidence.sources.dictionary_source.canStoreWordAssignments = false;
    const report = buildJlptWordSourceInputReport({
        sourceId: "dictionary_source",
        sourceConfig: {
            sourceId: "dictionary_source",
            sourcePath: "ignored.tsv",
            sourceLabel: "Dictionary source",
            requireLevel: false,
            defaultReviewStatus: "reviewed",
            defaultCitation: "Dictionary",
            defaultEvidenceRef: "pinned exact entry",
            defaultSupportClaims: ["dictionary-identity"],
        },
        sourceBuffer: Buffer.from("written\treading\n食べる\tたべる\n", "utf8"),
        evidence,
        policy: { requirePinnedIntegrity: false, requireKnownEvidenceSource: true },
    });

    assert.equal(report.valid, false);
    assert.match(report.blockers.join("; "), /does not allow stored word assignments/);
});

test("word source input preflight rejects support-only rows without an explicit support claim", () => {
    const report = buildJlptWordSourceInputReport({
        sourceId: "dictionary_source",
        sourceConfig: {
            sourceId: "dictionary_source",
            sourcePath: "ignored.tsv",
            sourceLabel: "Dictionary source",
            requireLevel: false,
            defaultReviewStatus: "reviewed",
            defaultCitation: "Dictionary",
            defaultEvidenceRef: "pinned exact entry",
        },
        sourceBuffer: Buffer.from("written\treading\n食べる\tたべる\n", "utf8"),
        evidence: buildEvidence(),
        policy: { requirePinnedIntegrity: false, requireKnownEvidenceSource: true },
    });

    assert.equal(report.valid, false);
    assert.match(report.blockers.join("; "), /support-only input.*explicit support claim/);
});

test("word source input preflight never permits evidence references to be disabled", () => {
    const report = buildJlptWordSourceInputReport({
        sourceId: "dictionary_source",
        sourceConfig: {
            sourceId: "dictionary_source",
            sourcePath: "ignored.tsv",
            sourceLabel: "Dictionary source",
            requireLevel: false,
            requireEvidenceRef: false,
            defaultReviewStatus: "reviewed",
            defaultCitation: "Dictionary",
            defaultSupportClaims: ["dictionary-identity"],
        },
        sourceBuffer: Buffer.from("written\treading\n食べる\tたべる\n", "utf8"),
        evidence: buildEvidence(),
        policy: { requirePinnedIntegrity: false, requireKnownEvidenceSource: true },
    });

    assert.equal(report.valid, false);
    assert.match(report.blockers.join("; "), /evidenceRef.*cannot be disabled/);
});

test("word source access packet blocks vague or incomplete source-access evidence", () => {
    const packet = buildWordSourceAccessPacket({
        sourceId: "source_a",
        checkedAt: "2026-06-21",
        sourceSurface: {
            type: "exact-word-list-table",
            title: "Exact list",
            citation: "Source A p. 1",
            evidenceRef: "row 1",
        },
    });
    assert.equal(validateWordSourceAccessPacket({ packet, expectedSourceId: "source_a" }).valid, true);

    const invalid = validateWordSourceAccessPacket({
        packet: buildWordSourceAccessPacket({
            sourceId: "source_a",
            checkedAt: "2026-06-21",
            sourceSurface: {
                type: "marketing-page",
                title: "Marketing page",
                citation: "Homepage",
                evidenceRef: "none",
            },
        }),
        expectedSourceId: "source_a",
    });
    assert.equal(invalid.valid, false);
    assert.match(invalid.blockers.join("; "), /sourceSurface.type/);
});

test("word source access packet command scaffolds incomplete packets without weakening strict validation", () => {
    const scaffold = runWordSourceAccessPacketCommand({});
    assert.equal(scaffold.valid, true);
    assert.equal(scaffold.packetValid, false);
    assert.equal(scaffold.templateOnly, true);
    assert.equal(scaffold.wrote, false);

    const strict = runWordSourceAccessPacketCommand({ strict: true });
    assert.equal(strict.valid, false);
    assert.equal(strict.packetValid, false);
});

test("word source batch merge blocks reviewed replacement and downgrade without explicit reason", () => {
    const sourceConfig = {
        format: "tsv",
        writtenColumn: "written",
        readingColumn: "reading",
        levelColumn: "jlpt",
        reviewStatusColumn: "reviewStatus",
        citationColumn: "citation",
        evidenceRefColumn: "evidenceRef",
        notesColumn: "notes",
        defaultReviewStatus: "needs_review",
    };
    const sourceText = "written\treading\tjlpt\treviewStatus\tcitation\tevidenceRef\tnotes\n食べる\tたべる\tN5\treviewed\tp1\trow1\tok\n";
    const replaceText = "written\treading\tjlpt\treviewStatus\tcitation\tevidenceRef\tnotes\n食べる\tたべる\tN4\treviewed\tp2\trow2\tchanged\n";
    const downgradeText = "written\treading\tjlpt\treviewStatus\tcitation\tevidenceRef\tnotes\n食べる\tたべる\tN5\tsource_access_gap\t\t\tgap\n";

    assert.equal(buildJlptWordSourceBatchMerge({
        sourceConfig,
        sourceText,
        batchText: replaceText,
    }).valid, false);
    assert.equal(buildJlptWordSourceBatchMerge({
        sourceConfig,
        sourceText,
        batchText: downgradeText,
        allowReviewedDowngrades: true,
    }).valid, false);
});

test("word source batch merge allows review overlay columns and warns on untouched source duplicates", () => {
    const sourceConfig = {
        format: "tsv",
        writtenColumn: "written",
        readingColumn: "reading",
        levelColumn: "jlpt",
        meaningColumn: "meaning",
        notesColumn: "notes",
        defaultReviewStatus: "needs_review",
    };
    const sourceText = "written\treading\tjlpt\tmeaning\n高い\tたかい\tN5\thigh\n高い\tたかい\tN5\texpensive\n";
    const emptyOverlay = "written\treading\tjlpt\treviewStatus\tcitation\tevidenceRef\tnotes\n";
    const emptyMerge = buildJlptWordSourceBatchMerge({
        sourceConfig,
        sourceText,
        batchText: emptyOverlay,
    });
    assert.equal(emptyMerge.valid, true);
    assert.match(emptyMerge.warnings.join("; "), /duplicate identity row/);
    assert.match(emptyMerge.tsv.split(/\r?\n/, 1)[0], /reviewStatus/);

    const targetedOverlay = "written\treading\tjlpt\treviewStatus\tcitation\tevidenceRef\tnotes\n高い\tたかい\tN5\treviewed\tp1\trow1\tok\n";
    const targetedMerge = buildJlptWordSourceBatchMerge({
        sourceConfig,
        sourceText,
        batchText: targetedOverlay,
    });
    assert.equal(targetedMerge.valid, false);
    assert.match(targetedMerge.blockers.join("; "), /matches duplicate source worksheet rows/);
});

test("word source adequacy separates governance validity from incomplete evidence depth", () => {
    const contract = {
        wordLevels: {
            "食べる|たべる": {
                written: "食べる",
                reading: "たべる",
                jlpt: 5,
            },
            "水|みず": {
                written: "水",
                reading: "みず",
                jlpt: 5,
            },
        },
    };
    const evidence = buildEvidence({
        assignments: {
            source_a: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "A",
                    evidenceRef: "row 1",
                },
            },
            source_b: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "B",
                    evidenceRef: "row 1",
                },
            },
            source_c: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "C",
                    evidenceRef: "row 1",
                },
            },
            dictionary_source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    reviewStatus: "reviewed",
                    citation: "Dictionary",
                    evidenceRef: "entry 1",
                    supportClaims: ["dictionary-identity"],
                },
            },
            commonness_source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    reviewStatus: "reviewed",
                    citation: "Commonness source",
                    evidenceRef: "entry 1",
                    supportClaims: ["commonness"],
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract, evidence });

    assert.equal(report.governanceValid, true);
    assert.equal(report.evidenceDepthValid, false);
    assert.equal(report.postureCounts.level_universe_standard, 1);
    assert.equal(report.postureCounts.source_origin_not_evaluated, 1);
});

test("word source adequacy enforces declared dictionary identity and commonness support", () => {
    const contract = {
        wordLevels: {
            "食べる|たべる": {
                written: "食べる",
                reading: "たべる",
                jlpt: 5,
            },
        },
    };
    const evidence = buildEvidence({
        assignments: {
            source_a: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "A",
                    evidenceRef: "row 1",
                },
            },
            source_b: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "B",
                    evidenceRef: "row 1",
                },
            },
            source_c: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "C",
                    evidenceRef: "row 1",
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract, evidence });
    const result = report.wordSourcePosture[0];

    assert.equal(result.dictionaryIdentitySupported, false);
    assert.equal(result.commonnessSupported, false);
    assert.equal(result.posture, "multi_source_supported");
    assert.equal(report.issueCounts.missingDictionaryIdentitySupport, 1);
    assert.equal(report.issueCounts.missingCommonnessSupport, 1);
    assert.equal(report.evidenceDepthValid, false);
});

test("commonness-capable source membership is not positive commonness evidence", () => {
    const evidence = buildEvidence({
        assignments: {
            commonness_source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    reviewStatus: "reviewed",
                    citation: "Commonness source",
                    evidenceRef: "entry without a positive priority or frequency signal",
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({
        contract: {
            wordLevels: {
                "食べる|たべる": { written: "食べる", reading: "たべる", jlpt: 5 },
            },
        },
        evidence,
    });

    assert.equal(report.wordSourcePosture[0].commonnessSupported, false);
    assert.deepEqual(report.wordSourcePosture[0].commonnessSourceIds, []);
});

test("word source policy toggles remain explicit and testable", () => {
    const contract = {
        wordLevels: {
            "食べる|たべる": { written: "食べる", reading: "たべる", jlpt: 5 },
        },
    };
    const evidence = buildEvidence({
        policy: {
            minimumIndependentSources: 3,
            minimumIndependentEvidenceLineages: 2,
            minimumJapanesePublishedOrPermissionedLearnerSources: 1,
            requireDictionaryIdentitySupport: false,
            requireCommonnessSupport: false,
        },
        assignments: {
            source_a: {
                "食べる|たべる": { written: "食べる", reading: "たべる", level: 5, reviewStatus: "reviewed", citation: "A", evidenceRef: "1" },
            },
            source_b: {
                "食べる|たべる": { written: "食べる", reading: "たべる", level: 5, reviewStatus: "reviewed", citation: "B", evidenceRef: "1" },
            },
            source_c: {
                "食べる|たべる": { written: "食べる", reading: "たべる", level: 5, reviewStatus: "reviewed", citation: "C", evidenceRef: "1" },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract, evidence });

    assert.equal(report.wordSourcePosture[0].posture, "level_universe_standard");
    assert.equal(report.issueCounts.missingDictionaryIdentitySupport, 0);
    assert.equal(report.issueCounts.missingCommonnessSupport, 0);
});

test("explicit word source audit level scope uses the exact contract denominator", () => {
    const contract = {
        wordLevels: {
            "食べる|たべる": {
                written: "食べる",
                reading: "たべる",
                jlpt: 5,
            },
            "水|みず": {
                written: "水",
                reading: "みず",
                jlpt: 4,
            },
        },
    };
    const evidence = buildEvidence({
        assignments: {
            source_a: {
                "源|みなもと": {
                    written: "源",
                    reading: "みなもと",
                    level: 3,
                    reviewStatus: "reviewed",
                    citation: "A",
                    evidenceRef: "row 2",
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({
        contract,
        evidence,
        levels: [4],
    });

    assert.equal(report.checked, 1);
    assert.equal(report.byLevel[4].checked, 1);
    assert.equal(report.byLevel[5].checked, 0);
    assert.equal(report.outOfScopeContractIdentityCount, 1);
    assert.equal(report.outOfScopeComparableIdentityCount, 1);
    assert.equal(report.comparableSourceOnlyIdentityCount, 1);
    assert.deepEqual(report.wordSourcePosture.map((entry) => entry.identity), ["水|みず"]);
});

test("word source governance fails approved sources without license evidence", () => {
    const evidence = buildEvidence({
        sources: {
            source_a: {
                name: "Source A",
                tier: "discovery",
                evidenceLineage: "lineage_a",
                independenceGroup: "family_a",
                status: "active",
                sourceKind: "candidate-discovery",
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract: { wordLevels: {} }, evidence });

    assert.equal(report.issueCounts.missingLicenseEvidence, 1);
    assert.equal(report.governanceValid, false);
});

test("word source governance rejects reviewed assignments without exact citation evidence", () => {
    const evidence = buildEvidence({
        assignments: {
            source_a: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract: { wordLevels: {} }, evidence });

    assert.equal(report.issueCounts.reviewedAssignmentsMissingEvidence, 1);
    assert.equal(report.governanceValid, false);
});

test("word source governance honors an explicit citation exemption while retaining evidenceRef", () => {
    const evidence = buildEvidence({
        sources: {
            source_a: {
                name: "Source A",
                tier: "discovery",
                evidenceLineage: "lineage_a",
                independenceGroup: "family_a",
                status: "active",
                sourceKind: "candidate-discovery",
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
                requiresCitation: false,
                licenseEvidenceUrl: "https://example.com/license-a",
            },
        },
        assignments: {
            source_a: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    evidenceRef: "exact row 1",
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract: { wordLevels: {} }, evidence });

    assert.equal(report.issueCounts.reviewedAssignmentsMissingEvidence, 0);
    assert.equal(report.governanceValid, true);
});

test("word source governance rejects support claims outside a source allowed-use profile", () => {
    const evidence = buildEvidence({
        assignments: {
            source_a: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    level: 5,
                    reviewStatus: "reviewed",
                    citation: "A",
                    evidenceRef: "row 1",
                    supportClaims: ["commonness"],
                },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({ contract: { wordLevels: {} }, evidence });

    assert.equal(report.issueCounts.invalidSupportClaims, 1);
    assert.equal(report.governanceValid, false);
});

test("word source access report keeps registered future lanes out of review loops", () => {
    const evidence = buildEvidence({
        sources: {
            registered_future: {
                name: "Registered future source",
                tier: "discovery",
                evidenceLineage: "lineage_a",
                independenceGroup: "family_a",
                status: "registered",
                sourceKind: "textbook-word-list",
                countsForConsensus: false,
                licenseStatus: "needs_review",
                allowedUse: [],
                canStoreWordAssignments: false,
            },
            reviewable_source: {
                name: "Reviewable source",
                tier: "discovery",
                evidenceLineage: "lineage_b",
                independenceGroup: "family_b",
                status: "in_review",
                sourceKind: "candidate-discovery",
                countsForConsensus: false,
                licenseStatus: "needs_review",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: false,
            },
        },
        assignments: {},
    });
    const report = buildSourceAccessReport({ evidence });
    const sourcesById = new Map(report.sources.map((source) => [source.sourceId, source]));

    assert.equal(sourcesById.get("registered_future").recommendedAction, "registered_no_current_source_access");
    assert.equal(sourcesById.get("reviewable_source").recommendedAction, "review_source_access_and_pin_input");
    assert.equal(report.actionCounts.registered_no_current_source_access, 1);
    assert.equal(report.actionCounts.review_source_access_and_pin_input, 1);
});

test("word source assignment files resolve manifest-relative slash styles", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-source-evidence-"));
    const assignmentDir = path.join(tempDir, "assignments");
    fs.mkdirSync(assignmentDir, { recursive: true });
    fs.writeFileSync(path.join(assignmentDir, "source_a.json"), JSON.stringify({
        sourceId: "source_a",
        assignments: {
            "食べる|たべる": {
                written: "食べる",
                reading: "たべる",
                level: 5,
                reviewStatus: "reviewed",
                citation: "A",
                evidenceRef: "row 1",
            },
        },
    }), "utf8");
    const manifestPath = path.join(tempDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify({
        version: 1,
        checkedAt: "2026-06-21",
        sourceTiers: {
            discovery: {
                label: "Discovery",
                rank: 1,
                role: "primary-discovery",
                description: "Test discovery source.",
            },
        },
        sourceLineages: {
            lineage_a: {
                label: "Lineage A",
                role: "community-study-list",
                description: "Test lineage.",
            },
        },
        independenceGroups: {
            family_a: {
                label: "Family A",
                description: "Test family.",
            },
        },
        sources: {
            source_a: {
                name: "Source A",
                tier: "discovery",
                evidenceLineage: "lineage_a",
                independenceGroup: "family_a",
                status: "active",
                sourceKind: "candidate-discovery",
                countsForConsensus: true,
                licenseStatus: "approved",
                allowedUse: ["candidate-discovery", "level-hint"],
                canStoreWordAssignments: true,
                licenseEvidenceUrl: "https://example.com/license-a",
            },
        },
        assignmentFiles: {
            source_a: "assignments\\source_a.json",
        },
    }), "utf8");

    const evidence = loadJlptWordSourceEvidence(manifestPath);
    assert.equal(evidence.assignments.source_a["食べる|たべる"].level, 5);
});

test("tracked word source evidence registers TubeLex as non-consensus frequency support", () => {
    const evidence = loadJlptWordSourceEvidence("templates/jlpt_word_source_evidence.json");
    const source = evidence.sources["tubelex-ja-frequency"];

    assert.equal(evidence.sourceLineages["tubelex-subtitle-frequency"].role, "frequency-sanity");
    assert.equal(evidence.independenceGroups.tubelex.label, "TubeLex");
    assert.equal(source.status, "active");
    assert.equal(source.sourceKind, "frequency");
    assert.equal(source.sourceType, "corpus_frequency");
    assert.equal(source.licenseStatus, "approved");
    assert.equal(source.countsForConsensus, false);
    assert.equal(source.canStoreWordAssignments, false);
    assert.equal(source.canStoreRawList, false);
    assert.deepEqual(source.allowedUse, ["commonness-support", "frequency-sanity"]);
    assert.equal(source.disallowedUse.includes("candidate-discovery"), true);
    assert.equal(source.local.rowCount, 65319);
});
