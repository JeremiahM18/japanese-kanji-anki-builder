const crypto = require("node:crypto");

const {
    buildWordIdentity,
} = require("../datasets/jlptWordSourceEvidence");
const {
    parseWordSourceAssignmentRows,
} = require("./jlptWordSourceInputService");
const {
    buildCanonicalSupportCitation,
    buildCanonicalSupportEvidenceRef,
} = require("./jlptWordSourceEvidenceService");

const SUPPORT_PROFILES = Object.freeze({
    jmdict: Object.freeze({
        claim: "dictionary-identity",
        evidenceKind: "exact-dictionary-entry",
        allowedUse: "dictionary-verification",
    }),
    "jmdict-priority-commonness": Object.freeze({
        claim: "commonness",
        evidenceKind: "dictionary-priority",
        allowedUse: "commonness-support",
    }),
    "tubelex-ja-frequency": Object.freeze({
        claim: "commonness",
        evidenceKind: "corpus-frequency",
        allowedUse: "commonness-support",
    }),
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function sha256(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function positiveInteger(value) {
    const parsed = Number(normalizeText(value));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function increment(object, key) {
    object[key] = (object[key] || 0) + 1;
}

function parseNoteValue(notes, name) {
    const match = normalizeText(notes).match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "iu"));
    return normalizeText(match?.[1]);
}

function parsePriorityTags(notes) {
    const value = parseNoteValue(notes, "jmdictPriority");
    if (!value || value.toLowerCase() === "none") {
        return [];
    }
    return value.split(",").map(normalizeText).filter(Boolean);
}

function parseIsoDate(value) {
    const normalized = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized)) {
        return null;
    }
    const timestamp = Date.parse(`${normalized}T00:00:00.000Z`);
    return Number.isFinite(timestamp)
        && new Date(timestamp).toISOString().slice(0, 10) === normalized
        ? timestamp
        : null;
}

function validateSupportSource({ sourceId, source, profile, asOfDate }) {
    if (!profile) {
        throw new Error(`Unsupported word support source profile: ${sourceId}`);
    }
    if (source?.status !== "active") {
        throw new Error(`Word support source ${sourceId} must be active.`);
    }
    if (!['approved', 'restricted'].includes(source?.licenseStatus)) {
        throw new Error(`Word support source ${sourceId} must have an approved or restricted license.`);
    }
    if (source?.canStoreSupportFacts !== true) {
        throw new Error(`Word support source ${sourceId} does not permit stored support facts.`);
    }
    if (source?.canStoreWordAssignments === true || source?.countsForConsensus === true) {
        throw new Error(`Support-only source ${sourceId} must not hold JLPT placement authority.`);
    }
    if (!Array.isArray(source?.supportEvidenceKinds)
        || !source.supportEvidenceKinds.includes(profile.evidenceKind)) {
        throw new Error(`Word support source ${sourceId} does not allow ${profile.evidenceKind} evidence.`);
    }
    if (!Array.isArray(source?.allowedUse)
        || !source.allowedUse.includes(profile.allowedUse)) {
        throw new Error(`Word support source ${sourceId} does not allow ${profile.allowedUse}.`);
    }
    if (!normalizeText(source?.upstreamSnapshot?.version)
        || !normalizeText(source?.upstreamSnapshot?.url)
        || !normalizeText(source?.upstreamSnapshot?.sha256)) {
        throw new Error(`Word support source ${sourceId} is missing its upstream snapshot.`);
    }
    if (["exact-dictionary-entry", "dictionary-priority"].includes(profile.evidenceKind)) {
        const checkedAt = parseIsoDate(source?.freshness?.checkedAt);
        const evaluatedAt = parseIsoDate(asOfDate);
        const maximumAgeDays = source?.freshness?.maximumAgeDays;
        if (!Number.isFinite(checkedAt)
            || !Number.isFinite(evaluatedAt)
            || !Number.isInteger(maximumAgeDays)
            || maximumAgeDays <= 0
            || checkedAt > evaluatedAt
            || Math.floor((evaluatedAt - checkedAt) / 86400000) > maximumAgeDays) {
            throw new Error(`Word support source ${sourceId} is stale or has an invalid freshness policy as of ${asOfDate}.`);
        }
    }
}

function validateLocalIntegrity({ sourceId, source, sourceBuffer, rows }) {
    const actual = {
        sha256: sha256(sourceBuffer),
        byteSize: sourceBuffer.length,
        rowCount: rows.length,
    };
    const expected = source?.local || {};
    if (normalizeText(expected.sha256).toLowerCase() !== actual.sha256) {
        throw new Error(`${sourceId} normalized source sha256 mismatch: expected ${expected.sha256 || "(missing)"}, got ${actual.sha256}.`);
    }
    if (expected.byteSize !== actual.byteSize) {
        throw new Error(`${sourceId} normalized source byte size mismatch: expected ${expected.byteSize}, got ${actual.byteSize}.`);
    }
    if (expected.rowCount !== actual.rowCount) {
        throw new Error(`${sourceId} normalized source row count mismatch: expected ${expected.rowCount}, got ${actual.rowCount}.`);
    }
    return actual;
}

function buildEvidence({ sourceId, source, row, integrity }) {
    const snapshotVersion = source.upstreamSnapshot.version;
    if (sourceId === "jmdict") {
        return {
            kind: "exact-dictionary-entry",
            snapshotVersion,
            normalizedSourceSha256: integrity.sha256,
            entryIds: parseNoteValue(row.notes, "entrySeq").split(",").map(normalizeText).filter(Boolean),
        };
    }
    if (sourceId === "jmdict-priority-commonness") {
        return {
            kind: "dictionary-priority",
            snapshotVersion,
            normalizedSourceSha256: integrity.sha256,
            entryIds: parseNoteValue(row.notes, "entrySeq").split(",").map(normalizeText).filter(Boolean),
            priorityTags: parsePriorityTags(row.notes),
            frequencyRank: positiveInteger(row.frequencyRank),
        };
    }
    return {
        kind: "corpus-frequency",
        snapshotVersion,
        normalizedSourceSha256: integrity.sha256,
        frequencyRank: positiveInteger(row.tubelexRank),
        occurrenceCount: positiveInteger(row.tubelexCount),
        documentCount: positiveInteger(row.tubelexVideoCount),
        channelCount: positiveInteger(row.tubelexChannelCount),
        matchStatus: normalizeText(row.tubelexMatchStatus),
        frequencyBand: normalizeText(row.tubelexFrequencyBand),
    };
}

function exclusionReason({ sourceId, row }) {
    if (sourceId === "jmdict") {
        return null;
    }
    if (sourceId === "jmdict-priority-commonness") {
        return parsePriorityTags(row.notes).length > 0 && positiveInteger(row.frequencyRank)
            ? null
            : "no_positive_priority";
    }
    const matchStatus = normalizeText(row.tubelexMatchStatus);
    if (matchStatus !== "exact_written") {
        return matchStatus || "missing_match_status";
    }
    const band = normalizeText(row.tubelexFrequencyBand);
    if (!['strong', 'good', 'borderline'].includes(band)) {
        return band === "poor" ? "poor_frequency_band" : "unsupported_frequency_band";
    }
    if (!positiveInteger(row.tubelexRank) || !positiveInteger(row.tubelexCount)) {
        return "non_positive_frequency";
    }
    if (!positiveInteger(row.tubelexVideoCount) || !positiveInteger(row.tubelexChannelCount)) {
        return "non_positive_distribution";
    }
    return null;
}

function buildJlptWordSupportSurface({
    sourceId,
    source,
    sourceText,
    contractEntries = [],
    level,
    asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
    const profile = SUPPORT_PROFILES[sourceId];
    validateSupportSource({ sourceId, source, profile, asOfDate });
    if (!Number.isInteger(level) || level < 1 || level > 5) {
        throw new Error(`Word support surface requires one exact JLPT level, got ${level}.`);
    }

    const sourceBuffer = Buffer.isBuffer(sourceText)
        ? sourceText
        : Buffer.from(String(sourceText ?? ""), "utf8");
    const rows = parseWordSourceAssignmentRows(sourceBuffer.toString("utf8"), source?.local?.format || "tsv");
    const integrity = validateLocalIntegrity({ sourceId, source, sourceBuffer, rows });
    const scopedEntries = contractEntries.filter((entry) => entry.jlpt === level);
    const contractByIdentity = new Map();
    for (const entry of scopedEntries) {
        const identity = entry.key || buildWordIdentity(entry.written, entry.reading);
        if (!identity || contractByIdentity.has(identity)) {
            throw new Error(`Duplicate or invalid N${level} contract identity: ${identity || "(blank)"}.`);
        }
        contractByIdentity.set(identity, entry);
    }

    const rowByIdentity = new Map();
    let outOfScopeSourceRowCount = 0;
    for (const row of rows) {
        const identity = buildWordIdentity(row.written, row.reading);
        if (!identity) {
            throw new Error(`${sourceId} row ${row.__rowNumber} has no exact written|reading identity.`);
        }
        if (rowByIdentity.has(identity)) {
            throw new Error(`${sourceId} contains duplicate exact identity ${identity}.`);
        }
        rowByIdentity.set(identity, row);
        if (!contractByIdentity.has(identity)) {
            outOfScopeSourceRowCount += 1;
        }
    }

    const supportRecords = {};
    const exclusionsByReason = {};
    for (const identity of [...contractByIdentity.keys()].sort((left, right) => left.localeCompare(right, "ja"))) {
        const row = rowByIdentity.get(identity);
        if (!row) {
            increment(exclusionsByReason, "missing_exact_source_identity");
            continue;
        }
        const reason = exclusionReason({ sourceId, row });
        if (reason) {
            increment(exclusionsByReason, reason);
            continue;
        }
        const evidence = buildEvidence({ sourceId, source, row, integrity });
        if (profile.evidenceKind === "exact-dictionary-entry" && evidence.entryIds.length === 0) {
            throw new Error(`${sourceId} ${identity} is missing a row-specific JMdict entrySeq.`);
        }
        const contractEntry = contractByIdentity.get(identity);
        supportRecords[identity] = {
            written: contractEntry.written,
            reading: contractEntry.reading,
            reviewStatus: "reviewed",
            citation: buildCanonicalSupportCitation(source),
            evidenceRef: buildCanonicalSupportEvidenceRef({
                source,
                identity,
                rowNumber: row.__rowNumber,
            }),
            supportClaims: [profile.claim],
            evidence,
        };
    }

    return {
        valid: true,
        noDeckMutation: true,
        sourceId,
        level,
        asOfDate,
        integrity,
        upstreamSnapshot: source.upstreamSnapshot,
        exclusionsByReason,
        summary: {
            contractIdentityCount: contractByIdentity.size,
            eligibleSupportFactCount: Object.keys(supportRecords).length,
            excludedContractIdentityCount: contractByIdentity.size - Object.keys(supportRecords).length,
            outOfScopeSourceRowCount,
        },
        supportRecords,
    };
}

const SUPPORT_WORKSHEET_HEADERS = Object.freeze([
    "written",
    "reading",
    "reviewStatus",
    "citation",
    "evidenceRef",
    "supportClaim",
    "evidenceKind",
    "snapshotVersion",
    "normalizedSourceSha256",
    "entryIds",
    "priorityTags",
    "frequencyRank",
    "occurrenceCount",
    "documentCount",
    "channelCount",
    "matchStatus",
    "frequencyBand",
]);

function escapeTsvCell(value) {
    return String(value ?? "").replace(/[\t\r\n]/gu, " ");
}

function formatJlptWordSupportWorksheet({ supportRecords = {}, reviewStatus = "needs_review" } = {}) {
    const rows = Object.entries(supportRecords)
        .sort(([left], [right]) => left.localeCompare(right, "ja"))
        .map(([, record]) => {
            const evidence = record.evidence || {};
            return {
                written: record.written,
                reading: record.reading,
                reviewStatus,
                citation: record.citation,
                evidenceRef: record.evidenceRef,
                supportClaim: (record.supportClaims || []).join(","),
                evidenceKind: evidence.kind,
                snapshotVersion: evidence.snapshotVersion,
                normalizedSourceSha256: evidence.normalizedSourceSha256,
                entryIds: (evidence.entryIds || []).join(","),
                priorityTags: (evidence.priorityTags || []).join(","),
                frequencyRank: evidence.frequencyRank || "",
                occurrenceCount: evidence.occurrenceCount || "",
                documentCount: evidence.documentCount || "",
                channelCount: evidence.channelCount || "",
                matchStatus: evidence.matchStatus || "",
                frequencyBand: evidence.frequencyBand || "",
            };
        });
    return [
        SUPPORT_WORKSHEET_HEADERS.join("\t"),
        ...rows.map((row) => SUPPORT_WORKSHEET_HEADERS.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

module.exports = {
    SUPPORT_PROFILES,
    SUPPORT_WORKSHEET_HEADERS,
    buildJlptWordSupportSurface,
    formatJlptWordSupportWorksheet,
};
