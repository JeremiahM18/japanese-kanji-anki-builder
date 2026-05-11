const crypto = require("node:crypto");
const zlib = require("node:zlib");

const { XMLParser } = require("fast-xml-parser");

const TSV_HEADERS = ["written", "reading", "meaning", "frequencyRank", "source", "notes"];
const DEFAULT_SOURCE_ID = "jmdict";
const DEFAULT_LICENSE_NOTE = "EDRDG JMdict English; CC BY-SA 4.0.";

function asArray(value) {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}

function decodeJmdictBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        return String(buffer || "");
    }
    const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
    return (isGzip ? zlib.gunzipSync(buffer) : buffer).toString("utf8");
}

function textValue(value) {
    if (value === undefined || value === null) {
        return "";
    }
    if (typeof value === "string" || typeof value === "number") {
        return String(value).trim();
    }
    if (typeof value === "object") {
        return String(value["#text"] ?? value.text ?? "").trim();
    }
    return "";
}

function uniqueStrings(values = []) {
    return [...new Set(values.map(textValue).filter(Boolean))];
}

function restrictionAllows(restrictions = [], value = "") {
    return restrictions.length === 0 || restrictions.includes(value);
}

function readingAppliesToWritten(readingElement = {}, written = "") {
    return restrictionAllows(uniqueStrings(asArray(readingElement.re_restr)), written);
}

function senseAppliesToPair(sense = {}, written = "", reading = "") {
    const writtenRestrictions = uniqueStrings(asArray(sense.stagk));
    const readingRestrictions = uniqueStrings(asArray(sense.stagr));
    return restrictionAllows(writtenRestrictions, written) && restrictionAllows(readingRestrictions, reading);
}

function extractGlossesForPair(senses = [], written = "", reading = "") {
    const glosses = [];
    for (const sense of senses) {
        if (!senseAppliesToPair(sense, written, reading)) {
            continue;
        }
        glosses.push(...uniqueStrings(asArray(sense.gloss)));
    }
    return uniqueStrings(glosses);
}

function collectPriorityTags(writtenElement = {}, readingElement = {}) {
    return uniqueStrings([
        ...asArray(writtenElement.ke_pri),
        ...asArray(readingElement.re_pri),
    ]);
}

function priorityRank(tags = []) {
    if (!Array.isArray(tags) || tags.length === 0) {
        return null;
    }
    const ranks = tags.map((tag) => {
        const normalized = String(tag || "").trim().toLowerCase();
        const nfMatch = normalized.match(/^nf(\d{2})$/u);
        if (nfMatch) {
            return 1000 + Number(nfMatch[1]);
        }
        const fixed = {
            news1: 100,
            ichi1: 110,
            spec1: 120,
            gai1: 130,
            news2: 200,
            ichi2: 210,
            spec2: 220,
            gai2: 230,
        }[normalized];
        return Number.isInteger(fixed) ? fixed : null;
    }).filter(Number.isInteger);

    return ranks.length > 0 ? Math.min(...ranks) : null;
}

function mergeRow(existing, incoming) {
    if (!existing) {
        return {
            ...incoming,
            entrySeqs: [...incoming.entrySeqs],
            meanings: [...incoming.meanings],
            priorityTags: [...incoming.priorityTags],
        };
    }
    return {
        ...existing,
        entrySeqs: uniqueStrings([...existing.entrySeqs, ...incoming.entrySeqs]),
        meanings: uniqueStrings([...existing.meanings, ...incoming.meanings]),
        priorityTags: uniqueStrings([...existing.priorityTags, ...incoming.priorityTags]),
        frequencyRank: [existing.frequencyRank, incoming.frequencyRank]
            .filter(Number.isInteger)
            .sort((a, b) => a - b)[0] ?? null,
    };
}

function parseJmdictXml(xmlText) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        parseAttributeValue: false,
        parseTagValue: false,
        processEntities: false,
        textNodeName: "#text",
        trimValues: true,
    });
    return parser.parse(xmlText);
}

function extractJmdictWordRows(xmlText, {
    sourceId = DEFAULT_SOURCE_ID,
    licenseNote = DEFAULT_LICENSE_NOTE,
} = {}) {
    const parsed = parseJmdictXml(xmlText);
    const entries = asArray(parsed?.JMdict?.entry);
    const rowsByKey = new Map();
    const skipped = [];

    for (const entry of entries) {
        const entrySeq = textValue(entry?.ent_seq);
        const writtenElements = asArray(entry?.k_ele);
        const readingElements = asArray(entry?.r_ele);
        const senses = asArray(entry?.sense);

        if (writtenElements.length === 0 || readingElements.length === 0) {
            skipped.push({
                entrySeq,
                reason: "kana-only or missing written kanji form",
            });
            continue;
        }

        for (const writtenElement of writtenElements) {
            const written = textValue(writtenElement?.keb);
            if (!written) {
                continue;
            }
            for (const readingElement of readingElements) {
                const reading = textValue(readingElement?.reb);
                if (!reading || !readingAppliesToWritten(readingElement, written)) {
                    continue;
                }

                const meanings = extractGlossesForPair(senses, written, reading);
                if (meanings.length === 0) {
                    skipped.push({
                        entrySeq,
                        written,
                        reading,
                        reason: "no unrestricted English gloss for exact written-reading pair",
                    });
                    continue;
                }

                const priorityTags = collectPriorityTags(writtenElement, readingElement);
                const frequencyRank = priorityRank(priorityTags);
                const key = `${written}\t${reading}`;
                rowsByKey.set(key, mergeRow(rowsByKey.get(key), {
                    written,
                    reading,
                    meanings,
                    frequencyRank,
                    source: sourceId,
                    entrySeqs: [entrySeq].filter(Boolean),
                    priorityTags,
                    licenseNote,
                }));
            }
        }
    }

    const rows = [...rowsByKey.values()]
        .map((row) => ({
            written: row.written,
            reading: row.reading,
            meaning: row.meanings.slice(0, 12).join("; "),
            frequencyRank: Number.isInteger(row.frequencyRank) ? row.frequencyRank : "",
            source: row.source,
            notes: [
                row.entrySeqs.length ? `entrySeq=${row.entrySeqs.slice(0, 8).join(",")}` : "",
                row.priorityTags.length ? `jmdictPriority=${row.priorityTags.sort().join(",")}` : "jmdictPriority=none",
                licenseNote,
                "use=dictionary-verification and priority/commonness support only",
            ].filter(Boolean).join("; "),
        }))
        .sort((a, b) => (
            a.written.localeCompare(b.written, "ja")
            || a.reading.localeCompare(b.reading, "ja")
        ));

    skipped.sort((a, b) => (
        String(a.entrySeq || "").localeCompare(String(b.entrySeq || ""), "ja")
        || String(a.written || "").localeCompare(String(b.written || ""), "ja")
        || String(a.reading || "").localeCompare(String(b.reading || ""), "ja")
    ));

    return {
        rows,
        skipped,
        sourceEntryCount: entries.length,
    };
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ")
        .trim();
}

function formatJmdictWordRowsAsTsv(rows = []) {
    return [
        TSV_HEADERS.join("\t"),
        ...rows.map((row) => TSV_HEADERS.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

function hashBuffer(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildJmdictWordSource({ sourceBuffer, sourceId = DEFAULT_SOURCE_ID } = {}) {
    const buffer = Buffer.isBuffer(sourceBuffer) ? sourceBuffer : Buffer.from(String(sourceBuffer || ""), "utf8");
    const xmlText = decodeJmdictBuffer(buffer);
    const extracted = extractJmdictWordRows(xmlText, { sourceId });
    const tsv = formatJmdictWordRowsAsTsv(extracted.rows);
    const outputBuffer = Buffer.from(tsv, "utf8");
    const priorityRowCount = extracted.rows.filter((row) => String(row.frequencyRank || "").trim()).length;
    return {
        tsv,
        rows: extracted.rows,
        skipped: extracted.skipped,
        sourceEntryCount: extracted.sourceEntryCount,
        rowCount: extracted.rows.length,
        priorityRowCount,
        skippedCount: extracted.skipped.length,
        inputIntegrity: {
            sha256: hashBuffer(buffer),
            byteSize: buffer.length,
        },
        outputIntegrity: {
            sha256: hashBuffer(outputBuffer),
            byteSize: outputBuffer.length,
            rowCount: extracted.rows.length,
        },
    };
}

module.exports = {
    DEFAULT_LICENSE_NOTE,
    DEFAULT_SOURCE_ID,
    TSV_HEADERS,
    buildJmdictWordSource,
    decodeJmdictBuffer,
    extractJmdictWordRows,
    formatJmdictWordRowsAsTsv,
    priorityRank,
};
