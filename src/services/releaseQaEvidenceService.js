const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { isPathInside } = require("../utils/fs");
const { FULL_GIT_COMMIT_PATTERN, readGitHead } = require("../utils/gitRepository");
const { buildOutputScopeSlug, normalizeRunId } = require("./outputIsolationService");

const DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH = path.join(
    "out",
    "release-qa",
    "release-qa-evidence.json"
);

const VALID_EVIDENCE_STATUSES = new Set(["passed", "blocked", "pending", "not-applicable"]);
const VALID_RELEASE_DECK_KINDS = new Set(["kanji", "word"]);
const RELEASE_QA_EVIDENCE_PACKET_VERSION = 2;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ARTIFACT_HASH_BUFFER_BYTES = 1024 * 1024;
const REQUIRED_SOURCE_GOVERNANCE_COMMANDS = Object.freeze([
    "npm run data:audit:jlpt:source-access",
    "npm run data:audit:jlpt:sources -- --governance-strict --limit=25",
]);
const REQUIRED_MANUAL_EVIDENCE_IDS = Object.freeze([
    "apkg-import",
    "managed-media-provenance",
    "manual-anki-import",
    "mobile-qa",
    "screen-reader-accessibility",
    "listening-qa",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/u.test(normalizeText(value));
}

function pathsEqual(leftPath, rightPath) {
    const left = path.resolve(leftPath);
    const right = path.resolve(rightPath);
    return process.platform === "win32"
        ? left.toLowerCase() === right.toLowerCase()
        : left === right;
}

function normalizePortableArtifactPath(value) {
    const normalized = normalizeText(value);
    if (
        typeof value !== "string"
        || value !== normalized
        || !normalized
        || normalized.includes("\\")
        || normalized.includes("\0")
        || path.posix.isAbsolute(normalized)
        || /^[A-Za-z]:/u.test(normalized)
    ) {
        return null;
    }
    const segments = normalized.split("/");
    if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
        return null;
    }
    return segments.join("/");
}

function hashFileSha256Sync(filePath) {
    const fileHandle = fs.openSync(filePath, "r");
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(ARTIFACT_HASH_BUFFER_BYTES);
    let bytes = 0;
    try {
        let bytesRead;
        do {
            bytesRead = fs.readSync(fileHandle, buffer, 0, buffer.length, null);
            if (bytesRead > 0) {
                hash.update(buffer.subarray(0, bytesRead));
                bytes += bytesRead;
            }
        } while (bytesRead > 0);
        const stats = fs.fstatSync(fileHandle);
        if (!stats.isFile() || stats.size !== bytes) {
            throw new Error(`Artifact changed or stopped being a regular file while hashing: ${filePath}`);
        }
    } finally {
        fs.closeSync(fileHandle);
    }
    return {
        bytes,
        sha256: hash.digest("hex"),
    };
}

function inspectReleaseArtifact(entry, {
    repositoryRoot = process.cwd(),
    releaseCandidateId = "",
    scopedDeckKinds = new Set(),
    scopedLevels = [],
} = {}) {
    const failures = [];
    const rawDeckKind = entry?.deckKind;
    const deckKind = normalizeText(entry?.deckKind);
    const portablePath = normalizePortableArtifactPath(entry?.path);
    const declaredBytes = entry?.bytes;
    const declaredSha256 = normalizeText(entry?.sha256);
    const label = deckKind || normalizeText(entry?.path) || "(missing artifact identity)";
    const result = {
        deckKind,
        path: portablePath || normalizeText(entry?.path),
        declaredBytes,
        actualBytes: null,
        declaredSha256,
        actualSha256: "",
        verified: false,
    };

    if (!deckKind) {
        failures.push("release artifact is missing deckKind.");
    } else if (
        typeof rawDeckKind !== "string"
        || rawDeckKind !== deckKind
        || !VALID_RELEASE_DECK_KINDS.has(deckKind)
    ) {
        failures.push(`release artifact ${label} deckKind must be the canonical value kanji or word.`);
    } else if (!scopedDeckKinds.has(deckKind)) {
        failures.push(`release artifact ${label} deckKind is outside scope.deckKinds.`);
    }
    if (!portablePath) {
        failures.push(`release artifact ${label} path must be a portable repository-relative path.`);
    } else {
        const outputScopeSlug = VALID_RELEASE_DECK_KINDS.has(deckKind)
            ? buildOutputScopeSlug({ deckKind, levels: scopedLevels })
            : "";
        const expectedPrefix = outputScopeSlug
            ? `out/run-outputs/${releaseCandidateId}/${outputScopeSlug}/`
            : `out/run-outputs/${releaseCandidateId}/`;
        if (!portablePath.startsWith(expectedPrefix)) {
            failures.push(`release artifact ${label} path must be inside the exact isolated scope ${expectedPrefix}.`);
        }
        if (!portablePath.toLowerCase().endsWith(".apkg")) {
            failures.push(`release artifact ${label} path must name an .apkg file.`);
        }
    }
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes <= 0) {
        failures.push(`release artifact ${label} bytes must be a positive safe integer.`);
    }
    if (
        typeof entry?.sha256 !== "string"
        || entry.sha256 !== declaredSha256
        || !SHA256_PATTERN.test(declaredSha256)
    ) {
        failures.push(`release artifact ${label} sha256 must be 64 lowercase hexadecimal characters.`);
    }

    if (!portablePath || failures.some((failure) => failure.includes("path must"))) {
        return { failures, result };
    }

    const resolvedRepositoryRoot = path.resolve(repositoryRoot);
    const outputRoot = path.join(resolvedRepositoryRoot, "out");
    const resolvedArtifactPath = path.resolve(resolvedRepositoryRoot, ...portablePath.split("/"));
    if (!isPathInside(resolvedArtifactPath, outputRoot)) {
        failures.push(`release artifact ${label} resolves outside the governed out directory.`);
        return { failures, result };
    }

    try {
        const artifactStats = fs.lstatSync(resolvedArtifactPath);
        if (artifactStats.isSymbolicLink() || !artifactStats.isFile()) {
            failures.push(`release artifact ${label} must be a regular non-symbolic-link file.`);
            return { failures, result };
        }

        const realRepositoryRoot = fs.realpathSync(resolvedRepositoryRoot);
        const realOutputRoot = fs.realpathSync(outputRoot);
        const realArtifactPath = fs.realpathSync(resolvedArtifactPath);
        if (!isPathInside(realOutputRoot, realRepositoryRoot)) {
            failures.push("repository out directory resolves outside the repository.");
            return { failures, result };
        }
        if (!isPathInside(realArtifactPath, realOutputRoot) || !pathsEqual(realArtifactPath, resolvedArtifactPath)) {
            failures.push(`release artifact ${label} resolves through an untrusted symbolic-link path.`);
            return { failures, result };
        }

        const integrity = hashFileSha256Sync(realArtifactPath);
        result.actualBytes = integrity.bytes;
        result.actualSha256 = integrity.sha256;
        if (Number.isSafeInteger(declaredBytes) && declaredBytes > 0 && declaredBytes !== integrity.bytes) {
            failures.push(`release artifact ${label} byte size mismatch: declared ${declaredBytes}, actual ${integrity.bytes}.`);
        }
        if (SHA256_PATTERN.test(declaredSha256) && declaredSha256 !== integrity.sha256) {
            failures.push(`release artifact ${label} sha256 mismatch: declared ${declaredSha256}, actual ${integrity.sha256}.`);
        }
    } catch (error) {
        if (error?.code === "ENOENT") {
            failures.push(`release artifact ${label} does not exist at ${portablePath}.`);
        } else {
            failures.push(`release artifact ${label} could not be verified: ${error.message}`);
        }
    }

    result.verified = failures.length === 0;
    return { failures, result };
}

function validateReleaseCandidateBinding(scope = {}, {
    repositoryRoot = process.cwd(),
    currentRepositoryCommit = null,
} = {}) {
    const failures = [];
    const rawReleaseCandidateId = scope.releaseCandidateId;
    const releaseCandidateId = normalizeText(scope.releaseCandidateId);
    const rawRepositoryCommit = scope.repositoryCommit;
    const repositoryCommit = normalizeText(scope.repositoryCommit);
    let normalizedReleaseCandidateId = "";
    try {
        normalizedReleaseCandidateId = normalizeRunId(releaseCandidateId);
        if (rawReleaseCandidateId !== releaseCandidateId) {
            throw new Error("release candidate id is not canonical");
        }
    } catch {
        failures.push("scope.releaseCandidateId must be a safe run id accepted by --run-id.");
    }

    let resolvedCurrentRepositoryCommit = normalizeText(currentRepositoryCommit).toLowerCase();
    if (!resolvedCurrentRepositoryCommit) {
        try {
            resolvedCurrentRepositoryCommit = readGitHead(repositoryRoot);
        } catch (error) {
            failures.push(`Unable to resolve repository HEAD: ${error.message}`);
        }
    } else if (!FULL_GIT_COMMIT_PATTERN.test(resolvedCurrentRepositoryCommit)) {
        failures.push("currentRepositoryCommit must be a full 40-character Git SHA.");
    }
    if (
        typeof rawRepositoryCommit !== "string"
        || rawRepositoryCommit !== repositoryCommit
        || !FULL_GIT_COMMIT_PATTERN.test(repositoryCommit)
    ) {
        failures.push("scope.repositoryCommit must be a full 40-character lowercase Git SHA.");
    } else if (resolvedCurrentRepositoryCommit && repositoryCommit !== resolvedCurrentRepositoryCommit) {
        failures.push(
            `scope.repositoryCommit ${repositoryCommit} does not match repository HEAD ${resolvedCurrentRepositoryCommit}.`
        );
    }

    const rawDeckKinds = Array.isArray(scope.deckKinds) ? scope.deckKinds : [];
    const deckKinds = Array.isArray(scope.deckKinds)
        ? rawDeckKinds.map((entry) => normalizeText(entry))
        : [];
    const scopedDeckKinds = new Set(deckKinds.filter(Boolean));
    if (deckKinds.length === 0 || scopedDeckKinds.size === 0) {
        failures.push("scope.deckKinds must name the shipped deck kind(s).");
    }
    if (
        rawDeckKinds.some((entry, index) => (
            typeof entry !== "string"
            || entry !== deckKinds[index]
            || !VALID_RELEASE_DECK_KINDS.has(deckKinds[index])
        ))
        || scopedDeckKinds.size !== deckKinds.length
    ) {
        failures.push("scope.deckKinds must contain unique canonical deck kinds: kanji and/or word.");
    }

    const levels = Array.isArray(scope.levels) ? scope.levels : [];
    if (levels.length === 0) {
        failures.push("scope.levels must name the shipped JLPT level(s).");
    } else if (
        levels.some((level) => typeof level !== "number" || !Number.isInteger(level) || level < 1 || level > 5)
        || new Set(levels).size !== levels.length
    ) {
        failures.push("scope.levels must contain unique integer JLPT levels from 1 through 5.");
    }

    const artifacts = Array.isArray(scope.artifacts) ? scope.artifacts : [];
    if (artifacts.length === 0) {
        failures.push("scope.artifacts must bind every shipped deck kind to an exact APKG path, byte size, and SHA-256.");
    }
    const artifactResults = [];
    const artifactPathCounts = new Map();
    const artifactDeckKindCounts = new Map();
    for (const entry of artifacts) {
        const inspected = inspectReleaseArtifact(entry, {
            repositoryRoot,
            releaseCandidateId: normalizedReleaseCandidateId || releaseCandidateId,
            scopedDeckKinds,
            scopedLevels: levels,
        });
        failures.push(...inspected.failures);
        artifactResults.push(inspected.result);
        const artifactPath = inspected.result.path;
        const artifactDeckKind = inspected.result.deckKind;
        if (artifactPath) {
            artifactPathCounts.set(artifactPath, (artifactPathCounts.get(artifactPath) || 0) + 1);
        }
        if (artifactDeckKind) {
            artifactDeckKindCounts.set(artifactDeckKind, (artifactDeckKindCounts.get(artifactDeckKind) || 0) + 1);
        }
    }
    for (const [artifactPath, count] of artifactPathCounts) {
        if (count > 1) {
            failures.push(`scope.artifacts contains duplicate path: ${artifactPath}.`);
        }
    }
    for (const deckKind of scopedDeckKinds) {
        const count = artifactDeckKindCounts.get(deckKind) || 0;
        if (count !== 1) {
            failures.push(`scope.artifacts must contain exactly one APKG for deck kind ${deckKind}; found ${count}.`);
        }
    }

    return {
        failures,
        releaseCandidateId,
        repositoryCommit,
        currentRepositoryCommit: resolvedCurrentRepositoryCommit,
        artifactResults,
    };
}

function loadReleaseQaEvidencePacket(packetPath) {
    const resolvedPath = path.resolve(packetPath || DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH);
    let rawPacket;
    try {
        rawPacket = fs.readFileSync(resolvedPath, "utf-8");
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(
                `Release QA evidence packet not found at ${resolvedPath}. ` +
                "Copy templates/release_qa_evidence_packet.template.json to the packet path and replace every pending entry with release-specific evidence."
            );
        }
        throw error;
    }
    return {
        packetPath: resolvedPath,
        packet: JSON.parse(rawPacket),
    };
}

function validateEvidenceEntry(entry, { section, requirePassed = false } = {}) {
    const failures = [];
    const id = normalizeText(entry?.id);
    const status = normalizeText(entry?.status);

    if (!id) {
        failures.push(`${section} entry is missing id.`);
    }
    if (!VALID_EVIDENCE_STATUSES.has(status)) {
        failures.push(`${section} ${id || "(missing id)"} has invalid status: ${status || "(missing)"}.`);
    }
    if (requirePassed && status !== "passed") {
        failures.push(`${section} ${id} must be passed before release-ready claims.`);
    }
    if (status === "passed") {
        if (!normalizeText(entry?.reviewer)) {
            failures.push(`${section} ${id} passed without reviewer.`);
        }
        if (!isIsoDate(entry?.reviewedAt)) {
            failures.push(`${section} ${id} passed without YYYY-MM-DD reviewedAt.`);
        }
        if (!normalizeText(entry?.evidence)) {
            failures.push(`${section} ${id} passed without evidence.`);
        }
    }

    return failures;
}

function validateSourceGovernance(sourceGovernance = {}) {
    const failures = [];
    const status = normalizeText(sourceGovernance.status);
    const commands = Array.isArray(sourceGovernance.commands) ? sourceGovernance.commands : [];

    if (status !== "passed") {
        failures.push("sourceGovernance.status must be passed before release-ready claims.");
    }
    if (status === "passed") {
        if (!normalizeText(sourceGovernance.reviewer)) {
            failures.push("sourceGovernance passed without reviewer.");
        }
        if (!isIsoDate(sourceGovernance.reviewedAt)) {
            failures.push("sourceGovernance passed without YYYY-MM-DD reviewedAt.");
        }
        if (!normalizeText(sourceGovernance.evidence)) {
            failures.push("sourceGovernance passed without evidence.");
        }
    }
    if (sourceGovernance.nonVotingLanesRemainNonVoting !== true) {
        failures.push("sourceGovernance.nonVotingLanesRemainNonVoting must be true.");
    }
    if (sourceGovernance.sourceAccessGapsPromoted !== false) {
        failures.push("sourceGovernance.sourceAccessGapsPromoted must be false.");
    }
    if (sourceGovernance.manualCitationOnlyPromoted !== false) {
        failures.push("sourceGovernance.manualCitationOnlyPromoted must be false.");
    }
    if (sourceGovernance.sourceEvidenceDepthComplete !== true) {
        if (sourceGovernance.freePublicSourceExpansionPaused !== true) {
            failures.push("sourceGovernance.freePublicSourceExpansionPaused must be true when source evidence depth is incomplete.");
        }
        if (normalizeText(sourceGovernance.acceptedRiskRecord) !== "GOV-SRC-001") {
            failures.push("sourceGovernance.acceptedRiskRecord must be GOV-SRC-001 when source evidence depth is incomplete.");
        }
    }
    if (commands.length === 0) {
        failures.push("sourceGovernance.commands must list the exact source-governance commands used.");
    }
    for (const requiredCommand of REQUIRED_SOURCE_GOVERNANCE_COMMANDS) {
        if (!commands.includes(requiredCommand)) {
            failures.push(`sourceGovernance.commands must include ${requiredCommand}.`);
        }
    }
    return failures;
}

function buildReleaseQaEvidenceReport({
    packet,
    packetPath = DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    repositoryRoot = process.cwd(),
    currentRepositoryCommit = null,
} = {}) {
    const failures = [];
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
        return {
            packetPath,
            passed: false,
            failures: ["Release QA evidence packet must be a JSON object."],
        };
    }

    if (packet.version !== RELEASE_QA_EVIDENCE_PACKET_VERSION) {
        failures.push(
            `version must be ${RELEASE_QA_EVIDENCE_PACKET_VERSION}; found ${packet.version || "missing"}.`
        );
    }
    if (packet.authority?.sourceOfTruth !== "tracked-release-qa-evidence-packet") {
        failures.push("authority.sourceOfTruth must be tracked-release-qa-evidence-packet.");
    }
    if (!normalizeText(packet.scope?.releaseCandidateId)) {
        failures.push("scope.releaseCandidateId is required.");
    }
    const candidateBinding = validateReleaseCandidateBinding(packet.scope, {
        repositoryRoot,
        currentRepositoryCommit,
    });
    failures.push(...candidateBinding.failures);

    const automatedEvidence = Array.isArray(packet.automatedEvidence) ? packet.automatedEvidence : [];
    const manualEvidence = Array.isArray(packet.manualEvidence) ? packet.manualEvidence : [];
    if (automatedEvidence.length === 0) {
        failures.push("automatedEvidence must list the automated release commands used.");
    }
    for (const entry of automatedEvidence) {
        failures.push(...validateEvidenceEntry(entry, { section: "automatedEvidence", requirePassed: true }));
        if (!normalizeText(entry?.command)) {
            failures.push(`automatedEvidence ${normalizeText(entry?.id) || "(missing id)"} is missing command.`);
        }
    }

    const manualEvidenceById = new Map(manualEvidence.map((entry) => [normalizeText(entry?.id), entry]));
    for (const requiredId of REQUIRED_MANUAL_EVIDENCE_IDS) {
        if (!manualEvidenceById.has(requiredId)) {
            failures.push(`manualEvidence is missing required entry: ${requiredId}.`);
        }
    }
    for (const entry of manualEvidence) {
        failures.push(...validateEvidenceEntry(entry, { section: "manualEvidence", requirePassed: true }));
    }

    failures.push(...validateSourceGovernance(packet.sourceGovernance));

    if (!Array.isArray(packet.knownBlockers)) {
        failures.push("knownBlockers must be an array and must be empty before release-ready claims.");
    } else if (packet.knownBlockers.length > 0) {
        failures.push(`knownBlockers must be empty before release-ready claims; found ${packet.knownBlockers.length}.`);
    }

    return {
        packetPath,
        passed: failures.length === 0,
        packetVersion: packet.version,
        releaseCandidateId: packet.scope?.releaseCandidateId || "",
        repositoryCommit: candidateBinding.repositoryCommit,
        currentRepositoryCommit: candidateBinding.currentRepositoryCommit,
        deckKinds: packet.scope?.deckKinds || [],
        levels: packet.scope?.levels || [],
        artifactCount: candidateBinding.artifactResults.length,
        verifiedArtifactCount: candidateBinding.artifactResults.filter((entry) => entry.verified).length,
        artifacts: candidateBinding.artifactResults,
        requiredManualEvidenceIds: [...REQUIRED_MANUAL_EVIDENCE_IDS],
        automatedEvidenceCount: automatedEvidence.length,
        manualEvidenceCount: manualEvidence.length,
        failures,
    };
}

function formatReleaseQaEvidenceReport(report = {}) {
    const lines = [
        "Release QA evidence packet",
        `Status: ${report.passed ? "pass" : "fail"}`,
        `Packet: ${report.packetPath || DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH}`,
        `Packet version: ${report.packetVersion || "unknown"}`,
        `Release candidate: ${report.releaseCandidateId || "unknown"}`,
        `Repository commit: ${report.repositoryCommit || "unknown"}`,
        `Repository HEAD: ${report.currentRepositoryCommit || "unknown"}`,
        `Deck kinds: ${(report.deckKinds || []).join(", ") || "unknown"}`,
        `Levels: ${(report.levels || []).join(", ") || "unknown"}`,
        `Verified artifacts: ${report.verifiedArtifactCount || 0}/${report.artifactCount || 0}`,
        `Automated evidence entries: ${report.automatedEvidenceCount || 0}`,
        `Manual evidence entries: ${report.manualEvidenceCount || 0}`,
    ];
    if (report.failures?.length > 0) {
        lines.push("Failures:", ...report.failures.map((failure) => `- ${failure}`));
    }
    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    RELEASE_QA_EVIDENCE_PACKET_VERSION,
    REQUIRED_MANUAL_EVIDENCE_IDS,
    REQUIRED_SOURCE_GOVERNANCE_COMMANDS,
    SHA256_PATTERN,
    buildReleaseQaEvidenceReport,
    formatReleaseQaEvidenceReport,
    hashFileSha256Sync,
    inspectReleaseArtifact,
    loadReleaseQaEvidencePacket,
    normalizePortableArtifactPath,
    validateEvidenceEntry,
    validateReleaseCandidateBinding,
    validateSourceGovernance,
};
