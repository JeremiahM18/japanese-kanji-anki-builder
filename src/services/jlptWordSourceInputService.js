const crypto = require("node:crypto");

const {
    buildWordIdentity,
    normalizeJlptWordLevel,
} = require("../datasets/jlptWordSourceEvidence");

const WORD_SOURCE_INPUT_REVIEW_STATUSES = Object.freeze([
    "reviewed",
    "needs_review",
    "blocked",
    "source_access_gap",
    "license_blocked",
]);

const SUPPORT_PROFILE_RULES = Object.freeze({
    "jmdict-exact-identity": Object.freeze({
        claim: "dictionary-identity",
        evidenceKind: "exact-dictionary-entry",
        requiredUse: "dictionary-verification",
    }),
    "jmdict-priority-commonness": Object.freeze({
        claim: "commonness",
        evidenceKind: "dictionary-priority",
        requiredUse: "commonness-support",
    }),
    "tubelex-exact-frequency": Object.freeze({
        claim: "commonness",
        evidenceKind: "corpus-frequency",
        requiredUse: "commonness-support",
    }),
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function supportFreshnessBlocker(sourceId, source = {}, asOfDate = new Date().toISOString().slice(0, 10)) {
    const kinds = new Set(source.supportEvidenceKinds || []);
    if (!kinds.has("exact-dictionary-entry") && !kinds.has("dictionary-priority")) {
        return null;
    }
    const checkedAt = Date.parse(`${normalizeText(source.freshness?.checkedAt)}T00:00:00.000Z`);
    const evaluatedAt = Date.parse(`${normalizeText(asOfDate)}T00:00:00.000Z`);
    const maximumAgeDays = source.freshness?.maximumAgeDays;
    if (!Number.isFinite(checkedAt)
        || !Number.isFinite(evaluatedAt)
        || !Number.isInteger(maximumAgeDays)
        || maximumAgeDays <= 0
        || checkedAt > evaluatedAt
        || Math.floor((evaluatedAt - checkedAt) / 86400000) > maximumAgeDays) {
        return `support source ${sourceId} is stale or has an invalid freshness policy as of ${asOfDate}`;
    }
    return null;
}

function splitDelimitedLine(line, delimiter) {
    const cells = [];
    let current = "";
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === "\"") {
            if (quoted && next === "\"") {
                current += "\"";
                index += 1;
            } else {
                quoted = !quoted;
            }
            continue;
        }

        if (char === delimiter && !quoted) {
            cells.push(current);
            current = "";
            continue;
        }

        current += char;
    }

    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function parseDelimitedRows(text, delimiter) {
    const lines = String(text || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);

    if (lines.length === 0) {
        return [];
    }

    const headers = splitDelimitedLine(lines[0], delimiter);
    return lines.slice(1).map((line, index) => {
        const cells = splitDelimitedLine(line, delimiter);
        const row = {};
        headers.forEach((header, cellIndex) => {
            row[header] = cells[cellIndex] ?? "";
        });
        row.__rowNumber = index + 2;
        return row;
    });
}

function parseJsonRows(text) {
    const parsed = JSON.parse(String(text || "null"));
    if (Array.isArray(parsed)) {
        return parsed.map((row, index) => ({ ...row, __rowNumber: index + 1 }));
    }
    if (Array.isArray(parsed?.rows)) {
        return parsed.rows.map((row, index) => ({ ...row, __rowNumber: index + 1 }));
    }
    if (parsed && typeof parsed === "object") {
        return Object.entries(parsed).map(([identity, value], index) => {
            const [written, reading] = String(identity).split("|");
            return {
                written,
                reading,
                ...(value && typeof value === "object" ? value : { level: value }),
                __rowNumber: index + 1,
            };
        });
    }
    return [];
}

function parseWordSourceAssignmentRows(text, format = "tsv") {
    if (format === "json") {
        return parseJsonRows(text);
    }
    if (format === "csv") {
        return parseDelimitedRows(text, ",");
    }
    return parseDelimitedRows(text, "\t");
}

function buildSourceFileIntegrity({ sourceBuffer, sourceRows } = {}) {
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    return {
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.length,
        rowCount: Array.isArray(sourceRows) ? sourceRows.length : null,
    };
}

function getRowField(row = {}, columnName) {
    if (!columnName) {
        return "";
    }
    return normalizeText(row[columnName]);
}

function hasDisallowedReviewedEvidenceSurface({ citation = "", evidenceRef = "", notes = "" } = {}) {
    const evidenceText = [citation, evidenceRef, notes].map(normalizeText).join(" ").toLowerCase();
    return /\b(marketing|can[-\s]?do|grammar|example[-\s]?only|vague\s+common|table\s+of\s+contents)\b/.test(evidenceText)
        || evidenceText.includes("目次");
}

function buildSourceMetadataBlockers({
    sourceId,
    sourceConfig = {},
    evidence = {},
    policy = {},
    asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
    const blockers = [];
    const source = evidence.sources?.[sourceId];

    if (policy.requireKnownEvidenceSource !== false && !source) {
        blockers.push(`source ${sourceId} is not declared in the JLPT word source-evidence manifest`);
        return blockers;
    }

    if (sourceConfig.sourceId && sourceConfig.sourceId !== sourceId) {
        blockers.push(`source input ${sourceId} declares mismatched sourceId ${sourceConfig.sourceId}`);
    }
    const supportMode = sourceConfig.evidenceMode === "support";
    if (supportMode) {
        const rule = SUPPORT_PROFILE_RULES[sourceConfig.supportProfile];
        if (!rule) {
            blockers.push(`support-only input ${sourceId} has no supported typed profile`);
        }
        if (source?.status !== "active") {
            blockers.push(`support source ${sourceId} is ${source?.status || "missing"}; it must be active`);
        }
        if (!["approved", "restricted"].includes(source?.licenseStatus)) {
            blockers.push(`support source ${sourceId} license is ${source?.licenseStatus || "missing"}; approve or restrict it explicitly before import`);
        }
        if (source?.canStoreSupportFacts !== true) {
            blockers.push(`source ${sourceId} does not allow stored support facts`);
        }
        if (source?.countsForConsensus === true || source?.canStoreWordAssignments === true) {
            blockers.push(`support-only source ${sourceId} must not have JLPT placement authority`);
        }
        if (rule && !(source?.allowedUse || []).includes(rule.requiredUse)) {
            blockers.push(`source ${sourceId} cannot assert ${rule.claim}; allowedUse is missing ${rule.requiredUse}`);
        }
        if (rule && !(source?.supportEvidenceKinds || []).includes(rule.evidenceKind)) {
            blockers.push(`source ${sourceId} does not allow typed support evidence ${rule.evidenceKind}`);
        }
        if (!source?.upstreamSnapshot?.version || !source?.upstreamSnapshot?.sha256) {
            blockers.push(`support source ${sourceId} is missing an integrity-pinned upstream snapshot`);
        }
        const freshnessBlocker = supportFreshnessBlocker(sourceId, source, asOfDate);
        if (freshnessBlocker) {
            blockers.push(freshnessBlocker);
        }
    }
    if (!supportMode && source?.countsForConsensus && !["approved", "restricted"].includes(source.licenseStatus)) {
        blockers.push(`voting source ${sourceId} license is ${source.licenseStatus}; approve or restrict it explicitly before import`);
    }
    if (!supportMode && source?.countsForConsensus && source.status !== "active") {
        blockers.push(`voting source ${sourceId} is ${source.status}; activate it only after source provenance and extraction review`);
    }
    if (!supportMode && source && source.canStoreWordAssignments !== true) {
        blockers.push(`source ${sourceId} does not allow stored word assignments`);
    }
    if (source?.requiresCitation !== false && sourceConfig.requireCitation === false) {
        blockers.push(`source ${sourceId} requires citation; input config cannot disable it`);
    }
    if (!supportMode && source?.countsForConsensus && sourceConfig.requireLevel === false) {
        blockers.push(`voting source ${sourceId} requires an exact JLPT level on every reviewed assignment`);
    }
    if (!supportMode && sourceConfig.requireLevel === false
        && (sourceConfig.defaultSupportClaims || []).length === 0) {
        blockers.push(`support-only input ${sourceId} requires at least one explicit support claim`);
    }
    if (sourceConfig.requireEvidenceRef === false) {
        blockers.push(`source ${sourceId} evidenceRef validation cannot be disabled`);
    }
    for (const supportClaim of supportMode ? [] : (sourceConfig.defaultSupportClaims || [])) {
        const requiredUse = supportClaim === "dictionary-identity"
            ? "dictionary-verification"
            : "commonness-support";
        if (!(source?.allowedUse || []).includes(requiredUse)) {
            blockers.push(`source ${sourceId} cannot assert ${supportClaim}; allowedUse is missing ${requiredUse}`);
        }
    }

    return blockers;
}

function parseCsvList(value) {
    return normalizeText(value).split(",").map(normalizeText).filter(Boolean);
}

function parsePositiveInteger(value) {
    const parsed = Number(normalizeText(value));
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function supportColumn(sourceConfig, name, fallback) {
    return sourceConfig[`${name}Column`] || fallback;
}

function buildSupportRecordFromRow({ row, sourceConfig = {}, source = {}, contractIdentitySet = new Set() } = {}) {
    const issues = [];
    const written = getRowField(row, sourceConfig.writtenColumn || "written");
    const reading = getRowField(row, sourceConfig.readingColumn || "reading");
    const identity = buildWordIdentity(written, reading);
    const reviewStatus = getRowField(row, sourceConfig.reviewStatusColumn || "reviewStatus")
        || sourceConfig.defaultReviewStatus
        || "needs_review";
    const citation = getRowField(row, sourceConfig.citationColumn || "citation");
    const evidenceRef = getRowField(row, sourceConfig.evidenceRefColumn || "evidenceRef");
    const levelValue = getRowField(row, sourceConfig.levelColumn || "jlpt");
    const rule = SUPPORT_PROFILE_RULES[sourceConfig.supportProfile];
    const claim = getRowField(row, supportColumn(sourceConfig, "supportClaim", "supportClaim"));
    const kind = getRowField(row, supportColumn(sourceConfig, "evidenceKind", "evidenceKind"));
    const snapshotVersion = getRowField(row, supportColumn(sourceConfig, "snapshotVersion", "snapshotVersion"));
    const normalizedSourceSha256 = getRowField(row, supportColumn(sourceConfig, "normalizedSourceSha256", "normalizedSourceSha256"));
    const frequencyRank = parsePositiveInteger(getRowField(row, supportColumn(sourceConfig, "frequencyRank", "frequencyRank")));
    const occurrenceCount = parsePositiveInteger(getRowField(row, supportColumn(sourceConfig, "occurrenceCount", "occurrenceCount")));
    const documentCount = parsePositiveInteger(getRowField(row, supportColumn(sourceConfig, "documentCount", "documentCount")));
    const channelCount = parsePositiveInteger(getRowField(row, supportColumn(sourceConfig, "channelCount", "channelCount")));
    const matchStatus = getRowField(row, supportColumn(sourceConfig, "matchStatus", "matchStatus"));
    const frequencyBand = getRowField(row, supportColumn(sourceConfig, "frequencyBand", "frequencyBand"));
    const entryIds = parseCsvList(getRowField(row, supportColumn(sourceConfig, "entryIds", "entryIds")));
    const priorityTags = parseCsvList(getRowField(row, supportColumn(sourceConfig, "priorityTags", "priorityTags")));

    if (!WORD_SOURCE_INPUT_REVIEW_STATUSES.includes(reviewStatus)) {
        issues.push(`invalid reviewStatus: ${reviewStatus || "missing"}`);
    }
    if (!identity) {
        issues.push("missing exact written|reading identity");
    } else if (!contractIdentitySet.has(identity)) {
        issues.push(`identity is outside configured operational contract scope: ${identity}`);
    }
    if (levelValue) {
        issues.push("support facts must not carry a JLPT level");
    }
    if (reviewStatus === "reviewed") {
        if (!citation) issues.push("missing citation");
        if (!evidenceRef) issues.push("missing row-specific evidenceRef");
        if (hasDisallowedReviewedEvidenceSurface({ citation, evidenceRef })) {
            issues.push("reviewed support evidence cites a forbidden surface");
        }
        if (!rule || claim !== rule.claim) {
            issues.push(`typed support claim must be ${rule?.claim || "configured"}`);
        }
        if (!rule || kind !== rule.evidenceKind) {
            issues.push(`typed support evidence kind must be ${rule?.evidenceKind || "configured"}`);
        }
        if (snapshotVersion !== normalizeText(source.upstreamSnapshot?.version)) {
            issues.push("support snapshot version does not match the evidence registry");
        }
        if (normalizedSourceSha256.toLowerCase() !== normalizeText(source.local?.sha256).toLowerCase()) {
            issues.push("normalized source sha256 does not match the evidence registry");
        }
        if (kind === "exact-dictionary-entry" && entryIds.length === 0) {
            issues.push("exact dictionary support requires an entry id");
        }
        if (kind === "dictionary-priority" && (priorityTags.length === 0 || !frequencyRank)) {
            issues.push("dictionary priority support requires positive priority tags and frequency rank");
        }
        if (kind === "corpus-frequency" && (
            matchStatus !== "exact_written"
            || !["strong", "good", "borderline"].includes(frequencyBand)
            || !frequencyRank
            || !occurrenceCount
            || !documentCount
            || !channelCount
        )) {
            issues.push("corpus frequency support requires exact_written positive non-poor evidence with positive occurrence, document and channel counts");
        }
    }

    const evidence = {
        kind,
        snapshotVersion,
        normalizedSourceSha256,
        ...(entryIds.length > 0 ? { entryIds } : {}),
        ...(priorityTags.length > 0 ? { priorityTags } : {}),
        ...(frequencyRank ? { frequencyRank } : {}),
        ...(occurrenceCount ? { occurrenceCount } : {}),
        ...(documentCount ? { documentCount } : {}),
        ...(channelCount ? { channelCount } : {}),
        ...(matchStatus ? { matchStatus } : {}),
        ...(frequencyBand ? { frequencyBand } : {}),
    };
    return {
        identity,
        record: {
            written,
            reading,
            reviewStatus,
            ...(citation ? { citation } : {}),
            ...(evidenceRef ? { evidenceRef } : {}),
            supportClaims: claim ? [claim] : [],
            evidence,
        },
        issues,
        rowNumber: row.__rowNumber,
    };
}

function buildIntegrityBlockers({ sourceConfig = {}, integrity = {}, policy = {} } = {}) {
    const blockers = [];
    const requirePins = policy.requirePinnedIntegrity !== false;

    if (requirePins && !sourceConfig.sha256) {
        blockers.push("source sha256 pin is missing");
    } else if (sourceConfig.sha256 && normalizeText(integrity.sha256).toLowerCase() !== sourceConfig.sha256.toLowerCase()) {
        blockers.push(`source sha256 mismatch: expected ${sourceConfig.sha256.toLowerCase()}, got ${integrity.sha256 || "missing"}`);
    }

    if (requirePins && !Number.isInteger(sourceConfig.byteSize)) {
        blockers.push("source byte size pin is missing");
    } else if (Number.isInteger(sourceConfig.byteSize) && integrity.byteSize !== sourceConfig.byteSize) {
        blockers.push(`source byte size mismatch: expected ${sourceConfig.byteSize}, got ${integrity.byteSize}`);
    }

    if (requirePins && !Number.isInteger(sourceConfig.rowCount)) {
        blockers.push("source row count pin is missing");
    } else if (Number.isInteger(sourceConfig.rowCount) && integrity.rowCount !== sourceConfig.rowCount) {
        blockers.push(`source row count mismatch: expected ${sourceConfig.rowCount}, got ${integrity.rowCount}`);
    }

    return blockers;
}

function buildReviewStatusCountBlockers({ sourceConfig = {}, reviewStatusCounts = {} } = {}) {
    const expectedCounts = sourceConfig.expectedReviewStatusCounts;
    if (!expectedCounts) {
        return [];
    }
    return WORD_SOURCE_INPUT_REVIEW_STATUSES
        .map((status) => {
            const expected = expectedCounts[status] || 0;
            const actual = reviewStatusCounts[status] || 0;
            return expected === actual
                ? null
                : `source reviewStatus count mismatch for ${status}: expected ${expected}, got ${actual}`;
        })
        .filter((blocker) => blocker !== null);
}

function buildAssignmentFromRow({ row, sourceConfig } = {}) {
    const issues = [];
    const written = getRowField(row, sourceConfig.writtenColumn || "written");
    const reading = getRowField(row, sourceConfig.readingColumn || "reading");
    const levelValue = getRowField(row, sourceConfig.levelColumn || "jlpt");
    const reviewStatus = getRowField(row, sourceConfig.reviewStatusColumn) || sourceConfig.defaultReviewStatus || "needs_review";
    const citation = getRowField(row, sourceConfig.citationColumn) || sourceConfig.defaultCitation;
    const evidenceRef = getRowField(row, sourceConfig.evidenceRefColumn) || sourceConfig.defaultEvidenceRef;
    const notes = getRowField(row, sourceConfig.notesColumn) || sourceConfig.defaultNotes;
    const identity = buildWordIdentity(written, reading);
    const shouldValidateEvidenceFields = reviewStatus === "reviewed";
    const shouldValidateLevel = (shouldValidateEvidenceFields && sourceConfig.requireLevel !== false)
        || levelValue.length > 0;
    const level = shouldValidateLevel ? normalizeJlptWordLevel(levelValue) : null;

    if (shouldValidateEvidenceFields && !written) {
        issues.push("missing written");
    }
    if (shouldValidateEvidenceFields && !reading) {
        issues.push("missing reading");
    }
    if (shouldValidateEvidenceFields && !identity) {
        issues.push("missing exact written|reading identity");
    }
    if (!WORD_SOURCE_INPUT_REVIEW_STATUSES.includes(reviewStatus)) {
        issues.push(`invalid reviewStatus: ${reviewStatus || "missing"}`);
    }
    if (shouldValidateLevel && !Number.isInteger(level)) {
        issues.push(`invalid JLPT level: ${levelValue || "missing"}`);
    }
    if (Number.isInteger(level)
        && Array.isArray(sourceConfig.supportedLevels)
        && !sourceConfig.supportedLevels.includes(level)) {
        issues.push(`level N${level} is outside supportedLevels: ${sourceConfig.supportedLevels.map((entry) => `N${entry}`).join(", ")}`);
    }
    if (shouldValidateEvidenceFields && sourceConfig.requireCitation !== false && !citation) {
        issues.push("missing citation");
    }
    if (shouldValidateEvidenceFields && sourceConfig.requireEvidenceRef !== false && !evidenceRef) {
        issues.push("missing evidenceRef");
    }
    if (shouldValidateEvidenceFields && hasDisallowedReviewedEvidenceSurface({ citation, evidenceRef, notes })) {
        issues.push("reviewed word evidence must cite an exact word-list, dictionary, correction, textbook/index, target-entry, or permitted machine-readable surface");
    }

    return {
        identity,
        assignment: {
            written,
            reading,
            ...(Number.isInteger(level) ? { level } : {}),
            reviewStatus,
            ...(citation ? { citation } : {}),
            ...(evidenceRef ? { evidenceRef } : {}),
            ...(notes ? { notes } : {}),
            supportClaims: sourceConfig.defaultSupportClaims || [],
        },
        issues,
        rowNumber: row.__rowNumber,
    };
}

function buildJlptWordSourceInputReport({
    sourceId,
    sourceConfig = {},
    sourceBuffer = null,
    evidence = {},
    policy = {},
    contractEntries = [],
    asOfDate = new Date().toISOString().slice(0, 10),
} = {}) {
    const blockers = buildSourceMetadataBlockers({ sourceId, sourceConfig, evidence, policy, asOfDate });
    const sourceText = sourceBuffer ? sourceBuffer.toString("utf8") : "";
    if (!sourceBuffer) {
        blockers.push(`source file is missing: ${sourceConfig.sourcePath || sourceId}`);
    }
    const sourceRows = sourceBuffer
        ? parseWordSourceAssignmentRows(sourceText, sourceConfig.format || "tsv")
        : [];
    const integrity = buildSourceFileIntegrity({ sourceBuffer: sourceBuffer || "", sourceRows });
    blockers.push(...buildIntegrityBlockers({ sourceConfig, integrity, policy }));

    const assignments = {};
    const supportRecords = {};
    const seenIdentities = new Set();
    const rejectedRows = [];
    const reviewStatusCounts = {};
    let resolvedRowCount = 0;
    const supportMode = sourceConfig.evidenceMode === "support";
    const contractLevels = new Set(sourceConfig.contractLevels || []);
    const contractIdentitySet = new Set(contractEntries
        .filter((entry) => contractLevels.has(entry.jlpt))
        .map((entry) => entry.key || buildWordIdentity(entry.written, entry.reading)));

    if (supportMode && contractIdentitySet.size === 0) {
        blockers.push(`support input ${sourceId} resolved no operational-contract identities`);
    }

    for (const row of sourceRows) {
        const resolved = supportMode
            ? buildSupportRecordFromRow({ row, sourceConfig, source: evidence.sources?.[sourceId], contractIdentitySet })
            : buildAssignmentFromRow({ row, sourceConfig });
        const resolvedValue = supportMode ? resolved.record : resolved.assignment;
        const reviewStatus = resolvedValue.reviewStatus || "needs_review";
        reviewStatusCounts[reviewStatus] = (reviewStatusCounts[reviewStatus] || 0) + 1;

        if (resolved.identity) {
            resolvedRowCount += 1;
            if (seenIdentities.has(resolved.identity) && reviewStatus === "reviewed") {
                resolved.issues.push(`duplicate identity in source input: ${resolved.identity}`);
            }
            seenIdentities.add(resolved.identity);
        }

        if (resolved.issues.length > 0) {
            rejectedRows.push({
                rowNumber: resolved.rowNumber,
                identity: resolved.identity,
                written: resolvedValue.written,
                reading: resolvedValue.reading,
                issues: resolved.issues,
            });
            continue;
        }
        if (reviewStatus === "reviewed") {
            if (supportMode) {
                supportRecords[resolved.identity] = resolved.record;
            } else {
                assignments[resolved.identity] = resolved.assignment;
            }
        }
    }

    blockers.push(...buildReviewStatusCountBlockers({ sourceConfig, reviewStatusCounts }));
    if (rejectedRows.length > 0) {
        blockers.push(`${rejectedRows.length} source row(s) failed word source-input validation`);
    }

    return {
        valid: blockers.length === 0,
        noDeckMutation: policy.noDeckMutation !== false,
        sourceId,
        sourcePath: sourceConfig.sourcePath,
        sourceLabel: sourceConfig.sourceLabel,
        sourceUrl: sourceConfig.sourceUrl,
        format: sourceConfig.format || "tsv",
        evidenceMode: sourceConfig.evidenceMode || "placement",
        supportProfile: sourceConfig.supportProfile || null,
        importMode: sourceConfig.importMode || "overlay",
        contractLevels: sourceConfig.contractLevels || [],
        blockers,
        integrity,
        rowCount: sourceRows.length,
        resolvedRowCount,
        reviewStatusCounts,
        reviewedAssignmentCount: Object.keys(assignments).length,
        reviewedSupportFactCount: Object.keys(supportRecords).length,
        pendingRowCount: reviewStatusCounts.needs_review || 0,
        blockedRowCount: reviewStatusCounts.blocked || 0,
        sourceAccessGapRowCount: reviewStatusCounts.source_access_gap || 0,
        licenseBlockedRowCount: reviewStatusCounts.license_blocked || 0,
        rejectedRowCount: rejectedRows.length,
        rejectedRows,
        assignments,
        supportRecords,
    };
}

module.exports = {
    WORD_SOURCE_INPUT_REVIEW_STATUSES,
    buildAssignmentFromRow,
    buildSupportRecordFromRow,
    buildJlptWordSourceInputReport,
    buildSourceFileIntegrity,
    hasDisallowedReviewedEvidenceSurface,
    parseWordSourceAssignmentRows,
};
