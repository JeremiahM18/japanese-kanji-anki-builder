const zlib = require("node:zlib");

const { XMLParser } = require("fast-xml-parser");

const DEFAULT_CITATION = "EDRDG KANJIDIC2 legacy JLPT metadata; KANJIDIC Project, CC BY-SA 4.0.";
const DEFAULT_EVIDENCE_REF = "edrdg-kanjidic2:legacy-jlpt";

function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function decodeKanjidic2Buffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return String(buffer || "");
    }
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    return (isGzip ? zlib.gunzipSync(buffer) : buffer).toString("utf8");
}

function normalizeLegacyJlptLevel(value) {
    const level = Number(String(value || "").trim());
    if (!Number.isInteger(level) || level < 1 || level > 4) {
        return {
            modernLevel: null,
            reason: `invalid legacy JLPT level: ${String(value || "").trim() || "missing"}`,
        };
    }
    if (level === 2) {
        return {
            legacyLevel: 2,
            modernLevel: null,
            modernLevelRange: [2, 3],
            reason: null,
        };
    }
    return {
        legacyLevel: level,
        modernLevel: {
            1: 1,
            3: 4,
            4: 5,
        }[level],
        reason: null,
    };
}

function extractKanjidic2JlptRows(xmlText, { contractKanjiSet = null } = {}) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        trimValues: true,
    });
    const parsed = parser.parse(xmlText);
    const characters = asArray(parsed?.kanjidic2?.character);
    const rows = [];
    const skipped = [];

    for (const character of characters) {
        const kanji = String(character?.literal || "").trim();
        const legacyJlptLevel = String(character?.misc?.jlpt || "").trim();
        if (!kanji || !legacyJlptLevel) {
            continue;
        }

        const normalized = normalizeLegacyJlptLevel(legacyJlptLevel);
        if (!Number.isInteger(normalized.modernLevel) && !Array.isArray(normalized.modernLevelRange)) {
            skipped.push({
                kanji,
                legacyJlptLevel,
                reason: normalized.reason,
            });
            continue;
        }
        if (contractKanjiSet instanceof Set && !contractKanjiSet.has(kanji)) {
            skipped.push({
                kanji,
                legacyJlptLevel,
                reason: "outside the current JLPT kanji contract; excluded from source assignment import",
            });
            continue;
        }

        rows.push({
            kanji,
            legacyJlptLevel: String(normalized.legacyLevel),
            reviewStatus: "reviewed",
            citation: DEFAULT_CITATION,
            evidenceRef: DEFAULT_EVIDENCE_REF,
            notes: Array.isArray(normalized.modernLevelRange)
                ? "Extracted from KANJIDIC2 <misc><jlpt>; legacy JLPT 2 is retained as modern N2/N3 range evidence and must not settle exact placement by itself."
                : `Extracted from KANJIDIC2 <misc><jlpt>; legacy JLPT ${normalized.legacyLevel} maps to modern N${normalized.modernLevel}.`,
        });
    }

    rows.sort((a, b) => Number(a.legacyJlptLevel) - Number(b.legacyJlptLevel) || a.kanji.localeCompare(b.kanji, "ja"));
    skipped.sort((a, b) => Number(a.legacyJlptLevel) - Number(b.legacyJlptLevel) || a.kanji.localeCompare(b.kanji, "ja"));

    return {
        rows,
        skipped,
        sourceCharacterCount: characters.length,
    };
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function formatKanjidic2JlptRowsAsTsv(rows = []) {
    const headers = ["kanji", "legacyJlptLevel", "reviewStatus", "citation", "evidenceRef", "notes"];
    return [
        headers.join("\t"),
        ...rows.map((row) => headers.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

function buildKanjidic2JlptSource({ sourceBuffer, contract = null } = {}) {
    const xmlText = decodeKanjidic2Buffer(sourceBuffer);
    const contractKanjiSet = contract?.kanjiLevels
        ? new Set(Object.keys(contract.kanjiLevels))
        : null;
    const extracted = extractKanjidic2JlptRows(xmlText, { contractKanjiSet });
    const tsv = formatKanjidic2JlptRowsAsTsv(extracted.rows);
    const legacyLevelCounts = extracted.rows.reduce((counts, row) => {
        counts[row.legacyJlptLevel] = (counts[row.legacyJlptLevel] || 0) + 1;
        return counts;
    }, {});
    const skippedLevelCounts = extracted.skipped.reduce((counts, row) => {
        counts[row.legacyJlptLevel] = (counts[row.legacyJlptLevel] || 0) + 1;
        return counts;
    }, {});
    const skippedReasonCounts = extracted.skipped.reduce((counts, row) => {
        counts[row.reason] = (counts[row.reason] || 0) + 1;
        return counts;
    }, {});

    return {
        tsv,
        rows: extracted.rows,
        skipped: extracted.skipped,
        sourceCharacterCount: extracted.sourceCharacterCount,
        rowCount: extracted.rows.length,
        skippedCount: extracted.skipped.length,
        legacyLevelCounts,
        skippedLevelCounts,
        skippedReasonCounts,
    };
}

module.exports = {
    DEFAULT_CITATION,
    DEFAULT_EVIDENCE_REF,
    buildKanjidic2JlptSource,
    decodeKanjidic2Buffer,
    extractKanjidic2JlptRows,
    formatKanjidic2JlptRowsAsTsv,
    normalizeLegacyJlptLevel,
};
