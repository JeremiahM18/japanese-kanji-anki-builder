const crypto = require("node:crypto");

const {
    normalizeJlptLevelAssignment,
    normalizeJlptLevelRangeAssignment,
} = require("../datasets/jlptKanjiSourceEvidence");

const SOURCE_INPUT_REVIEW_STATUSES = Object.freeze([
    "reviewed",
    "needs_review",
    "blocked",
    "source_access_gap",
]);

function normalizeText(value) {
    return String(value ?? "").trim();
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

    const headers = splitDelimitedLine(lines[0], delimiter).map((header) => header.trim());
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
        return Object.entries(parsed).map(([kanji, level], index) => ({
            kanji,
            level,
            __rowNumber: index + 1,
        }));
    }
    return [];
}

function parseSourceAssignmentRows(text, format = "tsv") {
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

function normalizeLegacyJlptLevel(value) {
    const text = normalizeText(value).replace(/^old[-_\s]*/i, "").replace(/^jlpt\s*/i, "");
    const oldLevel = Number(text);
    if (!Number.isInteger(oldLevel) || oldLevel < 1 || oldLevel > 4) {
        return {
            level: null,
            reason: `invalid legacy JLPT level: ${normalizeText(value) || "missing"}`,
        };
    }
    if (oldLevel === 2) {
        return {
            level: null,
            levelRange: [2, 3],
            reason: null,
        };
    }
    return {
        level: {
            1: 1,
            3: 4,
            4: 5,
        }[oldLevel],
        reason: null,
    };
}

function normalizeInputLevel(value, levelMapping = "new-jlpt-n1-n5") {
    if (levelMapping === "kanjidic2-legacy-jlpt") {
        return normalizeLegacyJlptLevel(value);
    }

    const level = normalizeJlptLevelAssignment(value);
    if (Number.isInteger(level)) {
        return { level, reason: null };
    }
    const levelRange = normalizeJlptLevelRangeAssignment(value);
    return Array.isArray(levelRange)
        ? { level: null, levelRange, reason: null }
        : { level: null, levelRange: null, reason: `invalid JLPT level: ${normalizeText(value) || "missing"}` };
}

function getRowField(row = {}, columnName) {
    if (!columnName) {
        return "";
    }
    return normalizeText(row[columnName]);
}

function buildSourceMetadataBlockers({ sourceId, sourceConfig = {}, evidence = {}, policy = {} } = {}) {
    const blockers = [];
    const source = evidence.sources?.[sourceId];

    if (policy.requireKnownEvidenceSource !== false && !source) {
        blockers.push(`source ${sourceId} is not declared in the JLPT kanji source-evidence manifest`);
        return blockers;
    }

    if (source && !["approved", "restricted"].includes(source.licenseStatus)) {
        blockers.push(`source ${sourceId} license is ${source.licenseStatus}; approve or restrict it explicitly before import`);
    }
    if (source && source.status !== "active") {
        blockers.push(`source ${sourceId} is ${source.status}; activate it only after source provenance and extraction review`);
    }
    if (sourceConfig.sourceId && sourceConfig.sourceId !== sourceId) {
        blockers.push(`source input ${sourceId} declares mismatched sourceId ${sourceConfig.sourceId}`);
    }

    return blockers;
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

function buildAssignmentFromRow({ row, sourceConfig, contractKanjiSet }) {
    const issues = [];
    const kanji = getRowField(row, sourceConfig.kanjiColumn);
    const levelValue = getRowField(row, sourceConfig.levelColumn);
    const reviewStatus = getRowField(row, sourceConfig.reviewStatusColumn) || sourceConfig.defaultReviewStatus || "needs_review";
    const citation = getRowField(row, sourceConfig.citationColumn) || sourceConfig.defaultCitation;
    const evidenceRef = getRowField(row, sourceConfig.evidenceRefColumn) || sourceConfig.defaultEvidenceRef;
    const notes = getRowField(row, sourceConfig.notesColumn) || sourceConfig.defaultNotes;
    const shouldValidateEvidenceFields = reviewStatus === "reviewed";
    const shouldValidateLevel = shouldValidateEvidenceFields || levelValue.length > 0;
    const normalizedLevel = shouldValidateLevel
        ? normalizeInputLevel(levelValue, sourceConfig.levelMapping)
        : { level: null, levelRange: null, reason: null };

    if (Array.from(kanji).length !== 1) {
        issues.push(`invalid kanji value: ${kanji || "missing"}`);
    } else if (!contractKanjiSet.has(kanji)) {
        issues.push(`kanji ${kanji} is outside the current JLPT kanji contract`);
    }

    if (shouldValidateLevel && !Number.isInteger(normalizedLevel.level) && !Array.isArray(normalizedLevel.levelRange)) {
        issues.push(normalizedLevel.reason);
    }
    if (!SOURCE_INPUT_REVIEW_STATUSES.includes(reviewStatus)) {
        issues.push(`invalid reviewStatus: ${reviewStatus || "missing"}`);
    }
    if (shouldValidateEvidenceFields && sourceConfig.requireCitation !== false && !citation) {
        issues.push("missing citation");
    }
    if (shouldValidateEvidenceFields && sourceConfig.requireEvidenceRef !== false && !evidenceRef) {
        issues.push("missing evidenceRef");
    }

    return {
        rowNumber: row.__rowNumber,
        kanji,
        level: normalizedLevel.level,
        levelRange: normalizedLevel.levelRange,
        reviewStatus,
        citation,
        evidenceRef,
        notes,
        issues,
    };
}

function buildJlptKanjiSourceInputReport({
    sourceId,
    sourceConfig = {},
    sourceBuffer,
    contract = {},
    evidence = {},
    policy = {},
} = {}) {
    const blockers = [
        ...buildSourceMetadataBlockers({ sourceId, sourceConfig, evidence, policy }),
    ];
    const contractKanjiSet = new Set(Object.keys(contract.kanjiLevels || {}));
    const sourceText = Buffer.isBuffer(sourceBuffer) ? sourceBuffer.toString("utf8") : String(sourceBuffer || "");
    const sourceRows = sourceText ? parseSourceAssignmentRows(sourceText, sourceConfig.format) : [];
    const integrity = buildSourceFileIntegrity({ sourceBuffer: sourceBuffer || "", sourceRows });

    if (!sourceBuffer) {
        blockers.push(`source file is missing: ${sourceConfig.sourcePath || "unknown"}`);
    }
    blockers.push(...buildIntegrityBlockers({ sourceConfig, integrity, policy }));

    const rowResults = sourceRows.map((row) => buildAssignmentFromRow({ row, sourceConfig, contractKanjiSet }));
    const rejectedRows = rowResults.filter((row) => row.issues.length > 0);
    const reviewedAssignments = rowResults.filter((row) => row.issues.length === 0 && row.reviewStatus === "reviewed");
    const pendingRows = rowResults.filter((row) => row.issues.length === 0 && row.reviewStatus === "needs_review");
    const blockedRows = rowResults.filter((row) => row.issues.length === 0 && row.reviewStatus === "blocked");
    const sourceAccessGapRows = rowResults.filter((row) => row.issues.length === 0 && row.reviewStatus === "source_access_gap");
    const resolvedRowCount = reviewedAssignments.length + blockedRows.length + sourceAccessGapRows.length;
    if (reviewedAssignments.length === 0) {
        blockers.push("no reviewed assignments ready for import");
    }
    const assignments = Object.fromEntries(
        reviewedAssignments.map((row) => {
            const assignment = {
                reviewStatus: row.reviewStatus,
                citation: row.citation,
                evidenceRef: row.evidenceRef,
                notes: row.notes,
            };
            if (Number.isInteger(row.level)) {
                assignment.level = row.level;
            }
            if (Array.isArray(row.levelRange)) {
                assignment.levelRange = row.levelRange;
            }
            return [row.kanji, assignment];
        })
    );
    const reviewStatusCounts = rowResults.reduce((counts, row) => {
        counts[row.reviewStatus] = (counts[row.reviewStatus] || 0) + 1;
        return counts;
    }, {});

    return {
        valid: blockers.length === 0 && rejectedRows.length === 0 && reviewedAssignments.length > 0,
        noDeckMutation: policy.noDeckMutation !== false,
        sourceId,
        sourcePath: sourceConfig.sourcePath,
        sourceLabel: sourceConfig.sourceLabel,
        sourceUrl: sourceConfig.sourceUrl,
        format: sourceConfig.format,
        levelMapping: sourceConfig.levelMapping,
        integrity,
        blockers,
        rowCount: sourceRows.length,
        resolvedRowCount,
        reviewedAssignmentCount: reviewedAssignments.length,
        pendingRowCount: pendingRows.length,
        blockedRowCount: blockedRows.length,
        sourceAccessGapRowCount: sourceAccessGapRows.length,
        reviewStatusCounts,
        rejectedRowCount: rejectedRows.length,
        rejectedRows,
        assignments,
    };
}

module.exports = {
    SOURCE_INPUT_REVIEW_STATUSES,
    buildJlptKanjiSourceInputReport,
    buildSourceFileIntegrity,
    normalizeInputLevel,
    parseSourceAssignmentRows,
};
