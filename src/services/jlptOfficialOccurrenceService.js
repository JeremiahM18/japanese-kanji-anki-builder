const {
    OFFICIAL_OCCURRENCE_ROW_FIELDS,
    normalizeJlptOfficialOccurrenceEvidence,
} = require("../datasets/jlptOfficialOccurrenceEvidence");
const { parseSourceAssignmentRows } = require("./jlptKanjiSourceInputService");

const INPUT_TEXT_FIELDS = Object.freeze(["text", "sourceText", "pdfText"]);
const DISALLOWED_OUTPUT_FIELDS = Object.freeze([
    "answer",
    "answers",
    "choice",
    "choices",
    "prompt",
    "question",
    "questionText",
    "translation",
]);
const LEVEL_ORDER = Object.freeze(["N5", "N4", "N3", "N2", "N1"]);

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeJlptLevel(value) {
    const match = normalizeText(value).match(/^n?([1-5])$/i);
    if (!match) {
        throw new Error(`Invalid JLPT occurrence level: ${normalizeText(value) || "missing"}`);
    }
    return `N${match[1]}`;
}

function normalizePositivePage(value) {
    const page = Number(normalizeText(value));
    if (!Number.isInteger(page) || page < 1) {
        throw new Error(`Invalid official occurrence page: ${normalizeText(value) || "missing"}`);
    }
    return page;
}

function normalizeRequiredField(row = {}, fieldName) {
    const value = normalizeText(row[fieldName]);
    if (!value) {
        throw new Error(`Missing official occurrence ${fieldName}.`);
    }
    return value;
}

function extractObservedKanjiFromText(text) {
    return [...new Set(Array.from(String(text || "")).filter((char) => /^\p{Script=Han}$/u.test(char)))]
        .sort((a, b) => a.localeCompare(b, "ja"));
}

function parseObservedKanjiCell(value) {
    return extractObservedKanjiFromText(value);
}

function getInputText(row = {}) {
    for (const field of INPUT_TEXT_FIELDS) {
        const value = normalizeText(row[field]);
        if (value) {
            return value;
        }
    }
    return "";
}

function buildOccurrenceRowsForInputRow(row = {}) {
    const level = normalizeJlptLevel(row.level);
    const sourcePdf = normalizeRequiredField(row, "sourcePdf");
    const section = normalizeRequiredField(row, "section");
    const page = normalizePositivePage(row.page);
    const questionRef = normalizeRequiredField(row, "questionRef");
    const observedKanji = normalizeText(row.observedKanji)
        ? parseObservedKanjiCell(row.observedKanji)
        : extractObservedKanjiFromText(getInputText(row));

    if (observedKanji.length === 0) {
        throw new Error("No observed kanji found for official occurrence row.");
    }

    return observedKanji.map((kanji) => ({
        level,
        sourcePdf,
        section,
        page,
        questionRef,
        observedKanji: kanji,
    }));
}

function getDisallowedCopiedFields(row = {}) {
    return DISALLOWED_OUTPUT_FIELDS.filter((field) => Object.hasOwn(row, field) && normalizeText(row[field]).length > 0);
}

function buildOfficialOccurrenceExtraction({ sourceRows = [] } = {}) {
    const rows = [];
    const rejectedRows = [];

    sourceRows.forEach((row, index) => {
        const rowNumber = row.__rowNumber || index + 1;
        const disallowedFields = getDisallowedCopiedFields(row);
        if (disallowedFields.length > 0) {
            rejectedRows.push({
                rowNumber,
                issues: [`copied question/answer-like fields are not allowed: ${disallowedFields.join(", ")}`],
            });
            return;
        }

        try {
            rows.push(...buildOccurrenceRowsForInputRow(row));
        } catch (error) {
            rejectedRows.push({
                rowNumber,
                issues: [error.message],
            });
        }
    });

    const deduped = [];
    const seen = new Set();
    for (const row of rows) {
        const key = OFFICIAL_OCCURRENCE_ROW_FIELDS.map((field) => row[field]).join("\u001f");
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        deduped.push(row);
    }

    return {
        valid: rejectedRows.length === 0,
        rows: normalizeJlptOfficialOccurrenceEvidence({ occurrences: deduped }).occurrences,
        rejectedRows,
    };
}

function buildOccurrenceManifest(rows = []) {
    return normalizeJlptOfficialOccurrenceEvidence({
        version: 1,
        policy: {
            noDeckMutation: true,
            noAssignmentTruth: true,
            storeQuestionText: false,
            notes: "Official JLPT occurrence evidence stores only level, source PDF, section/page/question reference, and observed kanji. It is not assignment truth.",
        },
        occurrences: rows,
    });
}

function summarizeByLevel(rows = []) {
    const counts = Object.fromEntries(LEVEL_ORDER.map((level) => [level, {
        occurrenceRows: 0,
        uniqueKanji: 0,
    }]));
    const uniqueByLevel = Object.fromEntries(LEVEL_ORDER.map((level) => [level, new Set()]));

    for (const row of rows) {
        if (!counts[row.level]) {
            counts[row.level] = { occurrenceRows: 0, uniqueKanji: 0 };
            uniqueByLevel[row.level] = new Set();
        }
        counts[row.level].occurrenceRows += 1;
        uniqueByLevel[row.level].add(row.observedKanji);
    }

    for (const [level, unique] of Object.entries(uniqueByLevel)) {
        counts[level].uniqueKanji = unique.size;
    }

    return counts;
}

function buildOfficialOccurrenceReport({ rows = [], contract = {} } = {}) {
    const manifest = buildOccurrenceManifest(rows);
    const contractKanjiSet = new Set(Object.keys(contract.kanjiLevels || {}));
    const uniqueKanji = new Set(manifest.occurrences.map((row) => row.observedKanji));
    const sourcePdfs = new Set(manifest.occurrences.map((row) => row.sourcePdf));
    const outsideContract = manifest.occurrences
        .filter((row) => contractKanjiSet.size > 0 && !contractKanjiSet.has(row.observedKanji))
        .map((row) => ({
            level: row.level,
            sourcePdf: row.sourcePdf,
            page: row.page,
            questionRef: row.questionRef,
            observedKanji: row.observedKanji,
        }));

    return {
        valid: true,
        noDeckMutation: manifest.policy.noDeckMutation,
        noAssignmentTruth: manifest.policy.noAssignmentTruth,
        storeQuestionText: manifest.policy.storeQuestionText,
        storedFields: OFFICIAL_OCCURRENCE_ROW_FIELDS,
        occurrenceRowCount: manifest.occurrences.length,
        uniqueKanjiCount: uniqueKanji.size,
        sourcePdfCount: sourcePdfs.size,
        byLevel: summarizeByLevel(manifest.occurrences),
        outsideContractCount: outsideContract.length,
        outsideContract,
        assignmentCount: 0,
    };
}

function formatOfficialOccurrenceTsv(rows = []) {
    const manifest = buildOccurrenceManifest(rows);
    return [
        OFFICIAL_OCCURRENCE_ROW_FIELDS.join("\t"),
        ...manifest.occurrences.map((row) => (
            OFFICIAL_OCCURRENCE_ROW_FIELDS.map((field) => String(row[field] ?? "")
                .replace(/\r?\n/g, " ")
                .replace(/\t/g, " ")).join("\t")
        )),
    ].join("\n") + "\n";
}

function parseOccurrenceSourceRows(text, format = "tsv") {
    return parseSourceAssignmentRows(text, format);
}

module.exports = {
    DISALLOWED_OUTPUT_FIELDS,
    INPUT_TEXT_FIELDS,
    buildOccurrenceManifest,
    buildOfficialOccurrenceExtraction,
    buildOfficialOccurrenceReport,
    buildOccurrenceRowsForInputRow,
    extractObservedKanjiFromText,
    formatOfficialOccurrenceTsv,
    normalizeJlptLevel,
    parseOccurrenceSourceRows,
    parseObservedKanjiCell,
};
