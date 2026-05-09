const fs = require("node:fs");
const path = require("node:path");

const LARGE_SOURCE_ACCESS_PACKET_BATCH_SIZE = 100;
const SOURCE_ACCESS_SURFACE_TYPES = Object.freeze([
    "exact-kanji-table",
    "official-correction-list-target-row",
    "exact-assignment-page",
    "target-entry-page",
]);
const DEFAULT_SOURCE_ACCESS_REVIEW_POLICY = "Only generate or merge 100+ source-review rows when the named source surface explicitly supports exact source-level kanji assignment for those rows. Do not use appearance-only, vocabulary-only, adjacent schedule, review table, or grammar surface evidence as assignment proof.";

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

function requiresSourceAccessPacket(rowCountOrLimit) {
    const numeric = normalizeInteger(rowCountOrLimit);
    if (!Number.isInteger(numeric)) {
        return true;
    }
    return numeric >= LARGE_SOURCE_ACCESS_PACKET_BATCH_SIZE;
}

function buildSourceAccessPacket({
    sourceId,
    checkedAt,
    sourceSurface = {},
    reviewPolicy = DEFAULT_SOURCE_ACCESS_REVIEW_POLICY,
} = {}) {
    return {
        version: 1,
        sourceId: normalizeText(sourceId),
        checkedAt: normalizeText(checkedAt),
        sourceSurface: {
            type: normalizeText(sourceSurface.type),
            title: normalizeText(sourceSurface.title),
            citation: normalizeText(sourceSurface.citation),
            evidenceRef: normalizeText(sourceSurface.evidenceRef),
            notes: normalizeText(sourceSurface.notes),
        },
        reviewPolicy: normalizeText(reviewPolicy) || DEFAULT_SOURCE_ACCESS_REVIEW_POLICY,
        noDeckMutation: true,
    };
}

function validateSourceAccessPacket({ packet = {}, expectedSourceId = null } = {}) {
    const blockers = [];
    const sourceSurface = packet.sourceSurface || {};
    const expected = normalizeText(expectedSourceId);

    if (packet.version !== 1) {
        blockers.push("source-access packet version must be 1");
    }
    if (!normalizeText(packet.sourceId)) {
        blockers.push("source-access packet requires sourceId");
    }
    if (expected && normalizeText(packet.sourceId) !== expected) {
        blockers.push(`source-access packet sourceId ${normalizeText(packet.sourceId) || "missing"} does not match ${expected}`);
    }
    if (!normalizeText(packet.checkedAt)) {
        blockers.push("source-access packet requires checkedAt");
    }
    if (!SOURCE_ACCESS_SURFACE_TYPES.includes(normalizeText(sourceSurface.type))) {
        blockers.push(`source-access packet requires sourceSurface.type in: ${SOURCE_ACCESS_SURFACE_TYPES.join(", ")}`);
    }
    if (!normalizeText(sourceSurface.title)) {
        blockers.push("source-access packet requires sourceSurface.title");
    }
    if (!normalizeText(sourceSurface.citation)) {
        blockers.push("source-access packet requires sourceSurface.citation");
    }
    if (!normalizeText(sourceSurface.evidenceRef)) {
        blockers.push("source-access packet requires sourceSurface.evidenceRef");
    }
    if (!normalizeText(packet.reviewPolicy)) {
        blockers.push("source-access packet requires reviewPolicy");
    }
    if (packet.noDeckMutation !== true) {
        blockers.push("source-access packet must declare noDeckMutation: true");
    }

    return {
        valid: blockers.length === 0,
        blockers,
        packet,
    };
}

function readSourceAccessPacketFile(packetPath) {
    const resolvedPath = path.resolve(process.cwd(), packetPath || "");
    if (!packetPath) {
        return {
            valid: false,
            packetPath: "",
            blockers: ["source-access packet path is required"],
            packet: null,
        };
    }
    if (!fs.existsSync(resolvedPath)) {
        return {
            valid: false,
            packetPath: resolvedPath,
            blockers: [`source-access packet file is missing: ${resolvedPath}`],
            packet: null,
        };
    }

    try {
        return {
            valid: true,
            packetPath: resolvedPath,
            blockers: [],
            packet: JSON.parse(fs.readFileSync(resolvedPath, "utf8")),
        };
    } catch (error) {
        return {
            valid: false,
            packetPath: resolvedPath,
            blockers: [`source-access packet file is not valid JSON: ${error.message}`],
            packet: null,
        };
    }
}

function validateSourceAccessPacketFile({ packetPath, expectedSourceId } = {}) {
    const loaded = readSourceAccessPacketFile(packetPath);
    if (!loaded.valid) {
        return loaded;
    }
    const validated = validateSourceAccessPacket({
        packet: loaded.packet,
        expectedSourceId,
    });
    return {
        ...validated,
        packetPath: loaded.packetPath,
    };
}

function formatSourceAccessPacketJson(packet = {}) {
    return `${JSON.stringify(packet, null, 2)}\n`;
}

function summarizeSourceAccessPacket(packet = {}) {
    const sourceSurface = packet.sourceSurface || {};
    return [
        normalizeText(packet.sourceId) || "unknown",
        normalizeText(sourceSurface.type) || "unknown",
        normalizeText(sourceSurface.title) || "untitled",
        normalizeText(sourceSurface.evidenceRef) || "no evidenceRef",
    ].join("; ");
}

module.exports = {
    DEFAULT_SOURCE_ACCESS_REVIEW_POLICY,
    LARGE_SOURCE_ACCESS_PACKET_BATCH_SIZE,
    SOURCE_ACCESS_SURFACE_TYPES,
    buildSourceAccessPacket,
    formatSourceAccessPacketJson,
    requiresSourceAccessPacket,
    summarizeSourceAccessPacket,
    validateSourceAccessPacket,
    validateSourceAccessPacketFile,
};
