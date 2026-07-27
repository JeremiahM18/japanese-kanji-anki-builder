const crypto = require("node:crypto");
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
const { readGitHead } = require("../src/utils/gitRepository");

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

function createCandidateFixture(t, {
    deckKinds = ["kanji", "word"],
    levels = [5, 4],
} = {}) {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-qa-candidate-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    const repositoryCommit = "a".repeat(40);
    const releaseCandidateId = "v1.0.0-test";
    fs.mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), `${repositoryCommit}\n`, "utf-8");

    const artifacts = deckKinds.map((deckKind) => {
        const artifactBytes = Buffer.from(`release artifact for ${deckKind}\n`, "utf-8");
        const portablePath = [
            "out",
            "run-outputs",
            releaseCandidateId,
            `${deckKind}-n${levels.join("-n")}`,
            "package",
            `${deckKind}-deck.apkg`,
        ].join("/");
        const artifactPath = path.join(repositoryRoot, ...portablePath.split("/"));
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
        fs.writeFileSync(artifactPath, artifactBytes);
        return {
            deckKind,
            path: portablePath,
            bytes: artifactBytes.length,
            sha256: crypto.createHash("sha256").update(artifactBytes).digest("hex"),
        };
    });

    return {
        artifacts,
        deckKinds,
        levels,
        releaseCandidateId,
        repositoryCommit,
        repositoryRoot,
    };
}

function passingPacket(fixture) {
    return {
        version: 2,
        authority: {
            sourceOfTruth: "tracked-release-qa-evidence-packet",
        },
        scope: {
            releaseCandidateId: fixture.releaseCandidateId,
            repositoryCommit: fixture.repositoryCommit,
            deckKinds: fixture.deckKinds,
            levels: fixture.levels,
            artifacts: fixture.artifacts.map((artifact) => ({ ...artifact })),
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
            reviewer: "Source-governance reviewer",
            reviewedAt: "2026-06-02",
            evidence: "Source-access audit rerun; source-use governance passed, source-depth remains incomplete, and paused lanes remained non-voting under accepted GOV-SRC-001 posture.",
            sourceEvidenceDepthComplete: false,
            freePublicSourceExpansionPaused: true,
            acceptedRiskRecord: "GOV-SRC-001",
            nonVotingLanesRemainNonVoting: true,
            sourceAccessGapsPromoted: false,
            manualCitationOnlyPromoted: false,
            commands: [
                "npm run data:audit:jlpt:source-access",
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

test("release QA evidence report passes only with exact commit and artifact bindings", (t) => {
    const fixture = createCandidateFixture(t);
    const report = buildReleaseQaEvidenceReport({
        packet: passingPacket(fixture),
        packetPath: "out/release-qa/release-qa-evidence.json",
        repositoryRoot: fixture.repositoryRoot,
    });

    assert.equal(report.passed, true);
    assert.equal(report.packetVersion, 2);
    assert.equal(report.releaseCandidateId, fixture.releaseCandidateId);
    assert.equal(report.repositoryCommit, fixture.repositoryCommit);
    assert.equal(report.currentRepositoryCommit, fixture.repositoryCommit);
    assert.equal(report.artifactCount, 2);
    assert.equal(report.verifiedArtifactCount, 2);
    assert.equal(report.artifacts.every((artifact) => artifact.verified), true);
    assert.deepEqual(report.requiredManualEvidenceIds, REQUIRED_MANUAL_EVIDENCE_IDS);
    assert.equal(report.automatedEvidenceCount, 3);
    assert.equal(report.manualEvidenceCount, REQUIRED_MANUAL_EVIDENCE_IDS.length);
    assert.deepEqual(report.failures, []);
});

test("release QA evidence template is fail-closed until every entry and candidate binding is replaced", () => {
    const template = readJson("templates/release_qa_evidence_packet.template.json");
    const report = buildReleaseQaEvidenceReport({ packet: template });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("scope.repositoryCommit")), true);
    assert.equal(report.failures.some((failure) => failure.includes("bytes must be a positive safe integer")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sha256 must be 64 lowercase")), true);
    assert.equal(report.failures.some((failure) => failure.includes("automatedEvidence release-trust must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("manualEvidence apkg-import must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sourceGovernance.status must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("knownBlockers must be empty")), true);
});

test("release QA evidence report requires all manual evidence and explicit empty blockers", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.manualEvidence = packet.manualEvidence.filter((entry) => entry.id !== "listening-qa");
    delete packet.knownBlockers;

    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });

    assert.equal(report.passed, false);
    assert.equal(report.failures.includes("manualEvidence is missing required entry: listening-qa."), true);
    assert.equal(report.failures.includes("knownBlockers must be an array and must be empty before release-ready claims."), true);
});

test("release QA evidence report requires accepted source-governance posture when source depth is incomplete", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.sourceGovernance.acceptedRiskRecord = "";
    packet.sourceGovernance.freePublicSourceExpansionPaused = false;
    packet.sourceGovernance.commands = ["npm run product:artifacts:kanji:all"];

    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });

    assert.equal(report.passed, false);
    assert.equal(
        report.failures.includes("sourceGovernance.acceptedRiskRecord must be GOV-SRC-001 when source evidence depth is incomplete."),
        true
    );
    assert.equal(
        report.failures.includes("sourceGovernance.freePublicSourceExpansionPaused must be true when source evidence depth is incomplete."),
        true
    );
    assert.equal(
        report.failures.includes("sourceGovernance.commands must include npm run data:audit:jlpt:source-access."),
        true
    );
});

test("release QA evidence report rejects commit drift and artifact tampering", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.scope.repositoryCommit = "b".repeat(40);
    const artifactPath = path.join(fixture.repositoryRoot, ...packet.scope.artifacts[0].path.split("/"));
    fs.appendFileSync(artifactPath, "tampered", "utf-8");

    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });

    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("does not match repository HEAD")), true);
    assert.equal(report.failures.some((failure) => failure.includes("byte size mismatch")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sha256 mismatch")), true);
    assert.equal(report.artifacts[0].verified, false);
});

test("release QA evidence report rejects path escapes, duplicate artifacts, and incomplete deck binding", (t) => {
    const fixture = createCandidateFixture(t);
    const escapedPacket = passingPacket(fixture);
    escapedPacket.scope.artifacts[0].path = "../outside.apkg";
    let report = buildReleaseQaEvidenceReport({
        packet: escapedPacket,
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.equal(report.failures.some((failure) => failure.includes("portable repository-relative path")), true);

    const wrongScopePacket = passingPacket(fixture);
    wrongScopePacket.scope.artifacts[0].path = wrongScopePacket.scope.artifacts[0].path.replace("kanji-n5-n4", "kanji-n5");
    report = buildReleaseQaEvidenceReport({
        packet: wrongScopePacket,
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.equal(report.failures.some((failure) => failure.includes("exact isolated scope")), true);

    const duplicatePacket = passingPacket(fixture);
    duplicatePacket.scope.artifacts.push({ ...duplicatePacket.scope.artifacts[0] });
    report = buildReleaseQaEvidenceReport({
        packet: duplicatePacket,
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.equal(report.failures.some((failure) => failure.includes("contains duplicate path")), true);
    assert.equal(report.failures.some((failure) => failure.includes("exactly one APKG for deck kind kanji; found 2")), true);

    const incompletePacket = passingPacket(fixture);
    incompletePacket.scope.artifacts = incompletePacket.scope.artifacts.filter(({ deckKind }) => deckKind !== "word");
    report = buildReleaseQaEvidenceReport({
        packet: incompletePacket,
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.equal(report.failures.includes("scope.artifacts must contain exactly one APKG for deck kind word; found 0."), true);
});

test("release QA evidence report rejects malformed scope and artifact integrity declarations", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.scope.releaseCandidateId = "../unsafe";
    packet.scope.repositoryCommit = fixture.repositoryCommit.toUpperCase();
    packet.scope.deckKinds = ["kanji", "kanji"];
    packet.scope.levels = [5, 5];
    packet.scope.artifacts[0].bytes = 0;
    packet.scope.artifacts[0].sha256 = packet.scope.artifacts[0].sha256.toUpperCase();

    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });

    assert.equal(report.passed, false);
    assert.equal(report.failures.includes("scope.releaseCandidateId must be a safe run id accepted by --run-id."), true);
    assert.equal(report.failures.includes("scope.repositoryCommit must be a full 40-character lowercase Git SHA."), true);
    assert.equal(
        report.failures.includes("scope.deckKinds must contain unique canonical deck kinds: kanji and/or word."),
        true
    );
    assert.equal(report.failures.includes("scope.levels must contain unique integer JLPT levels from 1 through 5."), true);
    assert.equal(report.failures.some((failure) => failure.includes("bytes must be a positive safe integer")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sha256 must be 64 lowercase")), true);
});

test("release QA evidence loader and CLI parsing support packet path overrides", (t) => {
    const fixture = createCandidateFixture(t);
    const packetPath = path.join(fixture.repositoryRoot, "packet.json");
    fs.writeFileSync(packetPath, JSON.stringify(passingPacket(fixture)), "utf-8");

    const loaded = loadReleaseQaEvidencePacket(packetPath);
    assert.equal(loaded.packetPath, path.resolve(packetPath));
    assert.equal(loaded.packet.scope.releaseCandidateId, fixture.releaseCandidateId);
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
        () => loadReleaseQaEvidencePacket(path.join(fixture.repositoryRoot, "missing.json")),
        /Release QA evidence packet not found/
    );
});

test("Git HEAD resolution supports worktree pointers and packed refs without shelling out", (t) => {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-qa-worktree-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));
    const gitDirectory = path.join(repositoryRoot, ".git-data");
    const repositoryCommit = "c".repeat(40);
    fs.mkdirSync(gitDirectory, { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, ".git"), "gitdir: .git-data\n", "utf-8");
    fs.writeFileSync(path.join(gitDirectory, "HEAD"), "ref: refs/heads/release\n", "utf-8");
    fs.writeFileSync(
        path.join(gitDirectory, "packed-refs"),
        `# pack-refs with: peeled fully-peeled sorted\n${repositoryCommit} refs/heads/release\n`,
        "utf-8"
    );

    assert.equal(readGitHead(repositoryRoot), repositoryCommit);
});
