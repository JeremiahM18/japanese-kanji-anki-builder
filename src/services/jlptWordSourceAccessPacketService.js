const fs = require("node:fs");
const path = require("node:path");
const {
    openVerifiedRegularFileSync,
    resolveGovernedDirectChildPath,
} = require("../utils/fs");

const LARGE_WORD_SOURCE_ACCESS_PACKET_BATCH_SIZE = 100;
const WORD_SOURCE_ACCESS_SURFACE_TYPES = Object.freeze([
    "exact-word-list-table",
    "exact-dictionary-entry",
    "official-correction-list-target-row",
    "exact-textbook-index-page",
    "target-entry-page",
    "permitted-machine-readable-source",
]);
const WORD_SOURCE_ACCESS_EVIDENCE_ROLES = Object.freeze(["jlpt-placement", "support-only"]);
const WORD_SOURCE_ACCESS_SUPPORT_CLAIMS = Object.freeze(["dictionary-identity", "commonness"]);
const DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY = "Only generate or merge 100+ word source-review rows when the named source surface explicitly supports exact written|reading identities and JLPT/source-level assignment for those rows. Do not use marketing, grammar/can-do, example-only, copied raw-list, or vague common-vocabulary summaries as assignment proof.";
const DEFAULT_WORD_SUPPORT_ACCESS_REVIEW_POLICY = "Only generate or merge support facts from a permitted, attributable, integrity-pinned surface that binds a typed positive fact to the exact written|reading identity. Support-only evidence never proves or changes JLPT placement.";

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeInteger(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const numeric = Number(value);
    return Number.isInteger(numeric) ? numeric : null;
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

function isValidIsoDate(value) {
    const normalized = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
        return false;
    }
    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === normalized;
}

function requiresWordSourceAccessPacket(rowCountOrLimit) {
    const numeric = normalizeInteger(rowCountOrLimit);
    if (!Number.isInteger(numeric)) {
        return true;
    }
    return numeric >= LARGE_WORD_SOURCE_ACCESS_PACKET_BATCH_SIZE;
}

function buildWordSourceAccessPacket({
    sourceId,
    checkedAt,
    sourceSurface = {},
    evidenceRole = "jlpt-placement",
    allowedSupportClaims = [],
    reviewPolicy,
} = {}) {
    const normalizedEvidenceRole = normalizeText(evidenceRole) || "jlpt-placement";
    const defaultPolicy = normalizedEvidenceRole === "support-only"
        ? DEFAULT_WORD_SUPPORT_ACCESS_REVIEW_POLICY
        : DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY;
    return {
        version: 1,
        sourceId: normalizeText(sourceId),
        checkedAt: normalizeText(checkedAt),
        evidenceRole: normalizedEvidenceRole,
        allowedSupportClaims: [...new Set((allowedSupportClaims || []).map(normalizeText).filter(Boolean))].sort(),
        sourceSurface: {
            type: normalizeText(sourceSurface.type),
            title: normalizeText(sourceSurface.title),
            citation: normalizeText(sourceSurface.citation),
            evidenceRef: normalizeText(sourceSurface.evidenceRef),
            notes: normalizeText(sourceSurface.notes),
        },
        reviewPolicy: normalizeText(reviewPolicy) || defaultPolicy,
        noDeckMutation: true,
    };
}

function validateWordSourceAccessPacket({
    packet = {},
    expectedSourceId = null,
    expectedEvidenceRole = null,
    expectedSupportClaims = null,
    asOfDate = todayIsoDate(),
} = {}) {
    const blockers = [];
    const sourceSurface = packet.sourceSurface || {};
    const expected = normalizeText(expectedSourceId);

    if (packet.version !== 1) {
        blockers.push("word source-access packet version must be 1");
    }
    if (!normalizeText(packet.sourceId)) {
        blockers.push("word source-access packet requires sourceId");
    }
    if (expected && normalizeText(packet.sourceId) !== expected) {
        blockers.push(`word source-access packet sourceId ${normalizeText(packet.sourceId) || "missing"} does not match ${expected}`);
    }
    const evaluationDate = normalizeText(asOfDate);
    if (!isValidIsoDate(evaluationDate)) {
        blockers.push("word source-access packet evaluation date must be a valid YYYY-MM-DD calendar date");
    }
    const checkedAt = normalizeText(packet.checkedAt);
    if (!isValidIsoDate(checkedAt)) {
        blockers.push("word source-access packet requires checkedAt as a valid YYYY-MM-DD calendar date");
    } else if (isValidIsoDate(evaluationDate) && checkedAt > evaluationDate) {
        blockers.push(`word source-access packet checkedAt ${checkedAt} is in the future relative to ${evaluationDate}`);
    }
    const evidenceRole = normalizeText(packet.evidenceRole) || "jlpt-placement";
    if (!WORD_SOURCE_ACCESS_EVIDENCE_ROLES.includes(evidenceRole)) {
        blockers.push(`word source-access packet requires evidenceRole in: ${WORD_SOURCE_ACCESS_EVIDENCE_ROLES.join(", ")}`);
    }
    if (normalizeText(expectedEvidenceRole) && evidenceRole !== normalizeText(expectedEvidenceRole)) {
        blockers.push(`word source-access packet evidenceRole ${evidenceRole || "missing"} does not match ${normalizeText(expectedEvidenceRole)}`);
    }
    const supportClaims = Array.isArray(packet.allowedSupportClaims) ? packet.allowedSupportClaims : [];
    const invalidSupportClaims = supportClaims.filter((claim) => !WORD_SOURCE_ACCESS_SUPPORT_CLAIMS.includes(claim));
    if (invalidSupportClaims.length > 0) {
        blockers.push(`word source-access packet has invalid allowedSupportClaims: ${invalidSupportClaims.join(", ")}`);
    }
    if (evidenceRole === "support-only" && supportClaims.length === 0) {
        blockers.push("support-only word source-access packet requires allowedSupportClaims");
    }
    if (evidenceRole === "jlpt-placement" && supportClaims.length > 0) {
        blockers.push("JLPT-placement word source-access packet must not declare allowedSupportClaims");
    }
    if (Array.isArray(expectedSupportClaims)) {
        const expectedClaims = [...new Set(expectedSupportClaims)].sort();
        const actualClaims = [...new Set(supportClaims)].sort();
        if (JSON.stringify(actualClaims) !== JSON.stringify(expectedClaims)) {
            blockers.push(`word source-access packet allowedSupportClaims ${actualClaims.join(", ") || "none"} do not match ${expectedClaims.join(", ") || "none"}`);
        }
    }
    if (!WORD_SOURCE_ACCESS_SURFACE_TYPES.includes(normalizeText(sourceSurface.type))) {
        blockers.push(`word source-access packet requires sourceSurface.type in: ${WORD_SOURCE_ACCESS_SURFACE_TYPES.join(", ")}`);
    }
    if (!normalizeText(sourceSurface.title)) {
        blockers.push("word source-access packet requires sourceSurface.title");
    }
    if (!normalizeText(sourceSurface.citation)) {
        blockers.push("word source-access packet requires sourceSurface.citation");
    }
    if (!normalizeText(sourceSurface.evidenceRef)) {
        blockers.push("word source-access packet requires sourceSurface.evidenceRef");
    }
    if (!normalizeText(packet.reviewPolicy)) {
        blockers.push("word source-access packet requires reviewPolicy");
    }
    if (packet.noDeckMutation !== true) {
        blockers.push("word source-access packet must declare noDeckMutation: true");
    }

    return {
        valid: blockers.length === 0,
        blockers,
        packet,
    };
}

function resolveGovernedWordSourceAccessPacketPath({
    cwd = process.cwd(),
    packetPath,
    sourceId,
} = {}) {
    const normalizedSourceId = normalizeText(sourceId);
    const expectedBaseName = `${normalizedSourceId || "unknown-source"}-word-source-access-packet.json`;
    return resolveGovernedDirectChildPath({
        baseDirectory: cwd,
        governedDirectory: path.join(cwd, "downloads", "word-source-access-packets"),
        declaredPath: packetPath,
        extension: ".json",
        expectedBaseName,
        label: "Word source-access packet path",
        rejectWindowsReservedName: true,
    });
}

function readWordSourceAccessPacketFile({ packetPath, expectedSourceId } = {}) {
    if (!packetPath) {
        return {
            valid: false,
            packetPath: "",
            blockers: ["word source-access packet path is required"],
            packet: null,
        };
    }
    let resolvedPath;
    try {
        resolvedPath = resolveGovernedWordSourceAccessPacketPath({
            packetPath,
            sourceId: expectedSourceId,
        });
    } catch (error) {
        return {
            valid: false,
            packetPath: String(packetPath),
            blockers: [error.message],
            packet: null,
        };
    }
    if (!fs.existsSync(resolvedPath)) {
        return {
            valid: false,
            packetPath: resolvedPath,
            blockers: [`word source-access packet file is missing: ${resolvedPath}`],
            packet: null,
        };
    }

    try {
        const fileHandle = openVerifiedRegularFileSync(resolvedPath, { label: "Word source-access packet" });
        let packet;
        try {
            packet = JSON.parse(fs.readFileSync(fileHandle, "utf8"));
        } finally {
            fs.closeSync(fileHandle);
        }
        return {
            valid: true,
            packetPath: resolvedPath,
            blockers: [],
            packet,
        };
    } catch (error) {
        return {
            valid: false,
            packetPath: resolvedPath,
            blockers: [`word source-access packet file is not valid JSON: ${error.message}`],
            packet: null,
        };
    }
}

function validateWordSourceAccessPacketFile({
    packetPath,
    expectedSourceId,
    expectedEvidenceRole,
    expectedSupportClaims,
    asOfDate,
} = {}) {
    const loaded = readWordSourceAccessPacketFile({ packetPath, expectedSourceId });
    if (!loaded.valid) {
        return loaded;
    }
    const validated = validateWordSourceAccessPacket({
        packet: loaded.packet,
        expectedSourceId,
        expectedEvidenceRole,
        expectedSupportClaims,
        asOfDate,
    });
    return {
        ...validated,
        packetPath: loaded.packetPath,
    };
}

function formatWordSourceAccessPacketJson(packet = {}) {
    return `${JSON.stringify(packet, null, 2)}\n`;
}

module.exports = {
    DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY,
    DEFAULT_WORD_SUPPORT_ACCESS_REVIEW_POLICY,
    LARGE_WORD_SOURCE_ACCESS_PACKET_BATCH_SIZE,
    WORD_SOURCE_ACCESS_SURFACE_TYPES,
    WORD_SOURCE_ACCESS_EVIDENCE_ROLES,
    WORD_SOURCE_ACCESS_SUPPORT_CLAIMS,
    buildWordSourceAccessPacket,
    formatWordSourceAccessPacketJson,
    requiresWordSourceAccessPacket,
    resolveGovernedWordSourceAccessPacketPath,
    validateWordSourceAccessPacket,
    validateWordSourceAccessPacketFile,
};
