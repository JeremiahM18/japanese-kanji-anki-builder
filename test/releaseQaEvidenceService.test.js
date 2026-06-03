const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/validateReleaseQaEvidence");
const {
    DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    REQUIRED_MANUAL_EVIDENCE_IDS,
    buildReleaseQaEvidenceReport,
    loadReleaseQaEvidencePacket,
} = require("../src/services/releaseQaEvidenceService");

const repoRoot = path.resolve(__dirname, "..");

function reviewedEvidence(overrides = {}) {
    return {
        status: "passed",
        reviewer: "Release reviewer",
        reviewedAt: "2026-06-02",
        evidence: "Reviewed release-candidate evidence.",
        ...overrides,
    };
}

function passingPacket() {
    return {
        version: 1,
        authority: {
            sourceOfTruth: "tracked-release-qa-evidence-packet",
        },
        scope: {
            releaseCandidateId: "v1.0.0-test",
            deckKinds: ["kanji", "word"],
            levels: [5, 4],
        },
        automatedEvidence: [
            reviewedEvidence({
                id: "release-trust",
                command: "npm run security:release-trust",
            }),
            reviewedEvidence({
                id: "release-gate",
                command: "npm run release:gate",
            }),
            reviewedEvidence({
                id: "product-release-qa-gate",
                command: "npm run product:artifacts:kanji:release-qa",
            }),
        ],
        manualEvidence: REQUIRED_MANUAL_EVIDENCE_IDS.map((id) => reviewedEvidence({ id })),
        sourceGovernance: {
            status: "passed",
            nonVotingLanesRemainNonVoting: true,
            sourceAccessGapsPromoted: false,
            manualCitationOnlyPromoted: false,
            commands: [
                "npm run data:audit:jlpt:sources -- --governance-strict --limit=25",
                "npm run product:artifacts:kanji:all",
            ],
        },
        knownBlockers: [],
    };
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf-8"));
}

test("release QA evidence report passes only with complete release evidence", () => {
    const report = buildReleaseQaEvidenceReport({
        packet: passingPacket(),
        packetPath: "out/release-qa/release-qa-evidence.json",
    });

    assert.equal(report.passed, true);
    assert.equal(report.releaseCandidateId, "v1.0.0-test");
    assert.deepEqual(report.requiredManualEvidenceIds, REQUIRED_MANUAL_EVIDENCE_IDS);
    assert.equal(report.automatedEvidenceCount, 3);
    assert.equal(report.manualEvidenceCount, REQUIRED_MANUAL_EVIDENCE_IDS.length);
    assert.deepEqual(report.failures, []);
});

test("release QA evidence template is fail-closed until every entry is replaced", () => {
    const template = readJson("templates/release_qa_evidence_packet.template.json");
    const report = buildReleaseQaEvidenceReport({ packet: template });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("automatedEvidence release-trust must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("manualEvidence apkg-import must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sourceGovernance.status must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("knownBlockers must be empty")), true);
});

test("release QA evidence report requires all manual evidence and explicit empty blockers", () => {
    const packet = passingPacket();
    packet.manualEvidence = packet.manualEvidence.filter((entry) => entry.id !== "listening-qa");
    delete packet.knownBlockers;

    const report = buildReleaseQaEvidenceReport({ packet });

    assert.equal(report.passed, false);
    assert.equal(report.failures.includes("manualEvidence is missing required entry: listening-qa."), true);
    assert.equal(report.failures.includes("knownBlockers must be an array and must be empty before release-ready claims."), true);
});

test("release QA evidence loader and CLI parsing support packet path overrides", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "release-qa-evidence-"));
    const packetPath = path.join(tempDir, "packet.json");
    fs.writeFileSync(packetPath, JSON.stringify(passingPacket()), "utf-8");

    const loaded = loadReleaseQaEvidencePacket(packetPath);
    assert.equal(loaded.packetPath, path.resolve(packetPath));
    assert.equal(loaded.packet.scope.releaseCandidateId, "v1.0.0-test");
    assert.deepEqual(parseArgs([]), {
        json: false,
        packetPath: DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
        unknownArgs: [],
    });
    assert.deepEqual(parseArgs(["--json", "--packet=custom.json"]), {
        json: true,
        packetPath: "custom.json",
        unknownArgs: [],
    });
    assert.throws(
        () => loadReleaseQaEvidencePacket(path.join(tempDir, "missing.json")),
        /Release QA evidence packet not found/
    );
});
