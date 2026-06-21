const fs = require("node:fs");
const path = require("node:path");

const LARGE_WORD_SOURCE_ACCESS_PACKET_BATCH_SIZE = 100;
const WORD_SOURCE_ACCESS_SURFACE_TYPES = Object.freeze([
    "exact-word-list-table",
    "exact-dictionary-entry",
    "official-correction-list-target-row",
    "exact-textbook-index-page",
    "target-entry-page",
    "permitted-machine-readable-source",
]);
const DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY = "Only generate or merge 100+ word source-review rows when the named source surface explicitly supports exact written|reading identities and JLPT/source-level assignment for those rows. Do not use marketing, grammar/can-do, example-only, copied raw-list, or vague common-vocabulary summaries as assignment proof.";

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
    reviewPolicy = DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY,
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
        reviewPolicy: normalizeText(reviewPolicy) || DEFAULT_WORD_SOURCE_ACCESS_REVIEW_POLICY,
        noDeckMutation: true,
    };
}

function validateWordSourceAccessPacket({ packet = {}, expectedSourceId = null } = {}) {
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
    if (!normalizeText(packet.checkedAt)) {
        blockers.push("word source-access packet requires checkedAt");
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

function readWordSourceAccessPacketFile(packetPath) {
    const resolvedPath = path.resolve(process.cwd(), packetPath || "");
    if (!packetPath) {
        return {
            valid: false,
            packetPath: "",
            blockers: ["word source-access packet path is required"],
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
            blockers: [`word source-access packet file is not valid JSON: ${error.message}`],
            packet: null,
        };
    }
}

function validateWordSourceAccessPacketFile({ packetPath, expectedSourceId } = {}) {
    const loaded = readWordSourceAccessPacketFile(packetPath);
    if (!loaded.valid) {
        return loaded;
    }
    const validated = validateWordSourceAccessPacket({
        packet: loaded.packet,
        expectedSourceId,
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
    LARGE_WORD_SOURCE_ACCESS_PACKET_BATCH_SIZE,
    WORD_SOURCE_ACCESS_SURFACE_TYPES,
    buildWordSourceAccessPacket,
    formatWordSourceAccessPacketJson,
    requiresWordSourceAccessPacket,
    validateWordSourceAccessPacket,
    validateWordSourceAccessPacketFile,
};
