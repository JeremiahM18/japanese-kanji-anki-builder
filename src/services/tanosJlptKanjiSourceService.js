const DEFAULT_CITATION = "Tanos JLPT kanji base lists; Jonathan Waller, Creative Commons BY per https://www.tanos.co.uk/jlpt/sharing/.";
const DEFAULT_EVIDENCE_REF = "tanos_legacy_direct:jlpt-kanji-base";
const ESTIMATED_SPLIT_CITATION = "Tanos JLPT N2/N3 estimated kanji lists; Jonathan Waller, Creative Commons BY per https://www.tanos.co.uk/jlpt/sharing/.";
const ESTIMATED_SPLIT_EVIDENCE_REF = "tanos_estimated_split:jlpt-kanji-list";

const TANOS_LEGACY_LEVEL_SOURCES = Object.freeze({
    1: {
        modernLevel: 1,
        sourceLabel: "Tanos N1 kanji base list",
        sourceFileName: "jlpt_kanji_level_1_base.txt",
        sourceUrl: "https://www.tanos.co.uk/jlpt/oldexam/jlpt1/kanji/jlpt_kanji_level_1_base.zip",
        mappingNote: "Tanos presents N1 as equivalent to old JLPT 1, with some more advanced material possible.",
    },
    4: {
        modernLevel: 4,
        sourceLabel: "Tanos N4 kanji base list",
        sourceFileName: "jlpt_kanji_level_3_base.txt",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt4/kanji/jlpt_kanji_level_4_base.zip",
        mappingNote: "Tanos presents N4 as equivalent to old JLPT 3.",
    },
    5: {
        modernLevel: 5,
        sourceLabel: "Tanos N5 kanji base list",
        sourceFileName: "jlpt_kanji_level_4_base.txt",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt5/kanji/jlpt_kanji_level_5_base.zip",
        mappingNote: "Tanos presents N5 as equivalent to old JLPT 4.",
    },
});
const TANOS_ESTIMATED_SPLIT_LEVEL_SOURCES = Object.freeze({
    2: {
        modernLevel: 2,
        sourceLabel: "Tanos N2 estimated kanji list",
        sourceFileName: "KanjiList.N2.txt",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt2/kanji/KanjiList.N2.pdf",
        mappingNote: "Tanos N2/N3 kanji placement is treated as a post-2010 estimated split, not direct legacy JLPT truth.",
    },
    3: {
        modernLevel: 3,
        sourceLabel: "Tanos N3 estimated kanji list",
        sourceFileName: "KanjiList.N3.txt",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt3/kanji/KanjiList.N3.pdf",
        mappingNote: "Tanos N2/N3 kanji placement is treated as a post-2010 estimated split, not direct legacy JLPT truth.",
    },
});
const TANOS_LEVEL_SOURCES = TANOS_LEGACY_LEVEL_SOURCES;

function normalizeCell(value) {
    return String(value ?? "").trim();
}

function parseTanosKanjiLine(line, { sourceLabel = "Tanos source", rowNumber = 0 } = {}) {
    const cells = String(line || "").split(",").map(normalizeCell);
    if (cells.length !== 5) {
        throw new Error(`${sourceLabel} row ${rowNumber} has ${cells.length} comma-separated fields; expected 5.`);
    }

    const [kanji, japaneseSchoolGrade, onyomi, kunyomi, meanings] = cells;
    if (Array.from(kanji).length !== 1) {
        throw new Error(`${sourceLabel} row ${rowNumber} has invalid kanji value: ${kanji || "missing"}.`);
    }

    return {
        kanji,
        japaneseSchoolGrade,
        onyomi,
        kunyomi,
        meanings,
    };
}

function buildNotes({ levelConfig, row }) {
    const grade = row.japaneseSchoolGrade || "blank";
    return [
        `${levelConfig.sourceLabel}; ${levelConfig.mappingNote}`,
        `Original source row includes Japanese school grade ${grade}, onyomi, kunyomi, and meanings for provenance only.`,
    ].join(" ");
}

function buildEstimatedSplitNotes({ levelConfig, rowNumber }) {
    return [
        `${levelConfig.sourceLabel}; ${levelConfig.mappingNote}`,
        `Imported only as lower-weight estimated source evidence from source row ${rowNumber}; do not use this lane by itself to move kanji, move words, or claim final taxonomy confidence.`,
    ].join(" ");
}

function extractTanosJlptRows(sourceText, { tanosLevel, contractKanjiSet = null } = {}) {
    const levelConfig = TANOS_LEGACY_LEVEL_SOURCES[tanosLevel];
    if (!levelConfig) {
        throw new Error(`Unsupported Tanos JLPT kanji source level: ${tanosLevel}. Only N1, N4, and N5 are normalized automatically.`);
    }

    const lines = String(sourceText || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const rows = [];
    const skipped = [];

    lines.forEach((line, index) => {
        const row = parseTanosKanjiLine(line, {
            sourceLabel: levelConfig.sourceLabel,
            rowNumber: index + 1,
        });

        if (contractKanjiSet instanceof Set && !contractKanjiSet.has(row.kanji)) {
            skipped.push({
                kanji: row.kanji,
                tanosJlptLevel: `N${levelConfig.modernLevel}`,
                reason: "outside the current JLPT kanji contract; excluded from source assignment import",
            });
            return;
        }

        rows.push({
            kanji: row.kanji,
            tanosJlptLevel: `N${levelConfig.modernLevel}`,
            reviewStatus: "reviewed",
            citation: DEFAULT_CITATION,
            evidenceRef: DEFAULT_EVIDENCE_REF,
            notes: buildNotes({ levelConfig, row }),
        });
    });

    return {
        rows,
        skipped,
        sourceRowCount: lines.length,
    };
}

function parseTanosEstimatedKanjiLines(sourceText, { sourceLabel = "Tanos estimated source" } = {}) {
    const lines = String(sourceText || "")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const rows = [];
    const seen = new Set();

    lines.forEach((line, index) => {
        const match = line.match(/^(\p{Script=Han})(?:\s|$)/u);
        if (!match) {
            return;
        }
        const kanji = match[1];
        if (seen.has(kanji)) {
            throw new Error(`${sourceLabel} has duplicate kanji row: ${kanji}.`);
        }
        seen.add(kanji);
        rows.push({
            kanji,
            sourceRowNumber: index + 1,
        });
    });

    if (rows.length === 0) {
        throw new Error(`${sourceLabel} did not contain any parseable single-kanji assignment rows.`);
    }

    return rows;
}

function extractTanosEstimatedSplitRows(sourceText, { tanosLevel, contractKanjiSet = null } = {}) {
    const levelConfig = TANOS_ESTIMATED_SPLIT_LEVEL_SOURCES[tanosLevel];
    if (!levelConfig) {
        throw new Error(`Unsupported Tanos estimated split source level: ${tanosLevel}. Only N2 and N3 are normalized in this lane.`);
    }

    const sourceRows = parseTanosEstimatedKanjiLines(sourceText, {
        sourceLabel: levelConfig.sourceLabel,
    });
    const rows = [];
    const skipped = [];

    for (const row of sourceRows) {
        if (contractKanjiSet instanceof Set && !contractKanjiSet.has(row.kanji)) {
            skipped.push({
                kanji: row.kanji,
                tanosJlptLevel: `N${levelConfig.modernLevel}`,
                reason: "outside the current JLPT kanji contract; excluded from source assignment import",
            });
            continue;
        }

        rows.push({
            kanji: row.kanji,
            tanosJlptLevel: `N${levelConfig.modernLevel}`,
            reviewStatus: "reviewed",
            citation: ESTIMATED_SPLIT_CITATION,
            evidenceRef: ESTIMATED_SPLIT_EVIDENCE_REF,
            notes: buildEstimatedSplitNotes({ levelConfig, rowNumber: row.sourceRowNumber }),
        });
    }

    return {
        rows,
        skipped,
        sourceRowCount: sourceRows.length,
    };
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function formatTanosJlptRowsAsTsv(rows = []) {
    const headers = ["kanji", "tanosJlptLevel", "reviewStatus", "citation", "evidenceRef", "notes"];
    return [
        headers.join("\t"),
        ...rows.map((row) => headers.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

function assertNoDuplicateAssignments(rows = []) {
    const seen = new Map();
    for (const row of rows) {
        const existing = seen.get(row.kanji);
        if (existing && existing !== row.tanosJlptLevel) {
            throw new Error(`Conflicting Tanos assignments for ${row.kanji}: ${existing} and ${row.tanosJlptLevel}.`);
        }
        if (existing) {
            throw new Error(`Duplicate Tanos assignment for ${row.kanji} at ${row.tanosJlptLevel}; use base files, not cumulative files.`);
        }
        seen.set(row.kanji, row.tanosJlptLevel);
    }
}

function buildTanosJlptKanjiSource({ levelSources = [], contract = null, sourceMode = "legacy-direct" } = {}) {
    const contractKanjiSet = contract?.kanjiLevels
        ? new Set(Object.keys(contract.kanjiLevels))
        : null;
    const rows = [];
    const skipped = [];
    const sourceRowCounts = {};

    for (const source of levelSources) {
        const tanosLevel = Number(source.tanosLevel);
        const extractor = sourceMode === "estimated-split"
            ? extractTanosEstimatedSplitRows
            : extractTanosJlptRows;
        const extracted = extractor(source.sourceText, {
            tanosLevel,
            contractKanjiSet,
        });
        rows.push(...extracted.rows);
        skipped.push(...extracted.skipped);
        sourceRowCounts[`N${tanosLevel}`] = extracted.sourceRowCount;
    }

    assertNoDuplicateAssignments(rows);
    rows.sort((a, b) => (
        Number(a.tanosJlptLevel.slice(1)) - Number(b.tanosJlptLevel.slice(1))
        || a.kanji.localeCompare(b.kanji, "ja")
    ));
    skipped.sort((a, b) => (
        Number(a.tanosJlptLevel.slice(1)) - Number(b.tanosJlptLevel.slice(1))
        || a.kanji.localeCompare(b.kanji, "ja")
    ));

    const levelCounts = rows.reduce((counts, row) => {
        counts[row.tanosJlptLevel] = (counts[row.tanosJlptLevel] || 0) + 1;
        return counts;
    }, {});
    const skippedLevelCounts = skipped.reduce((counts, row) => {
        counts[row.tanosJlptLevel] = (counts[row.tanosJlptLevel] || 0) + 1;
        return counts;
    }, {});

    return {
        tsv: formatTanosJlptRowsAsTsv(rows),
        rows,
        skipped,
        rowCount: rows.length,
        skippedCount: skipped.length,
        sourceRowCounts,
        levelCounts,
        skippedLevelCounts,
    };
}

module.exports = {
    DEFAULT_CITATION,
    DEFAULT_EVIDENCE_REF,
    ESTIMATED_SPLIT_CITATION,
    ESTIMATED_SPLIT_EVIDENCE_REF,
    TANOS_ESTIMATED_SPLIT_LEVEL_SOURCES,
    TANOS_LEGACY_LEVEL_SOURCES,
    TANOS_LEVEL_SOURCES,
    buildTanosJlptKanjiSource,
    extractTanosEstimatedSplitRows,
    extractTanosJlptRows,
    formatTanosJlptRowsAsTsv,
    parseTanosEstimatedKanjiLines,
    parseTanosKanjiLine,
};
