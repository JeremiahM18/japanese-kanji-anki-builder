const {
    WORD_SOURCE_INPUT_REVIEW_STATUSES,
    hasDisallowedReviewedEvidenceSurface,
    parseWordSourceAssignmentRows,
} = require("./jlptWordSourceInputService");

function normalizeText(value) {
    return String(value ?? "").trim();
}

function parseHeaders(text = "") {
    const firstLine = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] || "";
    return firstLine.split("\t").map((header) => header.trim()).filter(Boolean);
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function formatRowsAsTsv({ headers = [], rows = [] } = {}) {
    return [
        headers.join("\t"),
        ...rows.map((row) => headers.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

function getReviewStatus(row = {}, sourceConfig = {}) {
    return normalizeText(row[sourceConfig.reviewStatusColumn]) || sourceConfig.defaultReviewStatus || "needs_review";
}

function buildIdentityFromRow(row = {}, sourceConfig = {}) {
    const written = normalizeText(row[sourceConfig.writtenColumn || "written"]);
    const reading = normalizeText(row[sourceConfig.readingColumn || "reading"]);
    return written && reading ? `${written}|${reading}` : "";
}

function getEvidenceSurfaceFields(row = {}, sourceConfig = {}) {
    return {
        citation: normalizeText(row[sourceConfig.citationColumn]),
        evidenceRef: normalizeText(row[sourceConfig.evidenceRefColumn]),
        notes: normalizeText(row[sourceConfig.notesColumn]),
    };
}

function getAllowedBatchHeaders({ sourceConfig = {}, sourceHeaders = [] } = {}) {
    return new Set([
        ...sourceHeaders,
        sourceConfig.writtenColumn || "written",
        sourceConfig.readingColumn || "reading",
        sourceConfig.levelColumn || "jlpt",
        sourceConfig.meaningColumn || "meaning",
        sourceConfig.reviewStatusColumn || "reviewStatus",
        sourceConfig.citationColumn || "citation",
        sourceConfig.evidenceRefColumn || "evidenceRef",
        sourceConfig.notesColumn || "notes",
    ].filter(Boolean));
}

function mergeHeaders({ sourceHeaders = [], batchHeaders = [] } = {}) {
    const headers = [...sourceHeaders];
    const seen = new Set(headers);
    for (const header of batchHeaders) {
        if (header === "__rowNumber" || seen.has(header)) {
            continue;
        }
        seen.add(header);
        headers.push(header);
    }
    return headers;
}

function isReviewedDowngrade({ sourceRow = {}, batchRow = {}, sourceConfig = {} } = {}) {
    const sourceStatus = getReviewStatus(sourceRow, sourceConfig);
    const batchStatus = getReviewStatus(batchRow, sourceConfig);
    return sourceStatus === "reviewed" && batchStatus !== "reviewed";
}

function isReviewedReplacement({ sourceRow = {}, batchRow = {}, sourceConfig = {}, batchHeaders = [] } = {}) {
    const sourceStatus = getReviewStatus(sourceRow, sourceConfig);
    const batchStatus = getReviewStatus(batchRow, sourceConfig);
    if (sourceStatus !== "reviewed" || batchStatus !== "reviewed") {
        return false;
    }
    const identityColumns = new Set([
        sourceConfig.writtenColumn || "written",
        sourceConfig.readingColumn || "reading",
        "__rowNumber",
    ]);
    return batchHeaders
        .filter((header) => !identityColumns.has(header))
        .some((header) => (sourceRow[header] ?? "") !== (batchRow[header] ?? ""));
}

function countBatchStatuses(rows = [], sourceConfig = {}) {
    return rows.reduce((counts, row) => {
        const reviewStatus = getReviewStatus(row, sourceConfig);
        counts[reviewStatus] = (counts[reviewStatus] || 0) + 1;
        return counts;
    }, {});
}

function buildJlptWordSourceBatchMerge({
    allowAdditions = false,
    allowReviewedDowngrades = false,
    reviewedDowngradeReason = "",
    sourceConfig = {},
    sourceText = "",
    batchText = "",
} = {}) {
    if (sourceConfig.format && sourceConfig.format !== "tsv") {
        throw new Error(`Word source batch merge only supports TSV inputs, got ${sourceConfig.format}.`);
    }

    const writtenColumn = sourceConfig.writtenColumn || "written";
    const readingColumn = sourceConfig.readingColumn || "reading";
    const sourceHeaders = parseHeaders(sourceText);
    const batchHeaders = parseHeaders(batchText);
    const sourceRows = parseWordSourceAssignmentRows(sourceText, "tsv");
    const batchRows = parseWordSourceAssignmentRows(batchText, "tsv");
    const blockers = [];
    const warnings = [];
    const validStatuses = new Set(WORD_SOURCE_INPUT_REVIEW_STATUSES);
    const allowedBatchHeaders = getAllowedBatchHeaders({ sourceConfig, sourceHeaders });
    const normalizedReviewedDowngradeReason = normalizeText(reviewedDowngradeReason);
    let reviewedDowngradeCount = 0;

    for (const requiredColumn of [writtenColumn, readingColumn]) {
        if (!sourceHeaders.includes(requiredColumn)) {
            blockers.push(`source worksheet is missing ${requiredColumn} column`);
        }
        if (!batchHeaders.includes(requiredColumn)) {
            blockers.push(`batch worksheet is missing ${requiredColumn} column`);
        }
    }
    for (const header of batchHeaders) {
        if (!allowedBatchHeaders.has(header)) {
            blockers.push(`batch worksheet has unknown column: ${header}`);
        }
    }

    const sourceIndex = new Map();
    const duplicateSourceIdentities = new Set();
    sourceRows.forEach((row) => {
        const identity = buildIdentityFromRow(row, sourceConfig);
        if (!identity) {
            blockers.push(`source row ${row.__rowNumber} is missing written|reading identity`);
            return;
        }
        if (sourceIndex.has(identity)) {
            duplicateSourceIdentities.add(identity);
            warnings.push(`source worksheet has duplicate identity row: ${identity}`);
            return;
        }
        sourceIndex.set(identity, row);
    });

    const seenBatchIdentities = new Set();
    for (const row of batchRows) {
        const identity = buildIdentityFromRow(row, sourceConfig);
        if (!identity) {
            blockers.push(`batch row ${row.__rowNumber} is missing written|reading identity`);
            continue;
        }
        if (seenBatchIdentities.has(identity)) {
            blockers.push(`batch worksheet has duplicate identity row: ${identity}`);
        }
        seenBatchIdentities.add(identity);
        if (!sourceIndex.has(identity) && !allowAdditions) {
            blockers.push(`batch identity ${identity} is not present in source worksheet`);
        }
        if (duplicateSourceIdentities.has(identity)) {
            blockers.push(`batch identity ${identity} matches duplicate source worksheet rows; resolve the source duplicate before merging reviewed evidence`);
        }
        const reviewStatus = getReviewStatus(row, sourceConfig);
        if (!validStatuses.has(reviewStatus)) {
            blockers.push(`batch row ${row.__rowNumber} has invalid reviewStatus: ${reviewStatus}`);
        }
        if (reviewStatus === "reviewed" && hasDisallowedReviewedEvidenceSurface(getEvidenceSurfaceFields(row, sourceConfig))) {
            blockers.push(`batch row ${row.__rowNumber} uses forbidden surface evidence for reviewed word assignment ${identity}`);
        }
        const sourceRow = sourceIndex.get(identity);
        if (sourceRow && isReviewedReplacement({
            sourceRow,
            batchRow: row,
            sourceConfig,
            batchHeaders,
        })) {
            blockers.push(`batch row ${row.__rowNumber} would replace reviewed word source evidence for ${identity}; first downgrade the old row with a correction reason`);
        }
        if (sourceRow && isReviewedDowngrade({ sourceRow, batchRow: row, sourceConfig })) {
            reviewedDowngradeCount += 1;
            if (!allowReviewedDowngrades) {
                blockers.push(`batch row ${row.__rowNumber} would downgrade reviewed word source evidence for ${identity}`);
            } else if (!normalizedReviewedDowngradeReason) {
                blockers.push(`batch row ${row.__rowNumber} needs --reviewed-downgrade-reason to downgrade reviewed word source evidence for ${identity}`);
            } else if (!["blocked", "source_access_gap", "license_blocked"].includes(reviewStatus)) {
                blockers.push(`batch row ${row.__rowNumber} can only downgrade reviewed word source evidence for ${identity} to blocked, source_access_gap, or license_blocked`);
            }
        }
    }

    if (blockers.length > 0) {
        return {
            valid: false,
            blockers,
            warnings,
            sourceRowCount: sourceRows.length,
            batchRowCount: batchRows.length,
            changedRowCount: 0,
            reviewedDowngradeCount,
            reviewedDowngradeReason: allowReviewedDowngrades ? normalizedReviewedDowngradeReason : "",
            statusCounts: countBatchStatuses(batchRows, sourceConfig),
            tsv: sourceText,
        };
    }

    let changedRowCount = 0;
    const batchIndex = new Map(batchRows.map((row) => [buildIdentityFromRow(row, sourceConfig), row]));
    const addedRows = [];
    const outputHeaders = mergeHeaders({ sourceHeaders, batchHeaders });
    const mergedRows = sourceRows.map((row) => {
        const batchRow = batchIndex.get(buildIdentityFromRow(row, sourceConfig));
        if (!batchRow) {
            return row;
        }
        const merged = { ...row };
        let changed = false;
        for (const header of batchHeaders) {
            if (header === "__rowNumber") {
                continue;
            }
            const nextValue = batchRow[header] ?? "";
            if ((merged[header] ?? "") !== nextValue) {
                merged[header] = nextValue;
                changed = true;
            }
        }
        if (changed) {
            changedRowCount += 1;
        }
        return merged;
    });
    for (const row of batchRows) {
        const identity = buildIdentityFromRow(row, sourceConfig);
        if (!sourceIndex.has(identity)) {
            const added = {};
            for (const header of sourceHeaders) {
                added[header] = row[header] ?? "";
            }
            addedRows.push(added);
            changedRowCount += 1;
        }
    }

    const statusCounts = countBatchStatuses(batchRows, sourceConfig);
    return {
        valid: true,
        blockers: [],
        warnings,
        sourceRowCount: sourceRows.length,
        batchRowCount: batchRows.length,
        addedRowCount: addedRows.length,
        changedRowCount,
        reviewedRowCount: statusCounts.reviewed || 0,
        pendingRowCount: statusCounts.needs_review || 0,
        blockedRowCount: statusCounts.blocked || 0,
        sourceAccessGapRowCount: statusCounts.source_access_gap || 0,
        licenseBlockedRowCount: statusCounts.license_blocked || 0,
        reviewedDowngradeCount,
        reviewedDowngradeReason: reviewedDowngradeCount > 0 ? normalizedReviewedDowngradeReason : "",
        statusCounts,
        tsv: formatRowsAsTsv({ headers: outputHeaders, rows: [...mergedRows, ...addedRows] }),
    };
}

module.exports = {
    buildIdentityFromRow,
    buildJlptWordSourceBatchMerge,
    formatRowsAsTsv,
};
