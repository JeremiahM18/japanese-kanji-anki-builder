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
    auditJlptWordSourceEvidence: auditJlptWordSourceEvidenceRaw,
    buildSourceAccessReport,
} = require("../src/services/jlptWordSourceEvidenceService");
const {
    resolveGovernedOutPath: resolveGovernedAccessPacketOutPath,
    run: runWordSourceAccessPacketCommand,
} = require("../scripts/createJlptWordSourceAccessPacket");
const {
    resolveGovernedWordSourceInputPath,
    run: runWordSourceBatchMergeCommand,
} = require("../scripts/mergeJlptWordSourceBatch");

function auditJlptWordSourceEvidence(options = {}) {
    return auditJlptWordSourceEvidenceRaw({
        asOfDate: "2026-06-21",
        ...options,
    });
}

function writeSupportMergeConfig(configPath) {
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            support_source: {
                sourceId: "support_source",
                sourcePath: "downloads/word-source-support/support-source.tsv",
                sourceLabel: "Support source",
                format: "tsv",
                evidenceMode: "support",
                supportProfile: "jmdict-exact-identity",
                importMode: "replace-contract-scope",
                contractLevels: [4],
                writtenColumn: "written",
                readingColumn: "reading",
                reviewStatusColumn: "reviewStatus",
                citationColumn: "citation",
                evidenceRefColumn: "evidenceRef",
                requireLevel: false,
            },
        },
    }), "utf8");
}

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
                canStoreWordAssignments: false,
                canStoreSupportFacts: true,
                positiveEvidenceOnly: true,
                supportEvidenceKinds: ["exact-dictionary-entry"],
                upstreamSnapshot: {
                    url: "https://example.com/dictionary.xml.gz",
                    version: "dictionary-v1",
                    retrievedAt: "2026-06-21",
                    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                    byteSize: 100,
                },
                freshness: {
                    checkedAt: "2026-06-21",
                    maximumAgeDays: 31,
                    updateProcedure: "Refresh and reconcile the pinned dictionary snapshot.",
                },
                local: {
                    path: "ignored/dictionary.json",
                    format: "json",
                    sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    byteSize: 100,
                    rowCount: 1,
                },
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
                canStoreWordAssignments: false,
                canStoreSupportFacts: true,
                positiveEvidenceOnly: true,
                supportEvidenceKinds: ["dictionary-priority"],
                upstreamSnapshot: {
                    url: "https://example.com/commonness.xml.gz",
                    version: "commonness-v1",
                    retrievedAt: "2026-06-21",
                    sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                    byteSize: 100,
                },
                freshness: {
                    checkedAt: "2026-06-21",
                    maximumAgeDays: 31,
                    updateProcedure: "Refresh and reconcile the pinned commonness snapshot.",
                },
                local: {
                    path: "ignored/commonness.json",
                    format: "json",
                    sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                    byteSize: 100,
                    rowCount: 1,
                },
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
                evidenceMode: "support",
                supportProfile: "jmdict-exact-identity",
                importMode: "replace-contract-scope",
                contractLevels: [5],
                requireLevel: false,
            },
        },
    });
    const report = buildJlptWordSourceInputReport({
        sourceId: "dictionary_source",
        sourceConfig: inputs.inputs.dictionary_source,
        sourceBuffer: Buffer.from(
            "written\treading\treviewStatus\tcitation\tevidenceRef\tsupportClaim\tevidenceKind\tsnapshotVersion\tnormalizedSourceSha256\tentryIds\n"
            + `食べる\tたべる\treviewed\tDictionary source; https://example.com/dictionary.xml.gz; snapshot dictionary-v1\tignored/dictionary.json; sha256=${"b".repeat(64)}; row=1; identity=${encodeURIComponent("食べる|たべる")}\tdictionary-identity\texact-dictionary-entry\tdictionary-v1\t${"b".repeat(64)}\t1\n`,
            "utf8"
        ),
        evidence: buildEvidence(),
        policy: inputs.policy,
        contractEntries: [{ key: "食べる|たべる", written: "食べる", reading: "たべる", jlpt: 5 }],
        asOfDate: "2026-06-21",
    });

    assert.equal(report.valid, true);
    assert.deepEqual(report.assignments, {});
    assert.deepEqual(report.supportRecords["食べる|たべる"].supportClaims, ["dictionary-identity"]);
    assert.equal(Object.hasOwn(report.supportRecords["食べる|たべる"], "level"), false);
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

test("word source access packets reject invalid and future review dates", () => {
    const packet = buildWordSourceAccessPacket({
        sourceId: "source_a",
        checkedAt: "not-a-date",
        sourceSurface: {
            type: "exact-word-list-table",
            title: "Exact list",
            citation: "Source A p. 1",
            evidenceRef: "row 1",
        },
    });
    assert.equal(validateWordSourceAccessPacket({ packet, asOfDate: "2026-08-23" }).valid, false);
    packet.checkedAt = "2026-08-24";
    const future = validateWordSourceAccessPacket({ packet, asOfDate: "2026-08-23" });
    assert.equal(future.valid, false);
    assert.match(future.blockers.join("; "), /future/i);

    const invalidEvaluationDate = validateWordSourceAccessPacket({
        packet,
        asOfDate: "invalid",
    });
    assert.equal(invalidEvaluationDate.valid, false);
    assert.match(invalidEvaluationDate.blockers.join("; "), /evaluation date/i);
});

test("word source access packet and merge outputs stay on their ignored governed surfaces", () => {
    const cwd = process.cwd();
    assert.equal(
        resolveGovernedAccessPacketOutPath({
            cwd,
            sourceId: "jmdict",
            outPath: "downloads/word-source-access-packets/jmdict-word-source-access-packet.json",
        }),
        path.join(cwd, "downloads", "word-source-access-packets", "jmdict-word-source-access-packet.json")
    );
    assert.throws(() => resolveGovernedAccessPacketOutPath({
        cwd,
        sourceId: "jmdict",
        outPath: "../package.json",
    }), /canonical relative path|noncanonical path segment|direct child/i);
    assert.throws(() => resolveGovernedAccessPacketOutPath({
        cwd,
        sourceId: "../escape",
        outPath: "",
    }), /canonical relative path|noncanonical path segment|direct child|canonical data path/i);

    assert.equal(
        resolveGovernedWordSourceInputPath({
            cwd,
            sourcePath: "downloads/word-source-support/jmdict-n4-review.tsv",
            evidenceMode: "support",
        }),
        path.join(cwd, "downloads", "word-source-support", "jmdict-n4-review.tsv")
    );
    assert.throws(() => resolveGovernedWordSourceInputPath({
        cwd,
        sourcePath: "../outside.tsv",
        evidenceMode: "support",
    }), /canonical relative path|noncanonical path segment|direct child/i);
});

test("word source batch merge confines support-mode batch reads to a governed direct child", (t) => {
    const previousCwd = process.cwd();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-merge-batch-path-"));
    const supportDirectory = path.join(temporaryDirectory, "downloads", "word-source-support");
    const nestedDirectory = path.join(supportDirectory, "nested");
    const configPath = path.join(temporaryDirectory, "word-source-inputs.json");
    const sourcePath = path.join(supportDirectory, "support-source.tsv");
    const canonicalBatchPath = path.join(supportDirectory, "canonical-batch.tsv");
    const outsideBatchPath = path.join(temporaryDirectory, "outside-batch.tsv");
    const nestedBatchPath = path.join(nestedDirectory, "nested-batch.tsv");
    const worksheet = "written\treading\n";

    fs.mkdirSync(nestedDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, worksheet, "utf8");
    fs.writeFileSync(canonicalBatchPath, worksheet, "utf8");
    fs.writeFileSync(outsideBatchPath, worksheet, "utf8");
    fs.writeFileSync(nestedBatchPath, worksheet, "utf8");
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            support_source: {
                sourceId: "support_source",
                sourcePath: "downloads/word-source-support/support-source.tsv",
                sourceLabel: "Support source",
                format: "tsv",
                evidenceMode: "support",
                supportProfile: "jmdict-exact-identity",
                importMode: "replace-contract-scope",
                contractLevels: [4],
                requireLevel: false,
            },
        },
    }), "utf8");

    process.chdir(temporaryDirectory);
    t.after(() => {
        process.chdir(previousCwd);
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    const baseOptions = {
        config: configPath,
        source: "support_source",
        write: false,
    };
    const canonical = runWordSourceBatchMergeCommand({
        ...baseOptions,
        batch: "downloads/word-source-support/canonical-batch.tsv",
    });
    assert.equal(canonical.valid, true);

    const acceptedEscapes = [];
    const unexpectedErrors = [];
    for (const [label, batch] of [
        ["traversal", "downloads/word-source-support/../../outside-batch.tsv"],
        ["absolute", outsideBatchPath],
        ["nested", "downloads/word-source-support/nested/nested-batch.tsv"],
    ]) {
        try {
            runWordSourceBatchMergeCommand({ ...baseOptions, batch });
            acceptedEscapes.push(label);
        } catch (error) {
            if (!/canonical relative path|noncanonical path segment|direct child|outside governed/i.test(error.message)) {
                unexpectedErrors.push(`${label}: ${error.message}`);
            }
        }
    }

    assert.deepEqual(unexpectedErrors, []);
    assert.deepEqual(acceptedEscapes, []);
});

test("word source batch merge rejects a support-mode batch junction without consuming its sentinel", (t) => {
    const previousCwd = process.cwd();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-merge-batch-junction-"));
    const supportDirectory = path.join(temporaryDirectory, "downloads", "word-source-support");
    const outsideDirectory = path.join(temporaryDirectory, "outside");
    const linkedDirectory = path.join(supportDirectory, "linked");
    const sourcePath = path.join(supportDirectory, "support-source.tsv");
    const sentinelPath = path.join(outsideDirectory, "sentinel.tsv");
    const configPath = path.join(temporaryDirectory, "word-source-inputs.json");
    const sentinel = "written\treading\n";

    fs.mkdirSync(supportDirectory, { recursive: true });
    fs.mkdirSync(outsideDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, "written\treading\n", "utf8");
    fs.writeFileSync(sentinelPath, sentinel, "utf8");
    fs.symlinkSync(outsideDirectory, linkedDirectory, process.platform === "win32" ? "junction" : "dir");
    fs.writeFileSync(configPath, JSON.stringify({
        version: 1,
        policy: {
            noDeckMutation: true,
            requirePinnedIntegrity: true,
            requireKnownEvidenceSource: true,
        },
        inputs: {
            support_source: {
                sourceId: "support_source",
                sourcePath: "downloads/word-source-support/support-source.tsv",
                sourceLabel: "Support source",
                format: "tsv",
                evidenceMode: "support",
                supportProfile: "jmdict-exact-identity",
                importMode: "replace-contract-scope",
                contractLevels: [4],
                requireLevel: false,
            },
        },
    }), "utf8");

    process.chdir(temporaryDirectory);
    t.after(() => {
        process.chdir(previousCwd);
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    });

    try {
        assert.throws(() => runWordSourceBatchMergeCommand({
            config: configPath,
            source: "support_source",
            batch: "downloads/word-source-support/linked/sentinel.tsv",
            write: false,
        }), /direct child|symbolic link|junction|redirected directory/i);
    } finally {
        assert.equal(fs.readFileSync(sentinelPath, "utf8"), sentinel);
    }
});

test("word source batch merge rejects a governed-parent junction swap before the verified batch open", () => {
    const previousCwd = process.cwd();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-merge-parent-race-"));
    const downloadsDirectory = path.join(temporaryDirectory, "downloads");
    const supportDirectory = path.join(downloadsDirectory, "word-source-support");
    const originalSupportDirectory = path.join(downloadsDirectory, "word-source-support-original");
    const outsideDirectory = path.join(temporaryDirectory, "outside");
    const sourcePath = path.join(supportDirectory, "support-source.tsv");
    const governedBatchPath = path.join(supportDirectory, "batch.tsv");
    const sentinelPath = path.join(outsideDirectory, "batch.tsv");
    const configPath = path.join(temporaryDirectory, "word-source-inputs.json");
    const sourceWorksheet = "written\treading\n";
    const governedBatch = "written\treading\n";
    const externalSentinel = "written\treading\n外\tそと\n";

    fs.mkdirSync(supportDirectory, { recursive: true });
    fs.mkdirSync(outsideDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, sourceWorksheet, "utf8");
    fs.writeFileSync(governedBatchPath, governedBatch, "utf8");
    fs.writeFileSync(sentinelPath, externalSentinel, "utf8");
    writeSupportMergeConfig(configPath);

    const originalCloseSync = fs.closeSync;
    const originalReadFileSync = fs.readFileSync;
    const sentinelHandle = fs.openSync(sentinelPath, "r");
    const sentinelStats = fs.fstatSync(sentinelHandle, { bigint: true });
    let verifiedCloseCount = 0;
    let externalSentinelConsumed = false;
    let commandError = null;
    let observed = null;

    try {
        process.chdir(temporaryDirectory);
        fs.readFileSync = function readFileSyncWithSentinelProbe(file, ...args) {
            if (Number.isInteger(file)) {
                const descriptorStats = fs.fstatSync(file, { bigint: true });
                if (descriptorStats.dev === sentinelStats.dev && descriptorStats.ino === sentinelStats.ino) {
                    externalSentinelConsumed = true;
                }
            }
            return originalReadFileSync.call(fs, file, ...args);
        };
        fs.closeSync = function closeSyncWithGovernedParentSwap(fileHandle) {
            originalCloseSync(fileHandle);
            verifiedCloseCount += 1;
            if (verifiedCloseCount === 1) {
                fs.renameSync(supportDirectory, originalSupportDirectory);
                fs.symlinkSync(
                    outsideDirectory,
                    supportDirectory,
                    process.platform === "win32" ? "junction" : "dir"
                );
            }
        };

        try {
            runWordSourceBatchMergeCommand({
                config: configPath,
                source: "support_source",
                batch: "downloads/word-source-support/batch.tsv",
                allowAdditions: true,
                write: false,
            });
        } catch (error) {
            commandError = error;
        }
        observed = {
            rejected: Boolean(commandError),
            governedPathRejection: Boolean(commandError && /direct child|symbolic link|junction|redirected directory|changed while/i.test(commandError.message)),
            externalSentinelConsumed,
            externalSentinelPreserved: originalReadFileSync.call(fs, sentinelHandle, "utf8") === externalSentinel,
        };
    } finally {
        fs.closeSync = originalCloseSync;
        fs.readFileSync = originalReadFileSync;
        originalCloseSync(sentinelHandle);
        process.chdir(previousCwd);
        if (fs.existsSync(supportDirectory)) {
            fs.rmSync(supportDirectory, { recursive: true, force: true });
        }
        if (fs.existsSync(originalSupportDirectory)) {
            fs.renameSync(originalSupportDirectory, supportDirectory);
        }
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    assert.deepEqual(observed, {
        rejected: true,
        governedPathRejection: true,
        externalSentinelConsumed: false,
        externalSentinelPreserved: true,
    });
});

test("word source batch merge rejects a concurrent source change before write and preserves it", () => {
    const previousCwd = process.cwd();
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jlpt-word-merge-source-race-"));
    const supportDirectory = path.join(temporaryDirectory, "downloads", "word-source-support");
    const sourcePath = path.join(supportDirectory, "support-source.tsv");
    const batchPath = path.join(supportDirectory, "batch.tsv");
    const configPath = path.join(temporaryDirectory, "word-source-inputs.json");
    const header = "written\treading\treviewStatus\tcitation\tevidenceRef\n";
    const originalSource = header
        + "食べる\tたべる\tneeds_review\tSource row 1\trow 1\n";
    const concurrentSource = originalSource
        + "学校\tがっこう\tneeds_review\tConcurrent source row\trow 2\n";
    const reviewedBatch = header
        + "食べる\tたべる\treviewed\tSource row 1\trow 1\n";

    fs.mkdirSync(supportDirectory, { recursive: true });
    fs.writeFileSync(sourcePath, originalSource, "utf8");
    fs.writeFileSync(batchPath, reviewedBatch, "utf8");
    writeSupportMergeConfig(configPath);

    const originalCloseSync = fs.closeSync;
    let verifiedCloseCount = 0;
    let sourceMutationInjected = false;
    let commandError = null;
    let observed = null;

    try {
        process.chdir(temporaryDirectory);
        fs.closeSync = function closeSyncWithConcurrentSourceChange(fileHandle) {
            originalCloseSync(fileHandle);
            verifiedCloseCount += 1;
            if (verifiedCloseCount === 1) {
                fs.writeFileSync(sourcePath, concurrentSource, "utf8");
                sourceMutationInjected = true;
            }
        };

        try {
            runWordSourceBatchMergeCommand({
                config: configPath,
                source: "support_source",
                batch: "downloads/word-source-support/batch.tsv",
                write: true,
            });
        } catch (error) {
            commandError = error;
        }
        observed = {
            sourceMutationInjected,
            rejected: Boolean(commandError),
            concurrentChangeRejection: Boolean(commandError && /changed|concurrent|stale|integrity/i.test(commandError.message)),
            concurrentSourcePreserved: fs.readFileSync(sourcePath, "utf8") === concurrentSource,
        };
    } finally {
        fs.closeSync = originalCloseSync;
        process.chdir(previousCwd);
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }

    assert.deepEqual(observed, {
        sourceMutationInjected: true,
        rejected: true,
        concurrentChangeRejection: true,
        concurrentSourcePreserved: true,
    });
});

test("word source access packets keep support-only evidence separate from JLPT placement", () => {
    const packet = buildWordSourceAccessPacket({
        sourceId: "jmdict",
        checkedAt: "2026-08-23",
        evidenceRole: "support-only",
        allowedSupportClaims: ["dictionary-identity"],
        sourceSurface: {
            type: "permitted-machine-readable-source",
            title: "JMdict normalized exact-identity snapshot",
            citation: "EDRDG JMdict; CC BY-SA 4.0",
            evidenceRef: "JMdict 2026-08-23; pinned SHA-256",
        },
    });

    assert.equal(validateWordSourceAccessPacket({
        packet,
        expectedSourceId: "jmdict",
        expectedEvidenceRole: "support-only",
    }).valid, true);
    assert.equal(validateWordSourceAccessPacket({
        packet,
        expectedSourceId: "jmdict",
        expectedEvidenceRole: "jlpt-placement",
    }).valid, false);

    const claimless = buildWordSourceAccessPacket({
        sourceId: "jmdict",
        checkedAt: "2026-08-23",
        evidenceRole: "support-only",
        sourceSurface: packet.sourceSurface,
    });
    assert.match(validateWordSourceAccessPacket({ packet: claimless }).blockers.join("; "), /allowedSupportClaims/);
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
        supportRecords: {
            dictionary_source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    reviewStatus: "reviewed",
                    citation: "Dictionary source; https://example.com/dictionary.xml.gz; snapshot dictionary-v1",
                    evidenceRef: `ignored/dictionary.json; sha256=${"b".repeat(64)}; row=1; identity=${encodeURIComponent("食べる|たべる")}`,
                    supportClaims: ["dictionary-identity"],
                    evidence: {
                        kind: "exact-dictionary-entry",
                        snapshotVersion: "dictionary-v1",
                        normalizedSourceSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        entryIds: ["1"],
                    },
                },
            },
            commonness_source: {
                "食べる|たべる": {
                    written: "食べる",
                    reading: "たべる",
                    reviewStatus: "reviewed",
                    citation: "Commonness source; https://example.com/commonness.xml.gz; snapshot commonness-v1",
                    evidenceRef: `ignored/commonness.json; sha256=${"d".repeat(64)}; row=1; identity=${encodeURIComponent("食べる|たべる")}`,
                    supportClaims: ["commonness"],
                    evidence: {
                        kind: "dictionary-priority",
                        snapshotVersion: "commonness-v1",
                        normalizedSourceSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
                        priorityTags: ["news1"],
                        frequencyRank: 1,
                    },
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

test("source consensus cannot promote an identity absent from the operational contract", () => {
    const identity = "外|そと";
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
                [identity]: { written: "外", reading: "そと", level: 4, reviewStatus: "reviewed", citation: "A", evidenceRef: "1" },
            },
            source_b: {
                [identity]: { written: "外", reading: "そと", level: 4, reviewStatus: "reviewed", citation: "B", evidenceRef: "1" },
            },
            source_c: {
                [identity]: { written: "外", reading: "そと", level: 4, reviewStatus: "reviewed", citation: "C", evidenceRef: "1" },
            },
        },
    });
    const report = auditJlptWordSourceEvidence({
        contract: { wordLevels: {} },
        evidence,
    });
    const row = report.wordSourcePosture.find((entry) => entry.identity === identity);

    assert.equal(row.contractLevel, null);
    assert.notEqual(row.posture, "level_universe_standard");
    assert.equal(report.evidenceDepthValid, false);
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

test("word source assignment files load only from the canonical source-keyed path", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-source-evidence-"));
    const assignmentDir = path.join(tempDir, "jlpt_word_source_evidence", "assignments");
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
            source_a: "jlpt_word_source_evidence/assignments/source_a.json",
        },
    }), "utf8");

    const evidence = loadJlptWordSourceEvidence(manifestPath);
    assert.equal(evidence.assignments.source_a["食べる|たべる"].level, 5);

    const redirectedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    redirectedManifest.assignmentFiles.source_a = "outside.json";
    assert.throws(
        () => normalizeJlptWordSourceEvidence(redirectedManifest, { manifestPath }),
        /canonical data path/i
    );
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
    assert.equal(source.local.rowCount, 65663);
    assert.equal(source.local.byteSize, 24661425);
    assert.equal(source.local.sha256, "94e2a07b3ada7eab306e8e3823730a38d0ab5572eb80ff809c4daaa2f3f2f2e7");
    assert.equal(source.upstreamSnapshot.version, "7cb5fb36add76b83a266d1967536e1a1d3faa513");
    assert.equal(source.upstreamSnapshot.sha256, "39d4edb2ccac4405b47d0f93e9ec7b11678b3b305d1a37c877dd76588817c8e9");
});
