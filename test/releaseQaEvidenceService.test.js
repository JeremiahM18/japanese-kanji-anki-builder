const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parseArgs } = require("../scripts/validateReleaseQaEvidence");
const {
    AUTOMATION_REVIEWED_PREVIEW_LABEL,
    DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    REQUIRED_ARTIFACT_QA_EVIDENCE_IDS,
    REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS,
    buildReleaseQaEvidenceReport,
    loadReleaseQaEvidencePacket,
} = require("../src/services/releaseQaEvidenceService");
const { readGitHead } = require("../src/utils/gitRepository");

const repoRoot = path.resolve(__dirname, "..");
const limitationByEvidenceId = Object.freeze({
    "apkg-import": "desktop-anki-import-not-performed",
    "manual-anki-import": "desktop-anki-import-not-performed",
    "mobile-qa": "mobile-qa-not-performed",
    "screen-reader-accessibility": "screen-reader-interaction-not-performed",
    "listening-qa": "listening-naturalness-not-performed",
});

function reviewedEvidence(repositoryCommit, overrides = {}) {
    return {
        status: "passed",
        reviewer: "Automated release verifier",
        reviewedAt: "2026-08-01",
        repositoryCommit,
        evidence: "Verified release-candidate evidence.",
        ...overrides,
    };
}

function acceptedRiskEvidence(repositoryCommit, id) {
    return reviewedEvidence(repositoryCommit, {
        id,
        status: "accepted-risk",
        reviewer: "Repository owner",
        acceptedRiskRecord: "PROD-REL-001",
        limitation: limitationByEvidenceId[id],
        evidence: "Automated coverage passed; the named human or device check was not performed and remains an accepted preview limitation.",
    });
}

function createCandidateFixture(t, {
    deckKinds = ["kanji", "word"],
    levels = [5, 4],
    levelsByDeckKind = {},
} = {}) {
    const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-qa-candidate-"));
    t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

    const repositoryCommit = "a".repeat(40);
    const releaseCandidateId = "n5-release-fixture";
    const releaseVersion = "1.0.0-beta.1";
    fs.mkdirSync(path.join(repositoryRoot, ".git"), { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, ".git", "HEAD"), `${repositoryCommit}\n`, "utf-8");
    fs.writeFileSync(path.join(repositoryRoot, "package.json"), JSON.stringify({ version: releaseVersion }), "utf-8");

    const artifacts = deckKinds.map((deckKind) => {
        const artifactLevels = levelsByDeckKind[deckKind] || levels;
        const artifactBytes = Buffer.from(`release artifact for ${deckKind}\n`, "utf-8");
        const releaseAssetName = `${deckKind}-deck.apkg`;
        const portablePath = [
            "out",
            "run-outputs",
            releaseCandidateId,
            `${deckKind}-n${artifactLevels.join("-n")}`,
            "package",
            releaseAssetName,
        ].join("/");
        const artifactPath = path.join(repositoryRoot, ...portablePath.split("/"));
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
        fs.writeFileSync(artifactPath, artifactBytes);
        return {
            deckKind,
            levels: [...artifactLevels],
            path: portablePath,
            releaseAssetName,
            notes: 10,
            cards: 10,
            mediaEntries: 20,
            bytes: artifactBytes.length,
            sha256: crypto.createHash("sha256").update(artifactBytes).digest("hex"),
        };
    });

    return {
        artifacts,
        deckKinds,
        releaseCandidateId,
        releaseVersion,
        repositoryCommit,
        repositoryRoot,
    };
}

function passingPacket(fixture, { releaseClass = "automation-reviewed-preview" } = {}) {
    const isPreview = releaseClass === "automation-reviewed-preview";
    const releaseVersion = isPreview ? fixture.releaseVersion : "1.0.0";
    return {
        version: 3,
        authority: { sourceOfTruth: "tracked-release-qa-evidence-packet" },
        scope: {
            releaseVersion,
            releaseTag: `v${releaseVersion}`,
            releaseClass,
            releaseCandidateId: fixture.releaseCandidateId,
            repositoryCommit: fixture.repositoryCommit,
            deckKinds: fixture.deckKinds,
            artifacts: fixture.artifacts.map((artifact) => ({ ...artifact })),
        },
        releasePolicy: isPreview ? {
            distribution: "github-prerelease",
            label: AUTOMATION_REVIEWED_PREVIEW_LABEL,
            humanQa: {
                status: "owner-accepted-deferred",
                acceptedRiskRecord: "PROD-REL-001",
                owner: "Repository owner",
                acceptedAt: "2026-08-01",
                nextReview: "2027-08-01",
                rationale: "A labeled preview is useful now; unavailable human and device checks remain explicit and unclaimed.",
                limitations: [...REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS],
            },
        } : {
            distribution: "github-release",
            label: "Production release",
            humanQa: { status: "passed" },
        },
        automatedEvidence: [
            reviewedEvidence(fixture.repositoryCommit, {
                id: "release-trust-pre",
                command: "npm run security:release-trust:pre",
            }),
            reviewedEvidence(fixture.repositoryCommit, {
                id: "release-gate",
                command: "npm run release:gate",
            }),
            reviewedEvidence(fixture.repositoryCommit, {
                id: "n5-readiness",
                command: "npm run product:readiness:n5",
            }),
            reviewedEvidence(fixture.repositoryCommit, {
                id: "apkg-structural-inspection",
                command: "npm run product:release-qa:apkg-inspect -- --packet=out/release-qa/release-qa-evidence.json --artifact-dir=out/run-outputs/n5-release-fixture --require-golden",
            }),
        ],
        artifactQaEvidence: REQUIRED_ARTIFACT_QA_EVIDENCE_IDS.map((id) => (
            !isPreview || id === "managed-media-provenance"
                ? reviewedEvidence(fixture.repositoryCommit, { id })
                : acceptedRiskEvidence(fixture.repositoryCommit, id)
        )),
        sourceGovernance: {
            status: "passed",
            reviewer: "Source-governance verifier",
            reviewedAt: "2026-08-01",
            repositoryCommit: fixture.repositoryCommit,
            evidence: "Source-access and strict source-use audits passed; incomplete source depth remains governed by GOV-SRC-001.",
            sourceEvidenceDepthComplete: false,
            freePublicSourceExpansionPaused: true,
            acceptedRiskRecord: "GOV-SRC-001",
            nonVotingLanesRemainNonVoting: true,
            sourceAccessGapsPromoted: false,
            manualCitationOnlyPromoted: false,
            commands: [
                "npm run data:audit:jlpt:source-access",
                "npm run data:audit:jlpt:sources -- --governance-strict --limit=25",
            ],
        },
        knownBlockers: [],
    };
}

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf-8"));
}

test("automation-reviewed preview passes only with exact candidate, policy, commit, and artifact bindings", (t) => {
    const fixture = createCandidateFixture(t);
    const report = buildReleaseQaEvidenceReport({
        packet: passingPacket(fixture),
        packetPath: "out/release-qa/release-qa-evidence.json",
        repositoryRoot: fixture.repositoryRoot,
    });

    assert.equal(report.passed, true);
    assert.equal(report.packetVersion, 3);
    assert.equal(report.releaseVersion, fixture.releaseVersion);
    assert.equal(report.releaseTag, `v${fixture.releaseVersion}`);
    assert.equal(report.releaseClass, "automation-reviewed-preview");
    assert.equal(report.repositoryCommit, fixture.repositoryCommit);
    assert.equal(report.verifiedArtifactCount, 2);
    assert.equal(report.acceptedRiskEvidenceCount, 5);
    assert.deepEqual(report.requiredArtifactQaEvidenceIds, REQUIRED_ARTIFACT_QA_EVIDENCE_IDS);
    assert.deepEqual(report.failures, []);
});

test("production release passes with every artifact QA item passed and rejects accepted-risk", (t) => {
    const fixture = createCandidateFixture(t);
    fs.writeFileSync(path.join(fixture.repositoryRoot, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf-8");
    const packet = passingPacket(fixture, { releaseClass: "production" });
    let report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });
    assert.equal(report.passed, true);

    packet.artifactQaEvidence[0] = acceptedRiskEvidence(fixture.repositoryCommit, "apkg-import");
    report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });
    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("artifactQaEvidence apkg-import has invalid status")), true);
});

test("preview fails closed on missing label, risk record, limitations, or commit-bound evidence", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.releasePolicy.label = "Preview";
    packet.releasePolicy.humanQa.acceptedRiskRecord = "";
    packet.releasePolicy.humanQa.limitations = [];
    packet.automatedEvidence[0].repositoryCommit = "b".repeat(40);
    packet.artifactQaEvidence[0].acceptedRiskRecord = "";
    packet.artifactQaEvidence[0].limitation = "mobile-qa-not-performed";

    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });
    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("releasePolicy.label must be exactly")), true);
    assert.equal(report.failures.some((failure) => failure.includes("humanQa.acceptedRiskRecord")), true);
    assert.equal(report.failures.some((failure) => failure.includes("limitations must include")), true);
    assert.equal(report.failures.some((failure) => failure.includes("must bind evidence to scope.repositoryCommit")), true);
    assert.equal(report.failures.some((failure) => failure.includes("accepted-risk must cite PROD-REL-001")), true);
    assert.equal(report.failures.some((failure) => failure.includes("must use its exact governed limitation")), true);
});

test("release asset directory verification uses asset basenames and rejects undeclared files", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    const artifactDirectory = path.join(fixture.repositoryRoot, "release-assets");
    fs.mkdirSync(artifactDirectory);
    const packetPath = path.join(artifactDirectory, "release-qa-evidence.json");
    fs.writeFileSync(packetPath, JSON.stringify(packet), "utf-8");
    for (const artifact of packet.scope.artifacts) {
        fs.copyFileSync(
            path.join(fixture.repositoryRoot, ...artifact.path.split("/")),
            path.join(artifactDirectory, artifact.releaseAssetName)
        );
    }

    let report = buildReleaseQaEvidenceReport({
        packet,
        packetPath,
        repositoryRoot: fixture.repositoryRoot,
        artifactDirectory,
        expectedReleaseTag: packet.scope.releaseTag,
    });
    assert.equal(report.passed, true);
    assert.equal(report.artifacts.every((artifact) => artifact.verificationSource === "release-assets"), true);

    fs.writeFileSync(path.join(artifactDirectory, "undeclared.txt"), "unexpected", "utf-8");
    report = buildReleaseQaEvidenceReport({
        packet,
        packetPath,
        repositoryRoot: fixture.repositoryRoot,
        artifactDirectory,
        expectedReleaseTag: "v1.0.0-beta.2",
    });
    assert.equal(report.failures.includes("release asset directory contains undeclared asset: undeclared.txt."), true);
    assert.equal(report.failures.some((failure) => failure.includes("does not match expected release tag")), true);

    report = buildReleaseQaEvidenceReport({
        packet,
        packetPath: path.join(fixture.repositoryRoot, "different-packet.json"),
        repositoryRoot: fixture.repositoryRoot,
        artifactDirectory,
    });
    assert.equal(
        report.failures.includes("release packet path must be a direct member of the release asset directory."),
        true
    );
});

test("release QA template remains fail-closed", () => {
    const report = buildReleaseQaEvidenceReport({
        packet: readJson("templates/release_qa_evidence_packet.template.json"),
    });
    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("scope.repositoryCommit")), true);
    assert.equal(report.failures.some((failure) => failure.includes("notes must be a positive safe integer")), true);
    assert.equal(report.failures.some((failure) => failure.includes("automatedEvidence release-trust-pre has invalid status")), true);
    assert.equal(report.failures.some((failure) => failure.includes("artifactQaEvidence managed-media-provenance has invalid status")), true);
    assert.equal(report.failures.some((failure) => failure.includes("sourceGovernance.status must be passed")), true);
    assert.equal(report.failures.some((failure) => failure.includes("knownBlockers must be empty")), true);
});

test("release QA evidence supports different level scopes per deck kind", (t) => {
    const fixture = createCandidateFixture(t, {
        levelsByDeckKind: { kanji: [5, 4, 3, 2], word: [5, 4] },
    });
    const report = buildReleaseQaEvidenceReport({
        packet: passingPacket(fixture),
        repositoryRoot: fixture.repositoryRoot,
    });
    assert.equal(report.passed, true);
    assert.deepEqual(report.deckScopes, [
        { deckKind: "kanji", levels: [5, 4, 3, 2] },
        { deckKind: "word", levels: [5, 4] },
    ]);
});

test("release QA evidence rejects commit drift, artifact tampering, path escape, and duplicate assets", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.scope.repositoryCommit = "b".repeat(40);
    packet.scope.artifacts[0].path = "../outside.apkg";
    packet.scope.artifacts[1].releaseAssetName = packet.scope.artifacts[0].releaseAssetName;
    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });
    assert.equal(report.passed, false);
    assert.equal(report.failures.some((failure) => failure.includes("does not match repository HEAD")), true);
    assert.equal(report.failures.some((failure) => failure.includes("portable repository-relative path")), true);
    assert.equal(report.failures.some((failure) => failure.includes("duplicate releaseAssetName")), true);
});

test("release QA evidence requires exact source-governance posture and all QA ids", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.artifactQaEvidence = packet.artifactQaEvidence.filter((entry) => entry.id !== "listening-qa");
    packet.sourceGovernance.acceptedRiskRecord = "";
    packet.sourceGovernance.commands = [];
    packet.sourceGovernance.repositoryCommit = "b".repeat(40);
    delete packet.knownBlockers;
    const report = buildReleaseQaEvidenceReport({ packet, repositoryRoot: fixture.repositoryRoot });
    assert.equal(report.failures.includes("artifactQaEvidence is missing required entry: listening-qa."), true);
    assert.equal(report.failures.some((failure) => failure.includes("GOV-SRC-001")), true);
    assert.equal(report.failures.some((failure) => failure.includes("commands must include")), true);
    assert.equal(report.failures.includes("sourceGovernance must bind evidence to scope.repositoryCommit."), true);
    assert.equal(report.failures.includes("knownBlockers must be an array and must be empty before release-ready claims."), true);
});

test("release QA evidence requires unique mandatory automated proof ids and canonical commands", (t) => {
    const fixture = createCandidateFixture(t);
    const packet = passingPacket(fixture);
    packet.automatedEvidence = packet.automatedEvidence.filter((entry) => entry.id !== "n5-readiness");
    packet.automatedEvidence.find((entry) => entry.id === "release-gate").command = "npm run lint";
    packet.automatedEvidence.push({ ...packet.automatedEvidence[0] });

    const report = buildReleaseQaEvidenceReport({
        packet,
        repositoryRoot: fixture.repositoryRoot,
    });

    assert.equal(report.passed, false);
    assert.equal(report.failures.includes("automatedEvidence must contain unique ids."), true);
    assert.equal(report.failures.includes("automatedEvidence is missing required entry: n5-readiness."), true);
    assert.equal(
        report.failures.includes("automatedEvidence release-gate command must be exactly npm run release:gate."),
        true
    );
});

test("release QA evidence loader and CLI parsing support hosted asset verification", (t) => {
    const fixture = createCandidateFixture(t);
    const packetPath = path.join(fixture.repositoryRoot, "packet.json");
    fs.writeFileSync(packetPath, JSON.stringify(passingPacket(fixture)), "utf-8");
    assert.equal(loadReleaseQaEvidencePacket(packetPath).packet.scope.releaseCandidateId, fixture.releaseCandidateId);
    assert.deepEqual(parseArgs([]), {
        json: false,
        packetPath: DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
        artifactDirectory: null,
        expectedReleaseTag: null,
        unknownArgs: [],
    });
    assert.deepEqual(
        parseArgs(["--json", "--packet=packet.json", "--artifact-dir=assets", "--expected-tag=v1.0.0-beta.1"]),
        {
            json: true,
            packetPath: "packet.json",
            artifactDirectory: "assets",
            expectedReleaseTag: "v1.0.0-beta.1",
            unknownArgs: [],
        }
    );
});

test("Git HEAD resolution follows a linked worktree commondir for loose and packed refs", (t) => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-qa-worktree-"));
    t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
    const repositoryRoot = path.join(fixtureRoot, "linked-worktree");
    const commonGitDirectory = path.join(fixtureRoot, "common.git");
    const worktreeGitDirectory = path.join(commonGitDirectory, "worktrees", "release");
    const looseCommit = "b".repeat(40);
    const packedCommit = "c".repeat(40);
    fs.mkdirSync(repositoryRoot, { recursive: true });
    fs.mkdirSync(path.join(commonGitDirectory, "refs", "heads"), { recursive: true });
    fs.mkdirSync(worktreeGitDirectory, { recursive: true });
    fs.writeFileSync(path.join(repositoryRoot, ".git"), "gitdir: ../common.git/worktrees/release\n", "utf-8");
    fs.writeFileSync(path.join(worktreeGitDirectory, "commondir"), "../..\n", "utf-8");
    fs.writeFileSync(path.join(worktreeGitDirectory, "HEAD"), "ref: refs/heads/release\n", "utf-8");
    const looseRefPath = path.join(commonGitDirectory, "refs", "heads", "release");
    fs.writeFileSync(looseRefPath, `${looseCommit}\n`, "utf-8");
    fs.writeFileSync(
        path.join(commonGitDirectory, "packed-refs"),
        `# pack-refs with: peeled fully-peeled sorted\n${packedCommit} refs/heads/release\n`,
        "utf-8"
    );
    assert.equal(readGitHead(repositoryRoot), looseCommit);
    fs.rmSync(looseRefPath);
    assert.equal(readGitHead(repositoryRoot), packedCommit);
});
