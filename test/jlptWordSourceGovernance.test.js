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
const { auditJlptWordSourceEvidence } = require("../src/services/jlptWordSourceEvidenceService");
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
        },
    });
    const report = auditJlptWordSourceEvidence({ contract, evidence });

    assert.equal(report.governanceValid, true);
    assert.equal(report.evidenceDepthValid, false);
    assert.equal(report.postureCounts.level_universe_standard, 1);
    assert.equal(report.postureCounts.source_origin_not_evaluated, 1);
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
