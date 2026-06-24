const crypto = require("node:crypto");

const {
    parseCandidateSourceText,
} = require("./wordInventoryExpansionCandidateService");

const DEFAULT_TUBELEX_SOURCE_ID = "tubelex-ja-frequency";
const DEFAULT_TUBELEX_SOURCE_URL = "https://github.com/naist-nlp/tubelex/blob/main/frequencies/tubelex-ja-310-lemma-pos.tsv.xz";

const OUTPUT_COLUMNS = [
    "written",
    "reading",
    "meaning",
    "frequencyRank",
    "tubelexRank",
    "tubelexCount",
    "tubelexVideoCount",
    "tubelexChannelCount",
    "tubelexDispersionScore",
    "tubelexCategoryConcentration",
    "tubelexMatchStatus",
    "tubelexFrequencyBand",
    "source",
    "notes",
];

const MATCH_STATUS_ORDER = {
    exact_written: 0,
    lemma_match: 1,
    ambiguous_written: 2,
    missing: 3,
};

function normalizeText(value = "") {
    return String(value ?? "").trim();
}

function parseInteger(value) {
    const text = normalizeText(value);
    if (!text) {
        return null;
    }
    const parsed = Number.parseInt(text, 10);
    return Number.isInteger(parsed) ? parsed : null;
}

function escapeTsvCell(value) {
    return normalizeText(value)
        .replace(/\r?\n/gu, " ")
        .replace(/\t/gu, " ")
        .trim();
}

function formatNumber(value, digits = 4) {
    return Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : "";
}

function toIdentity(row = {}) {
    const written = normalizeText(row.written);
    const reading = normalizeText(row.reading);
    return written && reading ? `${written}|${reading}` : "";
}

function normalizeTubelexRows(tubelexText = "") {
    const parsedRows = parseCandidateSourceText(tubelexText, { format: "tsv" });
    const categoryColumns = new Set();
    const rows = [];

    for (const [index, rawRow] of parsedRows.entries()) {
        const word = normalizeText(rawRow.word || rawRow.lemma || rawRow.surface);
        if (!word || word === "[TOTAL]") {
            continue;
        }
        for (const key of Object.keys(rawRow || {})) {
            if (String(key).startsWith("count:")) {
                categoryColumns.add(key);
            }
        }
        const count = parseInteger(rawRow.count) || 0;
        const videos = parseInteger(rawRow.videos) || 0;
        const channels = parseInteger(rawRow.channels) || 0;
        rows.push({
            word,
            sourceRank: index + 1,
            count,
            videos,
            channels,
            pos: normalizeText(rawRow.pos),
            categories: Object.fromEntries(
                Object.entries(rawRow || {})
                    .filter(([key]) => String(key).startsWith("count:"))
                    .map(([key, value]) => [key, parseInteger(value) || 0])
            ),
        });
    }

    return {
        rows,
        categoryColumns: [...categoryColumns].sort(),
    };
}

function normalizeJmdictRows(jmdictText = "") {
    return parseCandidateSourceText(jmdictText, { format: "tsv" })
        .map((row) => ({
            written: normalizeText(row.written),
            reading: normalizeText(row.reading),
            meaning: normalizeText(row.meaning),
            source: normalizeText(row.source),
            notes: normalizeText(row.notes),
            frequencyRank: parseInteger(row.frequencyrank ?? row.frequencyRank),
        }))
        .filter((row) => row.written && row.reading)
        .map((row) => ({
            ...row,
            key: toIdentity(row),
        }));
}

function buildJmdictIndexes(jmdictRows = []) {
    const byWritten = new Map();
    const byReading = new Map();

    for (const row of jmdictRows) {
        const writtenRows = byWritten.get(row.written) || [];
        writtenRows.push(row);
        byWritten.set(row.written, writtenRows);

        const readingRows = byReading.get(row.reading) || [];
        readingRows.push(row);
        byReading.set(row.reading, readingRows);
    }

    return {
        byWritten,
        byReading,
    };
}

function getBestMatchStatus(currentStatus = "", nextStatus = "") {
    const currentOrder = MATCH_STATUS_ORDER[currentStatus] ?? MATCH_STATUS_ORDER.missing;
    const nextOrder = MATCH_STATUS_ORDER[nextStatus] ?? MATCH_STATUS_ORDER.missing;
    return nextOrder < currentOrder ? nextStatus : currentStatus;
}

function computeCategoryConcentration(row = {}) {
    const counts = Object.values(row.categories || {}).filter((value) => Number.isFinite(value) && value > 0);
    if (!row.count || counts.length === 0) {
        return null;
    }
    return Math.max(...counts) / row.count;
}

function computeDispersionScore(row = {}, totals = {}) {
    const maxVideos = Math.max(1, totals.maxVideos || 1);
    const maxChannels = Math.max(1, totals.maxChannels || 1);
    const videoScore = Math.log10((row.videos || 0) + 1) / Math.log10(maxVideos + 1);
    const channelScore = Math.log10((row.channels || 0) + 1) / Math.log10(maxChannels + 1);
    return Math.max(0, Math.min(100, ((videoScore + channelScore) / 2) * 100));
}

function shiftBandDown(band) {
    if (band === "strong") {
        return "good";
    }
    if (band === "good") {
        return "borderline";
    }
    if (band === "borderline") {
        return "poor";
    }
    return "poor";
}

function classifyTubelexFrequencyBand({ rank, dispersionScore, categoryConcentration, matchStatus } = {}) {
    if (matchStatus === "ambiguous_written") {
        return "poor";
    }
    let band = "poor";
    if (rank <= 5000) {
        band = "strong";
    } else if (rank <= 20000) {
        band = "good";
    } else if (rank <= 60000) {
        band = "borderline";
    }

    if (Number.isFinite(dispersionScore) && dispersionScore < 25 && band === "strong") {
        band = "good";
    }
    if (Number.isFinite(dispersionScore) && dispersionScore < 15 && ["strong", "good"].includes(band)) {
        band = "borderline";
    }
    if (Number.isFinite(categoryConcentration) && categoryConcentration > 0.75) {
        band = shiftBandDown(band);
    }
    if (matchStatus === "lemma_match") {
        band = shiftBandDown(band);
    }
    return band;
}

function buildFrequencyNotes({
    tubelexRow,
    matchStatus,
    sourceId = DEFAULT_TUBELEX_SOURCE_ID,
    sourceUrl = DEFAULT_TUBELEX_SOURCE_URL,
} = {}) {
    return [
        `${sourceId} support only`,
        "BSD-3-Clause",
        "not level truth",
        "not reading proof",
        "not card approval",
        `match=${matchStatus}`,
        `rank=${tubelexRow.sourceRank}`,
        sourceUrl,
    ].join("; ");
}

function compareDerivedRows(a = {}, b = {}) {
    return (
        (a.tubelexRank || Number.MAX_SAFE_INTEGER) - (b.tubelexRank || Number.MAX_SAFE_INTEGER)
        || (MATCH_STATUS_ORDER[a.tubelexMatchStatus] ?? 99) - (MATCH_STATUS_ORDER[b.tubelexMatchStatus] ?? 99)
        || String(a.written || "").localeCompare(String(b.written || ""), "ja")
        || String(a.reading || "").localeCompare(String(b.reading || ""), "ja")
    );
}

function buildDerivedRow({
    jmdictRow,
    tubelexRow,
    matchStatus,
    totals,
    sourceId,
    sourceUrl,
} = {}) {
    const categoryConcentration = computeCategoryConcentration(tubelexRow);
    const dispersionScore = computeDispersionScore(tubelexRow, totals);
    const tubelexFrequencyBand = classifyTubelexFrequencyBand({
        rank: tubelexRow.sourceRank,
        dispersionScore,
        categoryConcentration,
        matchStatus,
    });
    return {
        written: jmdictRow.written,
        reading: jmdictRow.reading,
        meaning: jmdictRow.meaning,
        frequencyRank: tubelexRow.sourceRank,
        tubelexRank: tubelexRow.sourceRank,
        tubelexCount: tubelexRow.count,
        tubelexVideoCount: tubelexRow.videos,
        tubelexChannelCount: tubelexRow.channels,
        tubelexDispersionScore: formatNumber(dispersionScore, 2),
        tubelexCategoryConcentration: formatNumber(categoryConcentration, 4),
        tubelexMatchStatus: matchStatus,
        tubelexFrequencyBand,
        source: sourceId,
        notes: buildFrequencyNotes({ tubelexRow, matchStatus, sourceId, sourceUrl }),
    };
}

function selectBestDerivedRow(current = null, next = null) {
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    const bestStatus = getBestMatchStatus(current.tubelexMatchStatus, next.tubelexMatchStatus);
    if (bestStatus !== current.tubelexMatchStatus && bestStatus === next.tubelexMatchStatus) {
        return next;
    }
    if ((next.tubelexRank || Number.MAX_SAFE_INTEGER) < (current.tubelexRank || Number.MAX_SAFE_INTEGER)) {
        return next;
    }
    return current;
}

function buildTubelexWordFrequencyRows({
    tubelexText = "",
    jmdictText = "",
    sourceId = DEFAULT_TUBELEX_SOURCE_ID,
    sourceUrl = DEFAULT_TUBELEX_SOURCE_URL,
} = {}) {
    const tubelex = normalizeTubelexRows(tubelexText);
    const jmdictRows = normalizeJmdictRows(jmdictText);
    const indexes = buildJmdictIndexes(jmdictRows);
    const totals = {
        maxVideos: tubelex.rows.reduce((max, row) => Math.max(max, row.videos || 0), 1),
        maxChannels: tubelex.rows.reduce((max, row) => Math.max(max, row.channels || 0), 1),
    };
    const derivedRowsByKey = new Map();
    const matchStatusCounts = {
        exact_written: 0,
        lemma_match: 0,
        ambiguous_written: 0,
        missing: 0,
    };

    for (const tubelexRow of tubelex.rows) {
        const exactWrittenMatches = indexes.byWritten.get(tubelexRow.word) || [];
        let matches = exactWrittenMatches;
        let matchStatus = exactWrittenMatches.length > 1 ? "ambiguous_written" : "exact_written";

        if (matches.length === 0) {
            matches = indexes.byReading.get(tubelexRow.word) || [];
            matchStatus = matches.length > 1 ? "ambiguous_written" : "lemma_match";
        }

        if (matches.length === 0) {
            matchStatusCounts.missing += 1;
            continue;
        }

        matchStatusCounts[matchStatus] += matches.length;
        for (const jmdictRow of matches) {
            const derivedRow = buildDerivedRow({
                jmdictRow,
                tubelexRow,
                matchStatus,
                totals,
                sourceId,
                sourceUrl,
            });
            derivedRowsByKey.set(
                toIdentity(derivedRow),
                selectBestDerivedRow(derivedRowsByKey.get(toIdentity(derivedRow)), derivedRow)
            );
        }
    }

    const rows = [...derivedRowsByKey.values()].sort(compareDerivedRows);
    const bandCounts = rows.reduce((counts, row) => {
        counts[row.tubelexFrequencyBand] = (counts[row.tubelexFrequencyBand] || 0) + 1;
        return counts;
    }, {});

    return {
        rows,
        summary: {
            sourceId,
            tubelexRows: tubelex.rows.length,
            jmdictRows: jmdictRows.length,
            derivedRows: rows.length,
            categoryColumns: tubelex.categoryColumns,
            matchStatusCounts,
            bandCounts,
            outputColumns: OUTPUT_COLUMNS,
        },
    };
}

function formatTubelexWordFrequencyTsv(rows = []) {
    const lines = [
        OUTPUT_COLUMNS.join("\t"),
        ...rows.map((row) => OUTPUT_COLUMNS.map((column) => escapeTsvCell(row[column])).join("\t")),
    ];
    return `${lines.join("\n")}\n`;
}

function buildTubelexOutputIntegrity(text = "", rows = []) {
    const buffer = Buffer.from(String(text || ""), "utf8");
    return {
        sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
        byteSize: buffer.length,
        rowCount: Array.isArray(rows) ? rows.length : 0,
        columns: OUTPUT_COLUMNS,
    };
}

module.exports = {
    DEFAULT_TUBELEX_SOURCE_ID,
    DEFAULT_TUBELEX_SOURCE_URL,
    OUTPUT_COLUMNS,
    buildTubelexOutputIntegrity,
    buildTubelexWordFrequencyRows,
    classifyTubelexFrequencyBand,
    formatTubelexWordFrequencyTsv,
};
