const DEFAULT_ATTRIBUTION = "Tanos JLPT vocabulary PDF; Jonathan Waller; Creative Commons BY per https://www.tanos.co.uk/jlpt/sharing/.";

const TANOS_WORD_LEVEL_SOURCES = Object.freeze({
    1: {
        sourceId: "tanos-n1-vocab",
        sourceLabel: "Tanos JLPT N1 vocabulary list",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt1/vocab/n1-vocab-kanji-eng.mem",
        defaultInput: "downloads/tanos/n1/n1-vocab-kanji-eng.mem",
        defaultReadingInput: "downloads/tanos/n1/n1-vocab-kanji-hiragana.mem",
        defaultInputKind: "mnemosyne-pair",
        defaultOutput: "downloads/tanos-n1-vocab.tsv",
    },
    2: {
        sourceId: "tanos-n2-vocab",
        sourceLabel: "Tanos JLPT N2 vocabulary list",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt2/vocab/n2-vocab-kanji-eng.mem",
        defaultInput: "downloads/tanos/n2/n2-vocab-kanji-eng.mem",
        defaultReadingInput: "downloads/tanos/n2/n2-vocab-kanji-hiragana.mem",
        defaultInputKind: "mnemosyne-pair",
        defaultOutput: "downloads/tanos-n2-vocab.tsv",
    },
    3: {
        sourceId: "tanos-n3-vocab",
        sourceLabel: "Tanos JLPT N3 vocabulary list",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt3/vocab/VocabList.N3.pdf",
        defaultInput: "downloads/tanos/n3/VocabList.N3.txt",
        defaultOutput: "downloads/tanos-n3-vocab.tsv",
    },
    4: {
        sourceId: "tanos-n4-vocab",
        sourceLabel: "Tanos JLPT N4 vocabulary list",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt4/vocab/n4-vocab-kanji-eng.mem",
        defaultInput: "downloads/tanos/n4/n4-vocab-kanji-eng.mem",
        defaultReadingInput: "downloads/tanos/n4/n4-vocab-kanji-hiragana.mem",
        defaultInputKind: "mnemosyne-pair",
        defaultOutput: "downloads/tanos-n4-vocab.tsv",
    },
    5: {
        sourceId: "tanos-n5-vocab",
        sourceLabel: "Tanos JLPT N5 vocabulary list",
        sourceUrl: "https://www.tanos.co.uk/jlpt/jlpt5/vocab/n5-vocab-kanji-eng.mem",
        defaultInput: "downloads/tanos/n5/n5-vocab-kanji-eng.mem",
        defaultReadingInput: "downloads/tanos/n5/n5-vocab-kanji-hiragana.mem",
        defaultInputKind: "mnemosyne-pair",
        defaultOutput: "downloads/tanos-n5-vocab.tsv",
    },
});

function normalizeLevel(value) {
    const level = Number.parseInt(String(value || "").replace(/^n/i, ""), 10);
    if (!Number.isInteger(level) || !TANOS_WORD_LEVEL_SOURCES[level]) {
        throw new Error("Tanos JLPT word source level must be one of N1, N2, N3, N4, or N5.");
    }
    return level;
}

function normalizeLine(value) {
    return String(value || "")
        .replace(/\uFEFF/g, "")
        .trim();
}

function isBoilerplateLine(line) {
    return !line
        || /JLPT Resources/u.test(line)
        || /^\d+$/.test(line)
        || /^JLPT N[1-5] Vocab List$/u.test(line)
        || /^This is not a cumulative list/u.test(line)
        || /^and below\)\.?$/u.test(line)
        || /^(Kanji|Hiragana|English)$/u.test(line);
}

function cleanExtractedLines(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map(normalizeLine)
        .filter((line) => !isBoilerplateLine(line));
}

function startsCandidateLine(line) {
    return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ〇Ａ-Ｚａ-ｚ０-９]/u.test(line);
}

function hasKanji(line) {
    return /\p{Script=Han}/u.test(line);
}

function isReadingToken(line) {
    return /^[\p{Script=Hiragana}\p{Script=Katakana}ー・\s()（）.\-]+$/u.test(line)
        && /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(line);
}

function isMeaningStart(line) {
    return !startsCandidateLine(line);
}

function isJapaneseParentheticalContinuation(line, meaningLines = []) {
    return meaningLines.length > 0 && /[）)]$/.test(line);
}

function shouldContinueMeaning(lines, index, meaningLines = []) {
    const line = lines[index];
    if (!line) {
        return false;
    }
    if (isMeaningStart(line)) {
        return true;
    }
    return isJapaneseParentheticalContinuation(line, meaningLines);
}

function normalizeMeaning(meaningLines = []) {
    return meaningLines
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
}

function readSplitWrittenRow(lines, index) {
    const written = lines[index];
    const next = lines[index + 1] || "";
    const following = lines[index + 2] || "";

    if (!next || !following) {
        return null;
    }

    if (startsCandidateLine(next) && isReadingToken(following)) {
        return {
            written: `${written}${next}`,
            reading: following,
            nextIndex: index + 3,
        };
    }

    if (isReadingToken(next) && isReadingToken(following)) {
        return {
            written: `${written}${next}`,
            reading: following,
            nextIndex: index + 3,
        };
    }

    if (!hasKanji(written) && isReadingToken(next) && /^[（(]/u.test(following)) {
        const joined = `${written}${next}`;
        return {
            written: joined,
            reading: joined,
            nextIndex: index + 2,
        };
    }

    return null;
}

function readRow(lines, index) {
    const written = lines[index];
    const splitRow = readSplitWrittenRow(lines, index);
    if (splitRow) {
        return splitRow;
    }

    const next = lines[index + 1] || "";
    const following = lines[index + 2] || "";
    if (isReadingToken(next) && (hasKanji(written) || isMeaningStart(following) || next === written)) {
        return {
            written,
            reading: next,
            nextIndex: index + 2,
        };
    }

    return {
        written,
        reading: written,
        nextIndex: index + 1,
    };
}

function buildNotes({
    levelConfig,
    sourceRowNumber,
    sourceDescriptor = "extracted PDF text",
    attribution = DEFAULT_ATTRIBUTION,
}) {
    return [
        attribution,
        `${levelConfig.sourceLabel}; normalized from ${sourceDescriptor} row ${sourceRowNumber}.`,
        "Discovery and weak level hint only; not card approval, dictionary evidence, meaning evidence, pitch evidence, or frequency evidence.",
    ].join(" ");
}

function parseTanosJlptWordRows(sourceText, { level, sourceId = "", sourceLabel = "" } = {}) {
    const normalizedLevel = normalizeLevel(level);
    const levelConfig = TANOS_WORD_LEVEL_SOURCES[normalizedLevel];
    const resolvedSourceId = sourceId || levelConfig.sourceId;
    const resolvedSourceLabel = sourceLabel || levelConfig.sourceLabel;
    const lines = cleanExtractedLines(sourceText);
    const rows = [];
    const skippedLines = [];

    for (let index = 0; index < lines.length;) {
        const line = lines[index];
        if (!startsCandidateLine(line)) {
            skippedLines.push({
                lineNumber: index + 1,
                text: line,
                reason: "not a candidate word start",
            });
            index += 1;
            continue;
        }

        const sourceRowNumber = rows.length + 1;
        const row = readRow(lines, index);
        index = row.nextIndex;

        const meaningLines = [];
        while (index < lines.length && shouldContinueMeaning(lines, index, meaningLines)) {
            meaningLines.push(lines[index]);
            index += 1;
        }

        rows.push({
            written: row.written,
            reading: row.reading,
            meaning: normalizeMeaning(meaningLines),
            jlpt: `N${normalizedLevel}`,
            source: resolvedSourceId,
            notes: buildNotes({
                levelConfig: {
                    ...levelConfig,
                    sourceLabel: resolvedSourceLabel,
                },
                sourceRowNumber,
            }),
        });
    }

    return {
        rows,
        rowCount: rows.length,
        skippedLines,
        sourceLineCount: lines.length,
        sourceId: resolvedSourceId,
        sourceLabel: resolvedSourceLabel,
        sourceUrl: levelConfig.sourceUrl,
    };
}

function parseMnemosyneValue(rawValue = "") {
    const value = String(rawValue || "").trim();
    if (value.startsWith("\"") && value.endsWith("\"")) {
        return JSON.parse(value);
    }
    return value;
}

function parseMnemosyneItems(sourceText = "") {
    const itemBlocks = String(sourceText || "")
        .split(/\(imnemosyne\.core\.mnemosyne_core\r?\nItem/u)
        .slice(1);
    return itemBlocks
        .map((block) => {
            const answerMatch = block.match(/S'a'\r?\nV([^\r\n]+)/u);
            const questionMatch = block.match(/S'q'\r?\nV([^\r\n]+)/u);
            if (!answerMatch || !questionMatch) {
                return null;
            }
            return {
                question: parseMnemosyneValue(questionMatch[1]),
                answer: parseMnemosyneValue(answerMatch[1]),
            };
        })
        .filter(Boolean);
}

function buildReadingMap(readingItems = []) {
    const readingMap = new Map();
    for (const item of readingItems) {
        if (!readingMap.has(item.question)) {
            readingMap.set(item.question, []);
        }
        const readings = readingMap.get(item.question);
        if (!readings.includes(item.answer)) {
            readings.push(item.answer);
        }
    }
    return readingMap;
}

function parseTanosJlptWordMnemosyneRows({
    englishMemText = "",
    readingMemText = "",
    level,
    sourceId = "",
    sourceLabel = "",
} = {}) {
    const normalizedLevel = normalizeLevel(level);
    const levelConfig = TANOS_WORD_LEVEL_SOURCES[normalizedLevel];
    const resolvedSourceId = sourceId || levelConfig.sourceId;
    const resolvedSourceLabel = sourceLabel || levelConfig.sourceLabel;
    const englishItems = parseMnemosyneItems(englishMemText);
    const readingItems = parseMnemosyneItems(readingMemText);
    const readingMap = buildReadingMap(readingItems);
    const mnemosyneAttribution = "Tanos JLPT vocabulary Mnemosyne exports; Jonathan Waller; Creative Commons BY per https://www.tanos.co.uk/jlpt/sharing/.";
    const rows = [];

    englishItems.forEach((item, index) => {
        const readings = readingMap.get(item.question) || [item.question];
        for (const reading of readings) {
            rows.push({
                written: item.question,
                reading,
                meaning: item.answer,
                jlpt: `N${normalizedLevel}`,
                source: resolvedSourceId,
                notes: buildNotes({
                    levelConfig: {
                        ...levelConfig,
                        sourceLabel: resolvedSourceLabel,
                    },
                    sourceDescriptor: "paired Mnemosyne export",
                    attribution: mnemosyneAttribution,
                    sourceRowNumber: index + 1,
                }),
            });
        }
    });

    return {
        rows,
        rowCount: rows.length,
        skippedLines: [],
        sourceLineCount: englishItems.length,
        sourceRecordCount: englishItems.length + readingItems.length,
        sourceId: resolvedSourceId,
        sourceLabel: resolvedSourceLabel,
        sourceUrl: levelConfig.sourceUrl,
        englishItemCount: englishItems.length,
        readingItemCount: readingItems.length,
    };
}

function escapeTsvCell(value) {
    return String(value ?? "")
        .replace(/\r?\n/g, " ")
        .replace(/\t/g, " ");
}

function applyReviewedEvidence(rows = [], reviewedEvidence = null) {
    if (!reviewedEvidence) {
        return rows;
    }
    const citation = String(reviewedEvidence.citation || "").trim();
    const evidenceRefPrefix = String(reviewedEvidence.evidenceRefPrefix || "").trim();
    if (!citation || !evidenceRefPrefix) {
        throw new Error("Reviewed Tanos word source output requires citation and evidenceRefPrefix.");
    }
    const seenIdentities = new Set();
    return rows.map((row, index) => ({
        ...row,
        ...(() => {
            const identity = `${row.written}|${row.reading}`;
            const duplicate = seenIdentities.has(identity);
            seenIdentities.add(identity);
            const evidenceRef = `${evidenceRefPrefix}; normalized paired row ${index + 1}`;
            if (duplicate) {
                return {
                    reviewStatus: "needs_review",
                    citation,
                    evidenceRef,
                    notes: `${row.notes} Duplicate exact identity in the normalized source input; not imported as reviewed evidence until manually reconciled.`,
                };
            }
            return {
                reviewStatus: "reviewed",
                citation,
                evidenceRef,
            };
        })(),
    }));
}

function formatTanosWordRowsAsTsv(rows = [], { includeReviewColumns = false } = {}) {
    const headers = [
        "written",
        "reading",
        "meaning",
        "jlpt",
        "source",
        ...(includeReviewColumns ? ["reviewStatus", "citation", "evidenceRef"] : []),
        "notes",
    ];
    return [
        headers.join("\t"),
        ...rows.map((row) => headers.map((header) => escapeTsvCell(row[header])).join("\t")),
    ].join("\n") + "\n";
}

function buildTanosJlptWordSource({
    sourceText = "",
    level,
    sourceId = "",
    sourceLabel = "",
    reviewedEvidence = null,
} = {}) {
    const parsed = parseTanosJlptWordRows(sourceText, {
        level,
        sourceId,
        sourceLabel,
    });
    const rows = applyReviewedEvidence(parsed.rows, reviewedEvidence);
    return {
        ...parsed,
        rows,
        tsv: formatTanosWordRowsAsTsv(rows, { includeReviewColumns: Boolean(reviewedEvidence) }),
    };
}

function buildTanosJlptWordSourceFromMnemosyne({
    englishMemText = "",
    readingMemText = "",
    level,
    sourceId = "",
    sourceLabel = "",
    reviewedEvidence = null,
} = {}) {
    const parsed = parseTanosJlptWordMnemosyneRows({
        englishMemText,
        readingMemText,
        level,
        sourceId,
        sourceLabel,
    });
    const rows = applyReviewedEvidence(parsed.rows, reviewedEvidence);
    return {
        ...parsed,
        rows,
        tsv: formatTanosWordRowsAsTsv(rows, { includeReviewColumns: Boolean(reviewedEvidence) }),
    };
}

module.exports = {
    DEFAULT_ATTRIBUTION,
    TANOS_WORD_LEVEL_SOURCES,
    buildTanosJlptWordSource,
    buildTanosJlptWordSourceFromMnemosyne,
    cleanExtractedLines,
    formatTanosWordRowsAsTsv,
    normalizeLevel,
    parseMnemosyneItems,
    parseTanosJlptWordMnemosyneRows,
    parseTanosJlptWordRows,
};
