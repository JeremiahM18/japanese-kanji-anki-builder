const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION,
    WORD_SILVER_PACKET_SCHEMA_VERSION,
    applyWordSilverDecisionManifest,
    buildWordSilverReviewPacketArtifact,
    formatWordSilverApplyReport,
    parseWordSilverDecisionManifest,
} = require("../src/services/wordSilverReviewPipelineService");

function buildSelectorReportFixture() {
    return {
        queueMode: "silver",
        placementMode: "vocabulary-level",
        levelReports: [
            {
                level: 4,
                sourceUniverse: {
                    sourceId: "dictionary-common-pool",
                    sourceName: "Dictionary common pool",
                },
                totals: {
                    readyForEditorialReview: 1,
                },
                shownRows: [
                    {
                        written: "工事",
                        reading: "こうじ",
                        selectorStatus: "ready_for_editorial_review",
                        sourceDisposition: "review_candidate",
                        sourceLaneLabel: "EXTRA SOURCE FAMILY",
                        sourcePoolLabel: "DICTIONARY COMMON POOL",
                        sourceLevelClaimLabel: "Source level claim unverified",
                        sourceLevelClaimStatus: "warning",
                        dictionaryVerified: true,
                        commonnessSupported: true,
                        frequencySupported: true,
                        sentenceSupported: false,
                        pitchSupported: true,
                        cleanIdentity: true,
                        learnerValueBucket: "core_candidate",
                        learnerUtility: {
                            score: 91,
                            band: "strong_review_candidate",
                            reasons: ["common everyday activity"],
                            penalties: [],
                        },
                        frequencyEvidence: {
                            sourceId: "tubelex-ja-frequency",
                            rank: 1200,
                            matchStatus: "exact",
                        },
                        triageDecision: {
                            decision: "keep_candidate",
                            reason: "Useful and common enough for review.",
                        },
                        sameWrittenConflicts: [],
                        supportLabelNeeds: [],
                        learnerFitRisks: [],
                        identityRisks: [],
                        nextRequiredEvidence: [],
                    },
                ],
            },
        ],
    };
}

function buildValidCard() {
    return {
        written: "工事",
        reading: "こうじ",
        meaning: "construction work",
        source: "dictionary-common-pool",
        tags: ["common", "n4", "starter"],
        jlpt: 4,
        notes:
            "DICTIONARY COMMON POOL; Source level claim unverified. Silver-only row that still needs Gold/Sapphire/Platinum/Obsidian catch-up.",
        readingBreakdown: "<ruby>工事<rt>こうじ</rt></ruby>",
        exampleSentence: {
            japanese: "駅の近くで工事をしています。",
            reading: "えきのちかくでこうじをしています。",
            english: "They are doing construction work near the station.",
            source: "editorial-review",
            tags: ["n4"],
        },
        coverage: {
            role: "support",
            focusKanji: ["工", "事"],
            coversReadings: {
                工: "こう",
                事: "じ",
            },
        },
        levelPlacement: {
            mode: "vocabulary-level",
            reason:
                "DICTIONARY COMMON POOL; Source level claim unverified; common everyday N4-fit support vocabulary.",
        },
    };
}

function buildValidManifest(decision = "keep") {
    const row = {
        identity: "工事|こうじ",
        written: "工事",
        reading: "こうじ",
        level: 4,
        sourceId: "dictionary-common-pool",
        sourcePoolLabel: "DICTIONARY COMMON POOL",
        sourceLevelClaimLabel: "Source level claim unverified",
        decision,
        rationale:
            "Common everyday vocabulary with useful learner value and a clear card surface.",
        decisionEvidence: {
            sourceEvidenceReviewed:
                "JMdict dictionary/common-pool support reviewed with claim labels preserved.",
            learnerFitReviewed:
                "Meaning, example, reading breakdown, and N4 usefulness reviewed for a beginner learner.",
            duplicateRiskReviewed:
                "Exact written+reading identity checked; no same-written conflict blocks the row.",
            productRiskReviewed:
                "Card surface, support labels, media implications, and downstream backlog posture reviewed.",
        },
        card: buildValidCard(),
    };

    if (decision !== "keep" && decision !== "fix") {
        delete row.card;
        row.blockedReasons = ["Decision is intentionally non-apply for this test."];
    }

    return {
        schemaVersion: WORD_SILVER_DECISION_MANIFEST_SCHEMA_VERSION,
        authority: {
            reviewerKind: "codex_editorial_review",
            certifiesObsidianProof: false,
            claimsNativeHumanReview: false,
            writesTrackedTemplatesOnlyThroughApplicator: true,
        },
        batchId: "word-silver-test-batch",
        levels: [4],
        reviewer: {
            kind: "codex_editorial_review",
            name: "Codex",
            reviewedAt: "2026-07-07T00:00:00.000Z",
        },
        sourcePacket: {
            batchId: "word-silver-source-packet",
            schemaVersion: WORD_SILVER_PACKET_SCHEMA_VERSION,
        },
        decisions: [row],
    };
}

function writeJson(filePath, value) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

test("word Silver packet artifacts preserve pre-trust authority and review signals", () => {
    const packet = buildWordSilverReviewPacketArtifact({
        selectorReport: buildSelectorReportFixture(),
        batchId: "word-silver-packet-test",
        limit: 25,
        queueMode: "silver",
        placementMode: "vocabulary-level",
        source: "common-pool",
    });

    assert.equal(packet.schemaVersion, WORD_SILVER_PACKET_SCHEMA_VERSION);
    assert.equal(packet.authority.writesTrackedTemplates, false);
    assert.equal(packet.authority.certifiesCards, false);
    assert.equal(packet.totals.rows, 1);

    const [row] = packet.levelPackets[0].rows;
    assert.equal(row.identity, "工事|こうじ");
    assert.equal(row.source.sourcePoolLabel, "DICTIONARY COMMON POOL");
    assert.equal(row.source.sourceLevelClaimLabel, "Source level claim unverified");
    assert.ok(row.allowedDecisions.includes("reject"));
    assert.match(row.editorialChecklist.join(" "), /duplicate\/variant/);
});

test("word Silver decision manifests reject fake human review provenance", () => {
    const manifest = buildValidManifest();
    manifest.authority.reviewerKind = "human_review";
    manifest.reviewer.kind = "human_review";

    const validation = parseWordSilverDecisionManifest(manifest);

    assert.equal(validation.ok, false);
    assert.match(validation.errors.join("\n"), /expected "codex_editorial_review"/);
});

test("word Silver decision manifests require full labeled card surface for keep", () => {
    const manifest = buildValidManifest();
    delete manifest.decisions[0].card.exampleSentence;
    manifest.decisions[0].card.notes = "Useful N4 word.";
    manifest.decisions[0].card.levelPlacement.reason = "Useful N4 word.";

    const validation = parseWordSilverDecisionManifest(manifest);

    assert.equal(validation.ok, false);
    assert.match(validation.errors.join("\n"), /exampleSentence is required/);
    assert.match(validation.errors.join("\n"), /DICTIONARY COMMON POOL/);
    assert.match(validation.errors.join("\n"), /Source level claim unverified/);
});

test("word Silver applicator dry-runs then writes starter and contract updates", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-silver-apply-"));
    const templatesDir = path.join(rootDir, "templates");
    const starterPath = path.join(templatesDir, "starter_word_study_data_n4.json");
    const contractPath = path.join(templatesDir, "jlpt_word_level_contract.json");
    const manifestPath = path.join(rootDir, "manifest.json");

    writeJson(starterPath, {});
    writeJson(contractPath, {
        version: 1,
        inventoryCounts: {
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0,
            "5": 0,
        },
        excludedCounts: {
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0,
            "5": 0,
        },
        wordLevels: {},
        excludedWordLevels: {},
    });
    writeJson(manifestPath, buildValidManifest());

    const dryRun = applyWordSilverDecisionManifest({
        manifestPath,
        rootDir,
        write: false,
    });

    assert.equal(dryRun.mode, "dry-run");
    assert.equal(dryRun.appliedRows.length, 1);
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(starterPath, "utf8"))).length, 0);

    const writeReport = applyWordSilverDecisionManifest({
        manifestPath,
        rootDir,
        write: true,
    });

    const starter = JSON.parse(fs.readFileSync(starterPath, "utf8"));
    const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));

    assert.equal(writeReport.mode, "write");
    assert.equal(starter["工事|こうじ"].meaning, "construction work");
    assert.equal(contract.wordLevels["工事|こうじ"].jlpt, 4);
    assert.equal(contract.inventoryCounts["4"], 1);
    assert.match(formatWordSilverApplyReport(writeReport), /Required follow-up verification/);
});

test("word Silver applicator rejects cross-level fixes for existing identities", () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "word-silver-cross-level-"));
    const templatesDir = path.join(rootDir, "templates");
    const starterPath = path.join(templatesDir, "starter_word_study_data_n4.json");
    const contractPath = path.join(templatesDir, "jlpt_word_level_contract.json");
    const manifestPath = path.join(rootDir, "manifest.json");
    const manifest = buildValidManifest("fix");

    writeJson(starterPath, {});
    writeJson(contractPath, {
        version: 1,
        inventoryCounts: {
            "1": 0,
            "2": 0,
            "3": 1,
            "4": 0,
            "5": 0,
        },
        excludedCounts: {
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0,
            "5": 0,
        },
        wordLevels: {
            "工事|こうじ": {
                written: "工事",
                reading: "こうじ",
                jlpt: 3,
            },
        },
        excludedWordLevels: {},
    });
    writeJson(manifestPath, manifest);

    assert.throws(
        () => {
            try {
                applyWordSilverDecisionManifest({
                    manifestPath,
                    rootDir,
                    write: false,
                });
            } catch (error) {
                assert.match(error.errors.join("\n"), /already exists as N3/);
                throw error;
            }
        },
        /Word Silver decision manifest apply failed/
    );
});
