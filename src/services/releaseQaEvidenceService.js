const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH = path.join(
    "out",
    "release-qa",
    "release-qa-evidence.json"
);

const VALID_EVIDENCE_STATUSES = new Set(["passed", "blocked", "pending", "not-applicable"]);
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
    if (sourceGovernance.status !== "passed") {
        failures.push("sourceGovernance.status must be passed before release-ready claims.");
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
    if (!Array.isArray(sourceGovernance.commands) || sourceGovernance.commands.length === 0) {
        failures.push("sourceGovernance.commands must list the exact source-governance commands used.");
    }
    return failures;
}

function buildReleaseQaEvidenceReport({ packet, packetPath = DEFAULT_RELEASE_QA_EVIDENCE_PACKET_PATH } = {}) {
    const failures = [];
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
        return {
            packetPath,
            passed: false,
            failures: ["Release QA evidence packet must be a JSON object."],
        };
    }

    if (packet.version !== 1) {
        failures.push(`version must be 1; found ${packet.version || "missing"}.`);
    }
    if (packet.authority?.sourceOfTruth !== "tracked-release-qa-evidence-packet") {
        failures.push("authority.sourceOfTruth must be tracked-release-qa-evidence-packet.");
    }
    if (!normalizeText(packet.scope?.releaseCandidateId)) {
        failures.push("scope.releaseCandidateId is required.");
    }
    if (!Array.isArray(packet.scope?.deckKinds) || packet.scope.deckKinds.length === 0) {
        failures.push("scope.deckKinds must name the shipped deck kind(s).");
    }
    if (!Array.isArray(packet.scope?.levels) || packet.scope.levels.length === 0) {
        failures.push("scope.levels must name the shipped JLPT level(s).");
    }

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
        releaseCandidateId: packet.scope?.releaseCandidateId || "",
        deckKinds: packet.scope?.deckKinds || [],
        levels: packet.scope?.levels || [],
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
        `Release candidate: ${report.releaseCandidateId || "unknown"}`,
        `Deck kinds: ${(report.deckKinds || []).join(", ") || "unknown"}`,
        `Levels: ${(report.levels || []).join(", ") || "unknown"}`,
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
    REQUIRED_MANUAL_EVIDENCE_IDS,
    buildReleaseQaEvidenceReport,
    formatReleaseQaEvidenceReport,
    loadReleaseQaEvidencePacket,
    validateEvidenceEntry,
    validateSourceGovernance,
};
