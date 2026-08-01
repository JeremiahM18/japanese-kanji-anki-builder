const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { isPathInside, openVerifiedRegularFileSync } = require("../utils/fs");
const { FULL_GIT_COMMIT_PATTERN, readGitHead } = require("../utils/gitRepository");
const { buildOutputScopeSlug, normalizeRunId } = require("./outputIsolationService");

const DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH = path.join(
    "out",
    "release-qa",
    "release-qa-evidence.json"
);

const VALID_EVIDENCE_STATUSES = new Set(["passed", "accepted-risk", "blocked", "pending", "not-applicable"]);
const VALID_RELEASE_DECK_KINDS = new Set(["kanji", "word"]);
const VALID_RELEASE_CLASSES = new Set(["production", "automation-reviewed-preview"]);
const RELEASE_QA_EVIDENCE_PACKET_VERSION = 3;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[A-Za-z-][0-9A-Za-z-]*))*)?$/u;
const ARTIFACT_HASH_BUFFER_BYTES = 1024 * 1024;
const AUTOMATION_REVIEWED_PREVIEW_LABEL = "AUTOMATION-REVIEWED PREVIEW - HUMAN DEVICE QA NOT PERFORMED";
const PRODUCT_RELEASE_RISK_RECORD = "PROD-REL-001";
const REQUIRED_SOURCE_GOVERNANCE_COMMANDS = Object.freeze([
    "npm run data:audit:jlpt:source-access",
    "npm run data:audit:jlpt:sources -- --governance-strict --limit=25",
]);
const REQUIRED_ARTIFACT_QA_EVIDENCE_IDS = Object.freeze([
    "apkg-import",
    "managed-media-provenance",
    "manual-anki-import",
    "mobile-qa",
    "screen-reader-accessibility",
    "listening-qa",
]);
const REQUIRED_AUTOMATED_EVIDENCE_COMMANDS = Object.freeze({
    "release-trust-pre": "npm run security:release-trust:pre",
    "release-gate": "npm run release:gate",
    "n5-readiness": "npm run product:readiness:n5",
});
const APKG_INSPECTION_COMMAND_PATTERN = /^npm run product:release-qa:apkg-inspect -- --packet=out\/release-qa\/release-qa-evidence\.json --artifact-dir=\S+ --require-golden$/u;

const REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS = Object.freeze([
    "desktop-anki-import-not-performed",
    "mobile-qa-not-performed",
    "screen-reader-interaction-not-performed",
    "listening-naturalness-not-performed",
    "stroke-sequence-visual-review-not-performed",
]);
const ARTIFACT_QA_ACCEPTED_RISK_LIMITATIONS = Object.freeze({
    "apkg-import": "desktop-anki-import-not-performed",
    "manual-anki-import": "desktop-anki-import-not-performed",
    "mobile-qa": "mobile-qa-not-performed",
    "screen-reader-accessibility": "screen-reader-interaction-not-performed",
    "listening-qa": "listening-naturalness-not-performed",
});

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

function normalizeReleaseAssetName(value) {
    const normalized = normalizeText(value);
    if (
        typeof value !== "string"
        || value !== normalized
        || !normalized
        || normalized === "."
        || normalized === ".."
        || normalized.includes("/")
        || normalized.includes("\\")
        || normalized.includes("\0")
        || path.basename(normalized) !== normalized
    ) {
        return null;
    }
    return normalized;
}

function hashFileHandleSha256Sync(fileHandle, filePath) {
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(ARTIFACT_HASH_BUFFER_BYTES);
    let bytes = 0;
    let bytesRead;
    do {
        bytesRead = fs.readSync(fileHandle, buffer, 0, buffer.length, null);
        if (bytesRead > 0) {
            hash.update(buffer.subarray(0, bytesRead));
            bytes += bytesRead;
        }
    } while (bytesRead > 0);
    const stats = fs.fstatSync(fileHandle, { bigint: true });
    if (!stats.isFile() || stats.size !== BigInt(bytes)) {
        throw new Error(`Artifact changed or stopped being a regular file while hashing: ${filePath}`);
    }
    return {
        bytes,
        sha256: hash.digest("hex"),
    };
}

function hashFileSha256Sync(filePath) {
    const fileHandle = openVerifiedRegularFileSync(filePath, { label: "Release artifact" });
    try {
        return hashFileHandleSha256Sync(fileHandle, filePath);
    } finally {
        fs.closeSync(fileHandle);
    }
}

function inspectReleaseArtifact(entry, {
    repositoryRoot = process.cwd(),
    releaseCandidateId = "",
    scopedDeckKinds = new Set(),
    artifactDirectory = null,
} = {}) {
    const failures = [];
    const rawDeckKind = entry?.deckKind;
    const deckKind = normalizeText(entry?.deckKind);
    const levels = Array.isArray(entry?.levels) ? entry.levels : [];
    const canonicalLevels = [...levels].sort((left, right) => right - left);
    const levelsAreCanonical = (
        levels.length > 0
        && levels.every((level) => (
            typeof level === "number"
            && Number.isInteger(level)
            && level >= 1
            && level <= 5
        ))
        && new Set(levels).size === levels.length
        && levels.every((level, index) => level === canonicalLevels[index])
    );
    const portablePath = normalizePortableArtifactPath(entry?.path);
    const releaseAssetName = normalizeReleaseAssetName(entry?.releaseAssetName);
    const declaredBytes = entry?.bytes;
    const declaredSha256 = normalizeText(entry?.sha256);
    const label = deckKind || normalizeText(entry?.path) || "(missing artifact identity)";
    const result = {
        deckKind,
        levels: [...levels],
        path: portablePath || normalizeText(entry?.path),
        releaseAssetName: releaseAssetName || normalizeText(entry?.releaseAssetName),
        declaredBytes,
        actualBytes: null,
        declaredSha256,
        actualSha256: "",
        verifiedPath: "",
        verificationSource: artifactDirectory ? "release-assets" : "local-run-output",
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
    if (!levelsAreCanonical) {
        failures.push(
            `release artifact ${label} levels must contain unique integer JLPT levels from 5 through 1 in descending order.`
        );
    }
    if (!portablePath) {
        failures.push(`release artifact ${label} path must be a portable repository-relative path.`);
    } else {
        const outputScopeSlug = VALID_RELEASE_DECK_KINDS.has(deckKind) && levelsAreCanonical
            ? buildOutputScopeSlug({ deckKind, levels })
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
    if (!releaseAssetName || !releaseAssetName.toLowerCase().endsWith(".apkg")) {
        failures.push(`release artifact ${label} releaseAssetName must be a portable .apkg basename.`);
    }
    for (const [field, value] of [
        ["notes", entry?.notes],
        ["cards", entry?.cards],
        ["mediaEntries", entry?.mediaEntries],
    ]) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            failures.push(`release artifact ${label} ${field} must be a positive safe integer.`);
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

    if (
        (!artifactDirectory && !portablePath)
        || (artifactDirectory && !releaseAssetName)
        || failures.some((failure) => failure.includes("path must"))
    ) {
        return { failures, result };
    }

    const resolvedRepositoryRoot = path.resolve(repositoryRoot);
    const outputRoot = artifactDirectory
        ? path.resolve(artifactDirectory)
        : path.join(resolvedRepositoryRoot, "out");
    const resolvedArtifactPath = artifactDirectory
        ? path.resolve(outputRoot, releaseAssetName)
        : path.resolve(resolvedRepositoryRoot, ...portablePath.split("/"));
    if (!isPathInside(resolvedArtifactPath, outputRoot)) {
        failures.push(`release artifact ${label} resolves outside the governed ${artifactDirectory ? "release asset" : "out"} directory.`);
        return { failures, result };
    }

    try {
        const artifactHandle = openVerifiedRegularFileSync(
            resolvedArtifactPath,
            { label: `Release artifact ${label}` }
        );
        try {
            const realRepositoryRoot = fs.realpathSync(resolvedRepositoryRoot);
            const realOutputRoot = fs.realpathSync(outputRoot);
            const realArtifactPath = fs.realpathSync(resolvedArtifactPath);
            if (!artifactDirectory && !isPathInside(realOutputRoot, realRepositoryRoot)) {
                failures.push("repository out directory resolves outside the repository.");
                return { failures, result };
            }
            if (!isPathInside(realArtifactPath, realOutputRoot) || !pathsEqual(realArtifactPath, resolvedArtifactPath)) {
                failures.push(`release artifact ${label} resolves through an untrusted symbolic-link path.`);
                return { failures, result };
            }

            const integrity = hashFileHandleSha256Sync(artifactHandle, realArtifactPath);
            result.verifiedPath = realArtifactPath;
            result.actualBytes = integrity.bytes;
            result.actualSha256 = integrity.sha256;
            if (Number.isSafeInteger(declaredBytes) && declaredBytes > 0 && declaredBytes !== integrity.bytes) {
                failures.push(`release artifact ${label} byte size mismatch: declared ${declaredBytes}, actual ${integrity.bytes}.`);
            }
            if (SHA256_PATTERN.test(declaredSha256) && declaredSha256 !== integrity.sha256) {
                failures.push(`release artifact ${label} sha256 mismatch: declared ${declaredSha256}, actual ${integrity.sha256}.`);
            }
        } finally {
            fs.closeSync(artifactHandle);
        }
    } catch (error) {
        if (error?.code === "ENOENT") {
            failures.push(`release artifact ${label} does not exist at ${artifactDirectory ? releaseAssetName : portablePath}.`);
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
    currentPackageVersion = null,
    expectedReleaseTag = null,
    artifactDirectory = null,
} = {}) {
    const failures = [];
    const rawReleaseCandidateId = scope.releaseCandidateId;
    const releaseCandidateId = normalizeText(scope.releaseCandidateId);
    const rawRepositoryCommit = scope.repositoryCommit;
    const repositoryCommit = normalizeText(scope.repositoryCommit);
    const releaseVersion = normalizeText(scope.releaseVersion);
    const releaseTag = normalizeText(scope.releaseTag);
    const releaseClass = normalizeText(scope.releaseClass);
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

    if (!SEMVER_PATTERN.test(releaseVersion)) {
        failures.push("scope.releaseVersion must be a canonical semantic version.");
    }
    if (releaseTag !== `v${releaseVersion}`) {
        failures.push("scope.releaseTag must equal v plus scope.releaseVersion.");
    }
    const normalizedExpectedReleaseTag = normalizeText(expectedReleaseTag);
    if (normalizedExpectedReleaseTag && releaseTag !== normalizedExpectedReleaseTag) {
        failures.push(`scope.releaseTag ${releaseTag || "(missing)"} does not match expected release tag ${normalizedExpectedReleaseTag}.`);
    }
    let resolvedPackageVersion = normalizeText(currentPackageVersion);
    if (!resolvedPackageVersion) {
        const packageJsonPath = path.join(path.resolve(repositoryRoot), "package.json");
        if (fs.existsSync(packageJsonPath)) {
            try {
                resolvedPackageVersion = normalizeText(JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")).version);
            } catch (error) {
                failures.push(`Unable to resolve package.json version: ${error.message}`);
            }
        }
    }
    if (resolvedPackageVersion && releaseVersion !== resolvedPackageVersion) {
        failures.push(`scope.releaseVersion ${releaseVersion || "(missing)"} does not match package.json version ${resolvedPackageVersion}.`);
    }
    if (!VALID_RELEASE_CLASSES.has(releaseClass)) {
        failures.push("scope.releaseClass must be production or automation-reviewed-preview.");
    }
    if (releaseClass === "automation-reviewed-preview" && !releaseVersion.includes("-")) {
        failures.push("automation-reviewed-preview releases must use a semantic prerelease version.");
    }
    if (releaseClass === "production" && releaseVersion.includes("-")) {
        failures.push("production releases must not use a semantic prerelease version.");
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

    const artifacts = Array.isArray(scope.artifacts) ? scope.artifacts : [];
    if (artifacts.length === 0) {
        failures.push("scope.artifacts must bind every shipped deck kind to an exact APKG path, byte size, and SHA-256.");
    }
    const artifactResults = [];
    const artifactPathCounts = new Map();
    const artifactDeckKindCounts = new Map();
    const artifactReleaseAssetNameCounts = new Map();
    for (const entry of artifacts) {
        const inspected = inspectReleaseArtifact(entry, {
            repositoryRoot,
            releaseCandidateId: normalizedReleaseCandidateId || releaseCandidateId,
            scopedDeckKinds,
            artifactDirectory,
        });
        failures.push(...inspected.failures);
        artifactResults.push(inspected.result);
        const artifactPath = inspected.result.path;
        const artifactDeckKind = inspected.result.deckKind;
        const artifactReleaseAssetName = inspected.result.releaseAssetName;
        if (artifactPath) {
            artifactPathCounts.set(artifactPath, (artifactPathCounts.get(artifactPath) || 0) + 1);
        }
        if (artifactDeckKind) {
            artifactDeckKindCounts.set(artifactDeckKind, (artifactDeckKindCounts.get(artifactDeckKind) || 0) + 1);
        }
        if (artifactReleaseAssetName) {
            const portableAssetKey = artifactReleaseAssetName.toLowerCase();
            artifactReleaseAssetNameCounts.set(
                portableAssetKey,
                (artifactReleaseAssetNameCounts.get(portableAssetKey) || 0) + 1
            );
        }
    }
    for (const [artifactPath, count] of artifactPathCounts) {
        if (count > 1) {
            failures.push(`scope.artifacts contains duplicate path: ${artifactPath}.`);
        }
    }
    for (const [assetName, count] of artifactReleaseAssetNameCounts) {
        if (count > 1) {
            failures.push(`scope.artifacts contains duplicate releaseAssetName: ${assetName}.`);
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
        releaseVersion,
        releaseTag,
        releaseClass,
        currentPackageVersion: resolvedPackageVersion,
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

function validateEvidenceEntry(entry, {
    section,
    allowedStatuses = VALID_EVIDENCE_STATUSES,
    expectedRepositoryCommit = "",
} = {}) {
    const failures = [];
    const id = normalizeText(entry?.id);
    const status = normalizeText(entry?.status);

    if (!id) {
        failures.push(`${section} entry is missing id.`);
    }
    if (!VALID_EVIDENCE_STATUSES.has(status) || !allowedStatuses.has(status)) {
        failures.push(`${section} ${id || "(missing id)"} has invalid status: ${status || "(missing)"}.`);
    }
    if (status === "passed" || status === "accepted-risk") {
        if (!normalizeText(entry?.reviewer)) {
            failures.push(`${section} ${id} ${status} without reviewer.`);
        }
        if (!isIsoDate(entry?.reviewedAt)) {
            failures.push(`${section} ${id} ${status} without YYYY-MM-DD reviewedAt.`);
        }
        if (!normalizeText(entry?.evidence)) {
            failures.push(`${section} ${id} ${status} without evidence.`);
        }
        if (normalizeText(entry?.repositoryCommit) !== expectedRepositoryCommit) {
            failures.push(`${section} ${id} must bind evidence to scope.repositoryCommit.`);
        }
    }
    if (status === "accepted-risk") {
        if (normalizeText(entry?.acceptedRiskRecord) !== PRODUCT_RELEASE_RISK_RECORD) {
            failures.push(`${section} ${id} accepted-risk must cite ${PRODUCT_RELEASE_RISK_RECORD}.`);
        }
        if (!REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS.includes(normalizeText(entry?.limitation))) {
            failures.push(`${section} ${id} accepted-risk must name a governed automation-preview limitation.`);
        }
    }

    return failures;
}

function validateReleasePolicy(releasePolicy = {}, { releaseClass = "" } = {}) {
    const failures = [];
    const distribution = normalizeText(releasePolicy.distribution);
    const label = normalizeText(releasePolicy.label);
    const humanQa = releasePolicy.humanQa || {};

    if (releaseClass === "production") {
        if (distribution !== "github-release") {
            failures.push("releasePolicy.distribution must be github-release for production releases.");
        }
        if (normalizeText(humanQa.status) !== "passed") {
            failures.push("releasePolicy.humanQa.status must be passed for production releases.");
        }
        if (label === AUTOMATION_REVIEWED_PREVIEW_LABEL) {
            failures.push("production releases must not use the automation-reviewed preview label.");
        }
        return failures;
    }

    if (releaseClass !== "automation-reviewed-preview") {
        return failures;
    }
    if (distribution !== "github-prerelease") {
        failures.push("releasePolicy.distribution must be github-prerelease for automation-reviewed-preview releases.");
    }
    if (label !== AUTOMATION_REVIEWED_PREVIEW_LABEL) {
        failures.push(`releasePolicy.label must be exactly ${AUTOMATION_REVIEWED_PREVIEW_LABEL}.`);
    }
    if (normalizeText(humanQa.status) !== "owner-accepted-deferred") {
        failures.push("releasePolicy.humanQa.status must be owner-accepted-deferred for automation-reviewed-preview releases.");
    }
    if (normalizeText(humanQa.acceptedRiskRecord) !== PRODUCT_RELEASE_RISK_RECORD) {
        failures.push(`releasePolicy.humanQa.acceptedRiskRecord must be ${PRODUCT_RELEASE_RISK_RECORD}.`);
    }
    if (!normalizeText(humanQa.owner)) {
        failures.push("releasePolicy.humanQa.owner is required.");
    }
    if (!isIsoDate(humanQa.acceptedAt)) {
        failures.push("releasePolicy.humanQa.acceptedAt must be YYYY-MM-DD.");
    }
    if (!isIsoDate(humanQa.nextReview)) {
        failures.push("releasePolicy.humanQa.nextReview must be YYYY-MM-DD.");
    }
    if (!normalizeText(humanQa.rationale)) {
        failures.push("releasePolicy.humanQa.rationale is required.");
    }
    const limitations = Array.isArray(humanQa.limitations)
        ? humanQa.limitations.map((entry) => normalizeText(entry))
        : [];
    if (new Set(limitations).size !== limitations.length) {
        failures.push("releasePolicy.humanQa.limitations must not contain duplicates.");
    }
    for (const limitation of REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS) {
        if (!limitations.includes(limitation)) {
            failures.push(`releasePolicy.humanQa.limitations must include ${limitation}.`);
        }
    }
    for (const limitation of limitations) {
        if (!REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS.includes(limitation)) {
            failures.push(`releasePolicy.humanQa.limitations contains unsupported value: ${limitation || "(empty)"}.`);
        }
    }
    return failures;
}

function validateReleaseAssetDirectory({ artifactDirectory, packetPath, artifacts = [] } = {}) {
    const failures = [];
    if (!artifactDirectory) {
        return failures;
    }
    const resolvedDirectory = path.resolve(artifactDirectory);
    let entries;
    try {
        const realDirectory = fs.realpathSync(resolvedDirectory);
        if (!pathsEqual(realDirectory, resolvedDirectory)) {
            failures.push("release asset directory must not resolve through a symbolic link.");
            return failures;
        }
        entries = fs.readdirSync(resolvedDirectory, { withFileTypes: true });
    } catch (error) {
        failures.push(`release asset directory could not be read: ${error.message}`);
        return failures;
    }
    const resolvedPacketPath = path.resolve(packetPath);
    const packetAssetName = path.basename(resolvedPacketPath);
    const expectedPacketPath = path.join(resolvedDirectory, packetAssetName);
    if (!pathsEqual(resolvedPacketPath, expectedPacketPath)) {
        failures.push("release packet path must be a direct member of the release asset directory.");
    } else {
        try {
            const packetStats = fs.lstatSync(resolvedPacketPath);
            if (!packetStats.isFile() || packetStats.isSymbolicLink()) {
                failures.push("release packet must be a regular non-symbolic-link file in the release asset directory.");
            }
        } catch (error) {
            failures.push(`release packet could not be inspected in the release asset directory: ${error.message}`);
        }
    }
    const expectedNames = new Set([
        packetAssetName,
        ...artifacts.map((entry) => entry.releaseAssetName).filter(Boolean),
    ]);
    const actualNames = new Set(entries.map((entry) => entry.name));
    for (const entry of entries) {
        if (!entry.isFile() || entry.isSymbolicLink()) {
            failures.push(`release asset directory entry must be a regular file: ${entry.name}.`);
        }
    }
    for (const expectedName of expectedNames) {
        if (!actualNames.has(expectedName)) {
            failures.push(`release asset directory is missing expected asset: ${expectedName}.`);
        }
    }
    for (const actualName of actualNames) {
        if (!expectedNames.has(actualName)) {
            failures.push(`release asset directory contains undeclared asset: ${actualName}.`);
        }
    }
    return failures;
}

function validateSourceGovernance(sourceGovernance = {}, { expectedRepositoryCommit = "" } = {}) {
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
        if (normalizeText(sourceGovernance.repositoryCommit) !== expectedRepositoryCommit) {
            failures.push("sourceGovernance must bind evidence to scope.repositoryCommit.");
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
    currentPackageVersion = null,
    expectedReleaseTag = null,
    artifactDirectory = null,
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
        currentPackageVersion,
        expectedReleaseTag,
        artifactDirectory,
    });
    failures.push(...candidateBinding.failures);

    const automatedEvidence = Array.isArray(packet.automatedEvidence) ? packet.automatedEvidence : [];
    const artifactQaEvidence = Array.isArray(packet.artifactQaEvidence) ? packet.artifactQaEvidence : [];
    if (automatedEvidence.length === 0) {
        failures.push("automatedEvidence must list the automated release commands used.");
    }
    const automatedEvidenceById = new Map(automatedEvidence.map((entry) => [normalizeText(entry?.id), entry]));
    if (automatedEvidenceById.size !== automatedEvidence.length) {
        failures.push("automatedEvidence must contain unique ids.");
    }
    for (const [requiredId, requiredCommand] of Object.entries(REQUIRED_AUTOMATED_EVIDENCE_COMMANDS)) {
        const entry = automatedEvidenceById.get(requiredId);
        if (!entry) {
            failures.push(`automatedEvidence is missing required entry: ${requiredId}.`);
        } else if (normalizeText(entry.command) !== requiredCommand) {
            failures.push(`automatedEvidence ${requiredId} command must be exactly ${requiredCommand}.`);
        }
    }
    const apkgInspectionEvidence = automatedEvidenceById.get("apkg-structural-inspection");
    if (!apkgInspectionEvidence) {
        failures.push("automatedEvidence is missing required entry: apkg-structural-inspection.");
    } else if (!APKG_INSPECTION_COMMAND_PATTERN.test(normalizeText(apkgInspectionEvidence.command))) {
        failures.push(
            "automatedEvidence apkg-structural-inspection command must bind the canonical packet and an explicit artifact directory."
        );
    }
    for (const entry of automatedEvidence) {
        failures.push(...validateEvidenceEntry(entry, {
            section: "automatedEvidence",
            allowedStatuses: new Set(["passed"]),
            expectedRepositoryCommit: candidateBinding.repositoryCommit,
        }));
        if (!normalizeText(entry?.command)) {
            failures.push(`automatedEvidence ${normalizeText(entry?.id) || "(missing id)"} is missing command.`);
        }
    }

    const artifactQaEvidenceById = new Map(artifactQaEvidence.map((entry) => [normalizeText(entry?.id), entry]));
    if (artifactQaEvidenceById.size !== artifactQaEvidence.length) {
        failures.push("artifactQaEvidence must contain unique ids.");
    }
    for (const requiredId of REQUIRED_ARTIFACT_QA_EVIDENCE_IDS) {
        if (!artifactQaEvidenceById.has(requiredId)) {
            failures.push(`artifactQaEvidence is missing required entry: ${requiredId}.`);
        }
    }
    const artifactQaAllowedStatuses = candidateBinding.releaseClass === "automation-reviewed-preview"
        ? new Set(["passed", "accepted-risk"])
        : new Set(["passed"]);
    for (const entry of artifactQaEvidence) {
        failures.push(...validateEvidenceEntry(entry, {
            section: "artifactQaEvidence",
            allowedStatuses: artifactQaAllowedStatuses,
            expectedRepositoryCommit: candidateBinding.repositoryCommit,
        }));
        if (entry?.status === "accepted-risk") {
            const expectedLimitation = ARTIFACT_QA_ACCEPTED_RISK_LIMITATIONS[normalizeText(entry?.id)];
            if (!expectedLimitation || normalizeText(entry?.limitation) !== expectedLimitation) {
                failures.push(
                    `artifactQaEvidence ${normalizeText(entry?.id) || "(missing id)"} accepted-risk must use its exact governed limitation.`
                );
            }
        }
    }

    failures.push(...validateReleasePolicy(packet.releasePolicy, {
        releaseClass: candidateBinding.releaseClass,
    }));
    failures.push(...validateSourceGovernance(packet.sourceGovernance, {
        expectedRepositoryCommit: candidateBinding.repositoryCommit,
    }));
    failures.push(...validateReleaseAssetDirectory({
        artifactDirectory,
        packetPath,
        artifacts: candidateBinding.artifactResults,
    }));

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
        releaseVersion: candidateBinding.releaseVersion,
        releaseTag: candidateBinding.releaseTag,
        releaseClass: candidateBinding.releaseClass,
        repositoryCommit: candidateBinding.repositoryCommit,
        currentRepositoryCommit: candidateBinding.currentRepositoryCommit,
        deckKinds: packet.scope?.deckKinds || [],
        deckScopes: candidateBinding.artifactResults.map((entry) => ({
            deckKind: entry.deckKind,
            levels: entry.levels,
        })),
        artifactCount: candidateBinding.artifactResults.length,
        verifiedArtifactCount: candidateBinding.artifactResults.filter((entry) => entry.verified).length,
        artifacts: candidateBinding.artifactResults,
        requiredArtifactQaEvidenceIds: [...REQUIRED_ARTIFACT_QA_EVIDENCE_IDS],
        automatedEvidenceCount: automatedEvidence.length,
        artifactQaEvidenceCount: artifactQaEvidence.length,
        acceptedRiskEvidenceCount: artifactQaEvidence.filter((entry) => entry.status === "accepted-risk").length,
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
        `Release version: ${report.releaseVersion || "unknown"}`,
        `Release tag: ${report.releaseTag || "unknown"}`,
        `Release class: ${report.releaseClass || "unknown"}`,
        `Repository commit: ${report.repositoryCommit || "unknown"}`,
        `Repository HEAD: ${report.currentRepositoryCommit || "unknown"}`,
        `Deck kinds: ${(report.deckKinds || []).join(", ") || "unknown"}`,
        `Deck scopes: ${(report.deckScopes || [])
            .map((scope) => `${scope.deckKind || "unknown"} ${(scope.levels || []).map((level) => `N${level}`).join("/") || "unknown"}`)
            .join(", ") || "unknown"}`,
        `Verified artifacts: ${report.verifiedArtifactCount || 0}/${report.artifactCount || 0}`,
        `Automated evidence entries: ${report.automatedEvidenceCount || 0}`,
        `Artifact QA evidence entries: ${report.artifactQaEvidenceCount || 0}`,
        `Accepted-risk evidence entries: ${report.acceptedRiskEvidenceCount || 0}`,
    ];
    if (report.failures?.length > 0) {
        lines.push("Failures:", ...report.failures.map((failure) => `- ${failure}`));
    }
    return `${lines.join("\n")}\n`;
}

module.exports = {
    DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH,
    AUTOMATION_REVIEWED_PREVIEW_LABEL,
    ARTIFACT_QA_ACCEPTED_RISK_LIMITATIONS,
    PRODUCT_RELEASE_RISK_RECORD,
    REQUIRED_AUTOMATED_EVIDENCE_COMMANDS,
    RELEASE_QA_EVIDENCE_PACKET_VERSION,
    REQUIRED_ARTIFACT_QA_EVIDENCE_IDS,
    REQUIRED_AUTOMATION_PREVIEW_LIMITATIONS,
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
    validateReleaseAssetDirectory,
    validateReleasePolicy,
    validateSourceGovernance,
};
