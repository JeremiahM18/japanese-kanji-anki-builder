const {
    SOURCE_INPUT_REVIEW_STATUSES,
    parseSourceAssignmentRows,
} = require("./jlptKanjiSourceInputService");

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

function isReviewedDowngrade({ sourceRow = {}, batchRow = {}, sourceConfig = {} } = {}) {
    const sourceStatus = getReviewStatus(sourceRow, sourceConfig);
    const batchStatus = getReviewStatus(batchRow, sourceConfig);
    return sourceStatus === "reviewed" && batchStatus !== "reviewed";
}

function countBatchStatuses(rows = [], sourceConfig = {}) {
    return rows.reduce((counts, row) => {
        const reviewStatus = getReviewStatus(row, sourceConfig);
        counts[reviewStatus] = (counts[reviewStatus] || 0) + 1;
        return counts;
    }, {});
}

function buildJlptKanjiSourceBatchMerge({
    allowAdditions = false,
    sourceConfig = {},
    sourceText = "",
    batchText = "",
} = {}) {
    if (sourceConfig.format && sourceConfig.format !== "tsv") {
        throw new Error(`Source batch merge only supports TSV inputs, got ${sourceConfig.format}.`);
    }

    const kanjiColumn = sourceConfig.kanjiColumn || "kanji";
    const sourceHeaders = parseHeaders(sourceText);
    const batchHeaders = parseHeaders(batchText);
    const sourceRows = parseSourceAssignmentRows(sourceText, "tsv");
    const batchRows = parseSourceAssignmentRows(batchText, "tsv");
    const blockers = [];
    const validStatuses = new Set(SOURCE_INPUT_REVIEW_STATUSES);

    if (!sourceHeaders.includes(kanjiColumn)) {
        blockers.push(`source worksheet is missing kanji column: ${kanjiColumn}`);
    }
    if (!batchHeaders.includes(kanjiColumn)) {
        blockers.push(`batch worksheet is missing kanji column: ${kanjiColumn}`);
    }
    for (const header of batchHeaders) {
        if (!sourceHeaders.includes(header)) {
            blockers.push(`batch worksheet has unknown column: ${header}`);
        }
    }

    const sourceIndex = new Map();
    sourceRows.forEach((row) => {
        const kanji = normalizeText(row[kanjiColumn]);
        if (!kanji) {
            blockers.push(`source row ${row.__rowNumber} is missing kanji`);
            return;
        }
        if (sourceIndex.has(kanji)) {
            blockers.push(`source worksheet has duplicate kanji row: ${kanji}`);
        }
        sourceIndex.set(kanji, row);
    });

    const seenBatchKanji = new Set();
    for (const row of batchRows) {
        const kanji = normalizeText(row[kanjiColumn]);
        if (!kanji) {
            blockers.push(`batch row ${row.__rowNumber} is missing kanji`);
            continue;
        }
        if (seenBatchKanji.has(kanji)) {
            blockers.push(`batch worksheet has duplicate kanji row: ${kanji}`);
        }
        seenBatchKanji.add(kanji);
        if (!sourceIndex.has(kanji) && !allowAdditions) {
            blockers.push(`batch kanji ${kanji} is not present in source worksheet`);
        }
        const reviewStatus = getReviewStatus(row, sourceConfig);
        if (!validStatuses.has(reviewStatus)) {
            blockers.push(`batch row ${row.__rowNumber} has invalid reviewStatus: ${reviewStatus}`);
        }
        const sourceRow = sourceIndex.get(kanji);
        if (sourceRow && isReviewedDowngrade({ sourceRow, batchRow: row, sourceConfig })) {
            blockers.push(`batch row ${row.__rowNumber} would downgrade reviewed source evidence for ${kanji}`);
        }
    }

    if (blockers.length > 0) {
        return {
            valid: false,
            blockers,
            sourceRowCount: sourceRows.length,
            batchRowCount: batchRows.length,
            changedRowCount: 0,
            reviewedRowCount: 0,
            pendingRowCount: 0,
            blockedRowCount: 0,
            sourceAccessGapRowCount: 0,
            statusCounts: countBatchStatuses(batchRows, sourceConfig),
            tsv: sourceText,
        };
    }

    let changedRowCount = 0;
    const batchIndex = new Map(batchRows.map((row) => [normalizeText(row[kanjiColumn]), row]));
    const addedRows = [];
    const mergedRows = sourceRows.map((row) => {
        const batchRow = batchIndex.get(normalizeText(row[kanjiColumn]));
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
        const kanji = normalizeText(row[kanjiColumn]);
        if (!sourceIndex.has(kanji)) {
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
        sourceRowCount: sourceRows.length,
        batchRowCount: batchRows.length,
        addedRowCount: addedRows.length,
        changedRowCount,
        reviewedRowCount: statusCounts.reviewed || 0,
        pendingRowCount: statusCounts.needs_review || 0,
        blockedRowCount: statusCounts.blocked || 0,
        sourceAccessGapRowCount: statusCounts.source_access_gap || 0,
        statusCounts,
        tsv: formatRowsAsTsv({ headers: sourceHeaders, rows: [...mergedRows, ...addedRows] }),
    };
}

module.exports = {
    buildJlptKanjiSourceBatchMerge,
    formatRowsAsTsv,
};
